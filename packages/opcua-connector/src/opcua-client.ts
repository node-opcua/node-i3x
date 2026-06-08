// ─────────────────────────────────────────────────────────────
// @i3x/opcua-connector — node-opcua client wrapper
// ─────────────────────────────────────────────────────────────

import {
  OPCUAClient,
  MessageSecurityMode,
  type ClientSession,
  ClientSubscription,
  ClientMonitoredItem,
  TimestampsToReturn,
  BrowseDirection,
  AttributeIds,
  DataType,
  type DataValue,
  type ReferenceDescription,
  coerceNodeId,
  resolveNodeId,
  Variant,
  NodeClass,
  StatusCodes,
  type WriteValue,
  type CallMethodRequest,
  type ReadValueIdOptions,
  browseAll,
} from 'node-opcua';
import type {
  ILogger,
  SourceNodeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  NamespaceInfo,
  ObjectTypeInfo,
  IMonitoredSubscription,
  DataChangeCallback,
  MonitoredSubscriptionOptions,
} from '@i3x/core';
import type { OpcUaClientOptions } from './opcua-types.js';
import { wrapSessionIfOptimized } from './optimized.js';
import {
  refToSourceNode,
  dataValueToSource,
  dataValueToHistorical,
} from './opcua-mapper.js';

const SECURITY_MODES: Record<string, MessageSecurityMode> = {
  None: MessageSecurityMode.None,
  Sign: MessageSecurityMode.Sign,
  SignAndEncrypt: MessageSecurityMode.SignAndEncrypt,
};

export class OpcUaClient {
  private _client: OPCUAClient | null = null;
  private _session: ClientSession | null = null;
  private readonly _opts: Required<OpcUaClientOptions>;

  constructor(opts: OpcUaClientOptions, private readonly logger: ILogger) {
    this._opts = {
      endpointUrl: opts.endpointUrl,
      securityMode: opts.securityMode ?? 'None',
      applicationName: opts.applicationName ?? 'node-i3x',
      optimizedClient: opts.optimizedClient ?? 'auto',
      browseStrategy: opts.browseStrategy ?? 'parallel',
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async connect(): Promise<void> {
    const securityMode = SECURITY_MODES[this._opts.securityMode]
      ?? MessageSecurityMode.None;

    this._client = OPCUAClient.create({
      applicationName: this._opts.applicationName,
      securityMode,
      connectionStrategy: {
        initialDelay: 1000,
        maxDelay: 30_000,
        maxRetry: Infinity,
      },
      keepSessionAlive: true,
      endpointMustExist: false,
    });

    this._client.on('backoff', (count: number, delay: number) => {
      this.logger.warn(`Connection backoff #${count}, retrying in ${delay}ms`);
    });
    this._client.on('connection_reestablished', () => {
      this.logger.info('OPC UA connection re-established');
    });

    this.logger.info(`Connecting to ${this._opts.endpointUrl}...`);
    await this._client.connect(this._opts.endpointUrl);

    let session = await this._client.createSession();

    // ━━━ @sterfive/opcua-optimized-client ━━━━━━━━━━━━━━━━━━━
    // Wrap session with ClientSessionOptimized if available.
    // This is a transparent drop-in that adds auto-batching,
    // limit-splitting, operation coalescing, and hold-resume.
    if (this._opts.optimizedClient !== 'disabled') {
      session = await wrapSessionIfOptimized(session, this.logger);
    }

    this._session = session;
    this.logger.info('OPC UA session created');
  }

  async disconnect(): Promise<void> {
    if (this._session) {
      try { await this._session.close(); } catch { /* best effort */ }
      this._session = null;
    }
    if (this._client) {
      try { await this._client.disconnect(); } catch { /* best effort */ }
      this._client = null;
    }
    this.logger.info('OPC UA disconnected');
  }

  isConnected(): boolean {
    return this._session !== null && !this._session.isReconnecting;
  }

  private get session(): ClientSession {
    if (!this._session) throw new Error('OPC UA session not connected');
    return this._session;
  }

  // ── Browse ──────────────────────────────────────────────────
  //
  // Two strategies:
  //   'parallel'  — browse() + browseNext() per node, entire BFS
  //                 wave in Promise.all.  18x faster.
  //   'browseAll' — node-opcua browseAll() handles continuation
  //                 points but serializes all operations.

  private _makeBrowseDescriptions(nodeIds: string[]) {
    return nodeIds.map((nodeId) => ({
      nodeId: coerceNodeId(nodeId),
      browseDirection: BrowseDirection.Forward,
      includeSubtypes: true,
      referenceTypeId: resolveNodeId('HierarchicalReferences'),
      resultMask: 63,
      requestedMaxReferencesPerNode: 0,
    }));
  }

  /**
   * Browse a single node, following continuation points.
   * Returns all references plus the number of OPC UA
   * transactions consumed (1 browse + N browseNext).
   */
  private async _browseSingleNode(
    nodeId: string,
  ): Promise<{ refs: ReferenceDescription[]; txCount: number }> {
    const desc = this._makeBrowseDescriptions([nodeId])[0]!;
    const result = await this.session.browse(desc);
    const refs: ReferenceDescription[] = [
      ...(result.references ?? []),
    ];
    let txCount = 1;

    let cp = result.continuationPoint;
    while (cp) {
      const next = await this.session.browseNext(cp, false);
      txCount++;
      refs.push(...(next.references ?? []));
      cp = next.continuationPoint;
    }
    return { refs, txCount };
  }

  /**
   * Generic BFS browse over the address space.
   *
   * @param seedNodeId   Starting folder node id
   * @param onRef        Called for each discovered reference.
   *                     Return a value to collect it; null to skip.
   * @param shouldRecurse  Return true to recurse into this child.
   */
  private async _bfsBrowse<T>(
    seedNodeId: string,
    onRef: (ref: ReferenceDescription, parentNodeId: string | null) => T | null,
    shouldRecurse?: (ref: ReferenceDescription) => boolean,
  ): Promise<{ items: T[]; txCount: number; ms: number }> {
    const started = performance.now();
    const output: T[] = [];
    const visited = new Set<string>();
    let totalTx = 0;

    let frontier: Array<{ nodeId: string; parentId: string | null }> = [
      { nodeId: seedNodeId, parentId: null },
    ];

    const useParallel = this._opts.browseStrategy !== 'browseAll';

    while (frontier.length > 0) {
      const wave = frontier.filter((f) => !visited.has(f.nodeId));
      for (const item of wave) visited.add(item.nodeId);
      if (wave.length === 0) break;

      let waveResults: Array<{ refs: ReferenceDescription[]; txCount: number }>;

      if (useParallel) {
        waveResults = await Promise.all(
          wave.map((w) => this._browseSingleNode(w.nodeId)),
        );
      } else {
        const descriptions = this._makeBrowseDescriptions(
          wave.map((w) => w.nodeId),
        );
        const browseResults = await browseAll(this.session, descriptions);
        totalTx += 1;
        waveResults = browseResults.map((r) => ({
          refs: r.references ?? [],
          txCount: 0,
        }));
      }

      const nextFrontier: typeof frontier = [];
      for (let i = 0; i < wave.length; i++) {
        const item = wave[i]!;
        const { refs, txCount } = waveResults[i]!;
        totalTx += txCount;

        for (const ref of refs) {
          const childId = ref.nodeId.toString();
          if (visited.has(childId)) continue;

          const mapped = onRef(ref, item.nodeId);
          if (mapped !== null) output.push(mapped);

          if (!shouldRecurse || shouldRecurse(ref)) {
            nextFrontier.push({ nodeId: childId, parentId: item.nodeId });
          }
        }
      }
      frontier = nextFrontier;
    }

    return { items: output, txCount: totalTx, ms: performance.now() - started };
  }

  async browseTree(): Promise<SourceNodeInfo[]> {
    const objectsFolderId = resolveNodeId('ObjectsFolder').toString();

    const { items, txCount, ms } = await this._bfsBrowse<SourceNodeInfo>(
      objectsFolderId,
      (ref, parentNodeId) => {
        // Children of ObjectsFolder are roots (parentId = null)
        const effectiveParent =
          parentNodeId === objectsFolderId ? null : parentNodeId;
        return refToSourceNode(ref, effectiveParent);
      },
      (ref) =>
        ref.nodeClass === NodeClass.Object ||
        ref.nodeClass === NodeClass.Variable,
    );

    const strategy = this._opts.browseStrategy !== 'browseAll'
      ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse tree: ${items.length} nodes in ${ms.toFixed(0)}ms ` +
      `(strategy=${strategy}, transactions=${txCount})`,
    );
    return items;
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    const { items, txCount, ms } = await this._bfsBrowse<ObjectTypeInfo>(
      resolveNodeId('ObjectTypesFolder').toString(),
      (ref, parentNodeId) => ({
        sourceNodeId: ref.nodeId.toString(),
        parentSourceNodeId: parentNodeId,
        browseName: ref.browseName?.toString() ?? '',
        displayName: ref.displayName?.text ?? '',
      }),
      () => true,
    );

    const strategy = this._opts.browseStrategy !== 'browseAll'
      ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse object types: ${items.length} types in ${ms.toFixed(0)}ms ` +
      `(strategy=${strategy}, transactions=${txCount})`,
    );
    return items;
  }

  // ── Namespace ──────────────────────────────────────────────

  async getNamespaces(): Promise<NamespaceInfo[]> {
    const nsArrayNodeId = coerceNodeId('i=2255'); // Server_NamespaceArray
    const dv = await this.session.read({
      nodeId: nsArrayNodeId,
      attributeId: AttributeIds.Value,
    });
    const uris: string[] = dv.value?.value ?? [];
    return uris.map((uri, idx) => ({
      uri,
      displayName: uri.split('/').pop() ?? `ns${idx}`,
    }));
  }

  // ── Read / Write ───────────────────────────────────────────

  async readValue(nodeId: string): Promise<SourceDataValue> {
    const dv = await this.session.read({
      nodeId: coerceNodeId(nodeId),
      attributeId: AttributeIds.Value,
    });
    return dataValueToSource(dv);
  }

  async readValues(nodeIds: string[]): Promise<SourceDataValue[]> {
    if (nodeIds.length === 0) return [];
    const items: ReadValueIdOptions[] = nodeIds.map((id) => ({
      nodeId: coerceNodeId(id),
      attributeId: AttributeIds.Value,
    }));
    const dvs = await this.session.read(items);
    const arr = Array.isArray(dvs) ? dvs : [dvs];
    return arr.map(dataValueToSource);
  }

  async writeValue(nodeId: string, value: unknown): Promise<void> {
    const writeValue: WriteValue = {
      nodeId: coerceNodeId(nodeId),
      attributeId: AttributeIds.Value,
      value: {
        value: new Variant({ dataType: DataType.Null, value }),
      },
    } as WriteValue;
    const result = await this.session.write(writeValue);
    const code = Array.isArray(result) ? result[0] : result;
    if (code && !code.equals(StatusCodes.Good)) {
      throw new Error(`Write failed: ${code.toString()}`);
    }
  }

  // ── History ────────────────────────────────────────────────

  async readHistory(
    nodeId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<SourceHistoricalValue[]> {
    const result = await this.session.readHistoryValue(
      coerceNodeId(nodeId),
      startTime,
      endTime,
    );
    const dataValues: DataValue[] =
      (result as Record<string, unknown>).historyData
        ? ((result as Record<string, { dataValues?: DataValue[] }>).historyData?.dataValues ?? [])
        : [];
    return dataValues.map(dataValueToHistorical);
  }

  // ── Method call ────────────────────────────────────────────

  async callMethod(
    objectNodeId: string,
    methodNodeId: string,
    args: unknown[],
  ): Promise<unknown> {
    const request: CallMethodRequest = {
      objectId: coerceNodeId(objectNodeId),
      methodId: coerceNodeId(methodNodeId),
      inputArguments: args.map((a) =>
        new Variant({ dataType: DataType.Null, value: a }),
      ),
    } as CallMethodRequest;
    const result = await this.session.call(request);
    return (result as Record<string, unknown>).outputArguments ?? null;
  }

  // ── Subscriptions ──────────────────────────────────────────

  async createMonitoredSubscription(
    options: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    const sub = ClientSubscription.create(this.session, {
      requestedPublishingInterval: options.publishingIntervalMs,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 0,
      publishingEnabled: true,
      priority: 10,
    });

    let dataChangeCb: DataChangeCallback | null = null;
    const monitored = new Map<string, ClientMonitoredItem>();
    const subId = `opcua-sub-${Date.now()}`;

    const wrapper: IMonitoredSubscription = {
      id: subId,

      async addItems(sourceNodeIds: string[]): Promise<void> {
        const newIds = sourceNodeIds.filter((id) => !monitored.has(id));
        if (newIds.length === 0) return;

        // Create all monitored items in parallel
        const items = await Promise.all(
          newIds.map((nodeId) =>
            ClientMonitoredItem.create(
              sub,
              {
                nodeId: coerceNodeId(nodeId),
                attributeId: AttributeIds.Value,
              },
              {
                samplingInterval: options.publishingIntervalMs,
                discardOldest: true,
                queueSize: 10,
              },
              TimestampsToReturn.Both,
            ),
          ),
        );

        for (let i = 0; i < newIds.length; i++) {
          const nodeId = newIds[i]!;
          const item = items[i]!;
          item.on('changed', (dv: DataValue) => {
            if (dataChangeCb) {
              const mapped = dataValueToSource(dv);
              dataChangeCb(nodeId, mapped.value, mapped.quality, mapped.timestamp);
            }
          });
          monitored.set(nodeId, item);
        }
      },

      async removeItems(sourceNodeIds: string[]): Promise<void> {
        const toRemove = sourceNodeIds
          .map((id) => ({ id, item: monitored.get(id) }))
          .filter((e) => e.item != null);

        // Terminate all in parallel
        await Promise.all(
          toRemove.map(({ id, item }) => {
            monitored.delete(id);
            return item!.terminate().catch(() => { /* best effort */ });
          }),
        );
      },

      onDataChange(cb: DataChangeCallback): void {
        dataChangeCb = cb;
      },

      async close(): Promise<void> {
        try { await sub.terminate(); } catch { /* best effort */ }
        monitored.clear();
      },
    };

    return wrapper;
  }
}
