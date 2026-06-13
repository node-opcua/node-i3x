// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — node-opcua client wrapper
// ─────────────────────────────────────────────────────────────

import type {
  DataChangeCallback,
  ILogger,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  ObjectTypeMemberInfo,
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '@node-i3x/core';
import {
  AttributeIds,
  BrowseDirection,
  browseAll,
  type CallMethodRequest,
  type ClientMonitoredItem,
  type ClientSession,
  coerceNodeId,
  DataType,
  type DataValue,
  MessageSecurityMode,
  NodeClass,
  OPCUAClient,
  type ReadValueIdOptions,
  type ReferenceDescription,
  resolveNodeId,
  StatusCodes,
  TimestampsToReturn,
  UserTokenType,
  Variant,
  type WriteValue,
} from 'node-opcua';
import {
  dataValueToHistorical,
  dataValueToSource,
  refToSourceNode,
} from './opcua-mapper.js';
import type { OpcUaClientOptions } from './opcua-types.js';
import { wrapSessionIfOptimized } from './optimized.js';

const SECURITY_MODES: Record<string, MessageSecurityMode> = {
  None: MessageSecurityMode.None,
  Sign: MessageSecurityMode.Sign,
  SignAndEncrypt: MessageSecurityMode.SignAndEncrypt,
};

export class OpcUaClient {
  private _client: OPCUAClient | null = null;
  private _session: ClientSession | null = null;
  private _namespaceArray: string[] = [];
  private readonly _opts: Required<
    Pick<
      OpcUaClientOptions,
      | 'endpointUrl'
      | 'securityMode'
      | 'applicationName'
      | 'optimizedClient'
      | 'browseStrategy'
      | 'browseFilter'
    >
  > &
    Pick<OpcUaClientOptions, 'username' | 'password'>;

  constructor(
    opts: OpcUaClientOptions,
    private readonly logger: ILogger,
  ) {
    this._opts = {
      endpointUrl: opts.endpointUrl,
      securityMode: opts.securityMode ?? 'None',
      applicationName: opts.applicationName ?? 'node-i3x',
      optimizedClient: opts.optimizedClient ?? 'auto',
      browseStrategy: opts.browseStrategy ?? 'parallel',
      browseFilter: opts.browseFilter ?? 'application-only',
      username: opts.username,
      password: opts.password,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async connect(): Promise<void> {
    const securityMode =
      SECURITY_MODES[this._opts.securityMode] ?? MessageSecurityMode.None;

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

    const userIdentity =
      this._opts.username && this._opts.password
        ? {
            type: UserTokenType.UserName as const,
            userName: this._opts.username,
            password: this._opts.password,
          }
        : undefined;
    let session = await this._client.createSession(userIdentity);

    // ━━━ @sterfive/opcua-optimized-client ━━━━━━━━━━━━━━━━━━━
    // Wrap session with ClientSessionOptimized if available.
    // Both the optimized and standard sessions support
    // createSubscription2 + monitor — no raw session needed.
    if (this._opts.optimizedClient !== 'disabled') {
      session = await wrapSessionIfOptimized(session, this.logger);
    }

    this._session = session;

    // Cache namespace array for nsu-qualified browse names
    const nsArrayDv = await session.read({
      nodeId: coerceNodeId('i=2255'),
      attributeId: AttributeIds.Value,
    });
    this._namespaceArray = nsArrayDv.value?.value ?? [];
    this.logger.info('OPC UA session created');
  }

  async disconnect(): Promise<void> {
    if (this._session) {
      try {
        await this._session.close();
      } catch {
        /* best effort */
      }
      this._session = null;
    }
    if (this._client) {
      try {
        await this._client.disconnect();
      } catch {
        /* best effort */
      }
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
    const refs: ReferenceDescription[] = [...(result.references ?? [])];
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
    shouldRecurse?: (ref: ReferenceDescription, parentNodeId: string) => boolean,
  ): Promise<{ items: T[]; txCount: number; ms: number }> {
    const started = performance.now();
    const output: T[] = [];
    const visited = new Set<string>();
    let totalTx = 0;

    let frontier: Array<{ nodeId: string; parentId: string | null }> = [
      { nodeId: seedNodeId, parentId: null },
    ];

    const useParallel = this._opts.browseStrategy !== 'browseAll';
    /** Tracks nodes already mapped via onRef to prevent duplicates. */
    const mapped = new Set<string>();

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
        const descriptions = this._makeBrowseDescriptions(wave.map((w) => w.nodeId));
        const browseResults = await browseAll(this.session, descriptions);
        totalTx += 1;
        waveResults = browseResults.map((r) => ({
          refs: r.references ?? [],
          txCount: 0,
        }));
      }

      const nextFrontier: typeof frontier = [];
      /** Tracks nodes already queued in nextFrontier this wave. */
      const queued = new Set<string>();
      for (let i = 0; i < wave.length; i++) {
        const item = wave[i]!;
        const { refs, txCount } = waveResults[i]!;
        totalTx += txCount;

        for (const ref of refs) {
          const childId = ref.nodeId.toString();
          if (visited.has(childId)) continue;

          // Only map each child once (prevents duplicate elementIds)
          if (!mapped.has(childId)) {
            mapped.add(childId);
            const m = onRef(ref, item.nodeId);
            if (m !== null) output.push(m);
          }

          if (!shouldRecurse || shouldRecurse(ref, item.nodeId)) {
            if (!queued.has(childId)) {
              queued.add(childId);
              nextFrontier.push({ nodeId: childId, parentId: item.nodeId });
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    return { items: output, txCount: totalTx, ms: performance.now() - started };
  }

  async browseTree(): Promise<SourceNodeInfo[]> {
    const objectsFolderId = resolveNodeId('ObjectsFolder').toString();
    const filter = this._opts.browseFilter ?? 'application-only';

    const { items, txCount, ms } = await this._bfsBrowse<SourceNodeInfo>(
      objectsFolderId,
      (ref, parentNodeId) => {
        // Children of ObjectsFolder are roots (parentId = null)
        const effectiveParent = parentNodeId === objectsFolderId ? null : parentNodeId;
        return refToSourceNode(ref, effectiveParent, this._namespaceArray);
      },
      (ref, parentNodeId) => {
        if (ref.nodeClass !== NodeClass.Object && ref.nodeClass !== NodeClass.Variable) {
          return false;
        }
        // Apply browse filter for top-level children of ObjectsFolder
        if (parentNodeId === objectsFolderId) {
          if (filter === 'all') return true;
          if (filter === 'application-only') {
            return (ref.browseName?.namespaceIndex ?? 0) !== 0;
          }
          // Explicit list: match by NodeId or BrowseName
          const nodeId = ref.nodeId.toString();
          const name = ref.browseName?.name ?? '';
          return filter.some((f) => f === nodeId || f === name);
        }
        return true;
      },
    );

    const strategy = this._opts.browseStrategy !== 'browseAll' ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse tree: ${items.length} nodes in ${ms.toFixed(0)}ms ` +
        `(strategy=${strategy}, transactions=${txCount})`,
    );
    return items;
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    const { items, txCount, ms } = await this._bfsBrowse<ObjectTypeInfo>(
      resolveNodeId('ObjectTypesFolder').toString(),
      (ref, parentNodeId) => {
        const nsIdx = ref.browseName?.namespaceIndex ?? 0;
        const nsUri = this._namespaceArray[nsIdx] ?? '';
        return {
          sourceNodeId: ref.nodeId.toString(),
          parentSourceNodeId: parentNodeId,
          browseName: ref.browseName?.toString() ?? '',
          displayName: ref.displayName?.text ?? '',
          namespaceUri: nsUri,
        };
      },
      () => true,
    );

    const strategy = this._opts.browseStrategy !== 'browseAll' ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse object types: ${items.length} types in ${ms.toFixed(0)}ms ` +
        `(strategy=${strategy}, transactions=${txCount})`,
    );

    // Enrich each type with its direct members.
    // Skip standard OPC UA types (ns=0) to avoid timeout.
    // Run all enrichments in parallel — the optimized client
    // coalesces concurrent requests into batched OPC UA calls.
    // Use a visited set to guard against cycles / duplicates.
    const enrichStart = performance.now();
    const visited = new Set<string>();
    const stdTypes: ObjectTypeInfo[] = [];
    const nonStdTypes: ObjectTypeInfo[] = [];

    for (const type of items) {
      if (visited.has(type.sourceNodeId)) continue;
      visited.add(type.sourceNodeId);
      if (type.sourceNodeId.startsWith('ns=0;')) {
        stdTypes.push(type);
      } else {
        nonStdTypes.push(type);
      }
    }

    const memberResults = await Promise.all(
      nonStdTypes.map((type) =>
        this._browseTypeMembers(type.sourceNodeId).then(
          (members) => ({ ...type, members }),
          () => type, // on error, keep type without members
        ),
      ),
    );

    const enriched = [...stdTypes, ...memberResults];
    const enrichMs = performance.now() - enrichStart;
    this.logger.info(
      `Enriched ${nonStdTypes.length} types with members in ` +
        `${enrichMs.toFixed(0)}ms`,
    );
    return enriched;
  }

  /**
   * Browse the direct children of an ObjectType node to discover
   * its member Variables/Properties (for JSON Schema generation).
   */
  private async _browseTypeMembers(typeNodeId: string): Promise<ObjectTypeMemberInfo[]> {
    const { refs } = await this._browseSingleNode(typeNodeId);
    const members: ObjectTypeMemberInfo[] = [];

    // Collect Variable member nodeIds for batch DataType read
    const variableRefs: ReferenceDescription[] = [];
    for (const ref of refs) {
      if (
        ref.nodeClass !== NodeClass.Variable &&
        ref.nodeClass !== NodeClass.Object &&
        ref.nodeClass !== NodeClass.Method
      )
        continue;

      if (ref.nodeClass === NodeClass.Variable) {
        variableRefs.push(ref);
      }
    }

    // Batch-read DataType for all Variable members
    const dataTypeMap = new Map<string, string | null>();
    if (variableRefs.length > 0) {
      const readItems: ReadValueIdOptions[] = variableRefs.map((ref) => ({
        nodeId: ref.nodeId,
        attributeId: AttributeIds.DataType,
      }));
      try {
        const dvs = await this.session.read(readItems);
        const arr = Array.isArray(dvs) ? dvs : [dvs];
        for (let i = 0; i < variableRefs.length; i++) {
          const childId = variableRefs[i]!.nodeId.toString();
          const dtValue = arr[i]?.value?.value;
          dataTypeMap.set(childId, dtValue ? dtValue.toString() : null);
        }
      } catch {
        // ignore
      }
    }

    // Browse ModellingRule for all members
    const modellingRuleMap = new Map<string, string | null>();
    const memberRefs = refs.filter(
      (r) =>
        r.nodeClass === NodeClass.Variable ||
        r.nodeClass === NodeClass.Object ||
        r.nodeClass === NodeClass.Method,
    );
    if (memberRefs.length > 0) {
      const mrDescriptions = memberRefs.map((ref) => ({
        nodeId: ref.nodeId,
        browseDirection: BrowseDirection.Forward,
        includeSubtypes: true,
        referenceTypeId: resolveNodeId('HasModellingRule'),
        resultMask: 63,
        requestedMaxReferencesPerNode: 0,
      }));
      try {
        const mrResults = await browseAll(this.session, mrDescriptions);
        for (let i = 0; i < memberRefs.length; i++) {
          const childId = memberRefs[i]!.nodeId.toString();
          const mrRef = mrResults[i]?.references?.[0];
          modellingRuleMap.set(childId, mrRef?.displayName?.text ?? null);
        }
      } catch {
        // ignore
      }
    }

    for (const ref of memberRefs) {
      const childId = ref.nodeId.toString();
      members.push({
        browseName: ref.browseName?.name ?? ref.browseName?.toString() ?? '',
        displayName: ref.displayName?.text ?? '',
        nodeClass:
          ref.nodeClass === NodeClass.Variable
            ? 'Variable'
            : ref.nodeClass === NodeClass.Object
              ? 'Object'
              : 'Method',
        dataType: dataTypeMap.get(childId) ?? null,
        modellingRule: modellingRuleMap.get(childId) ?? null,
      });
    }
    return members;
  }

  // ── Namespace ──────────────────────────────────────────────

  async getNamespaces(): Promise<NamespaceInfo[]> {
    return this._namespaceArray.map((uri, idx) => ({
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
    const nid = coerceNodeId(nodeId);

    // ── Step 1: Read the variable's declared DataType ──────────
    const readResults = await this.session.read([
      { nodeId: nid, attributeId: AttributeIds.DataType },
      { nodeId: nid, attributeId: AttributeIds.Value },
    ]);
    const dvArr = Array.isArray(readResults) ? readResults : [readResults];
    const dataTypeNodeId = dvArr[0]?.value?.value;
    const currentDataValue = dvArr[1];

    // Resolve the DataType enum from the DataType NodeId
    let targetDataType = DataType.Null;
    if (dataTypeNodeId) {
      const dtNum =
        typeof dataTypeNodeId === 'object'
          ? (dataTypeNodeId.value ?? 0)
          : Number(dataTypeNodeId);
      // node-opcua DataType enum values map 1:1 with the
      // DataType NodeId identifiers for built-in types (1..25)
      if (dtNum >= 1 && dtNum <= 25) {
        targetDataType = dtNum as DataType;
      } else {
        // For non-built-in types, try to use the current value's type
        if (currentDataValue?.value?.value !== undefined) {
          targetDataType = currentDataValue.value.dataType ?? DataType.Null;
        }
      }
    }

    // ── Step 2: Coerce the JSON value to the target DataType ──
    let coercedValue: unknown = value;
    try {
      coercedValue = this._coerceToDataType(value, targetDataType);
    } catch (coerceErr) {
      const msg =
        `Write coercion failed for ${nodeId}: ` +
        `targetDataType=${DataType[targetDataType]}(${targetDataType}) ` +
        `jsType=${typeof value} jsValue=${JSON.stringify(value)} ` +
        `error=${coerceErr}`;
      this.logger.warn(msg);
      throw new Error(msg);
    }

    // ── Step 3: Write ─────────────────────────────────────────
    const writeVal: WriteValue = {
      nodeId: nid,
      attributeId: AttributeIds.Value,
      value: {
        value: new Variant({
          dataType:
            targetDataType !== DataType.Null
              ? targetDataType
              : this._inferDataType(coercedValue),
          value: coercedValue,
        }),
      },
    } as WriteValue;

    this.logger.debug(
      `writeValue: nodeId=${nodeId} ` +
        `targetDataType=${DataType[targetDataType]} ` +
        `jsType=${typeof value} → coerced=${JSON.stringify(coercedValue)}`,
    );

    const result = await this.session.write(writeVal);
    const code = Array.isArray(result) ? result[0] : result;
    if (code && !code.equals(StatusCodes.Good)) {
      const errMsg =
        `Write failed: ${code.toString()} | ` +
        `nodeId=${nodeId} ` +
        `targetDataType=${DataType[targetDataType]}(${targetDataType}) ` +
        `inputValue=${JSON.stringify(value)} (${typeof value}) ` +
        `coercedValue=${JSON.stringify(coercedValue)} (${typeof coercedValue})`;
      this.logger.warn(errMsg);
      throw new Error(errMsg);
    }
  }

  /**
   * Coerce a JSON value to the expected OPC UA DataType.
   * Handles the common built-in types (1..25).
   */
  private _coerceToDataType(value: unknown, dt: DataType): unknown {
    switch (dt) {
      // Boolean (1)
      case DataType.Boolean:
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string')
          return value.toLowerCase() === 'true' || value === '1';
        return Boolean(value);

      // Integer types (2-9)
      case DataType.SByte:
      case DataType.Byte:
      case DataType.Int16:
      case DataType.UInt16:
      case DataType.Int32:
      case DataType.UInt32:
        return Math.trunc(Number(value));

      case DataType.Int64:
      case DataType.UInt64:
        // node-opcua uses [high, low] arrays for 64-bit integers
        if (Array.isArray(value)) return value;
        return [0, Math.trunc(Number(value))];

      // Floating point (10-11)
      case DataType.Float:
      case DataType.Double:
        return Number(value);

      // String (12)
      case DataType.String:
        return String(value);

      // DateTime (13)
      case DataType.DateTime:
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
          return new Date(value);
        }
        return value;

      // ByteString (15)
      case DataType.ByteString:
        if (Buffer.isBuffer(value)) return value;
        if (typeof value === 'string') return Buffer.from(value, 'base64');
        return value;

      // Null or unknown — return as-is
      case DataType.Null:
      default:
        return value;
    }
  }

  /** Fallback: infer DataType from JS value when server type is unknown. */
  private _inferDataType(value: unknown): DataType {
    if (typeof value === 'number') return DataType.Double;
    if (typeof value === 'boolean') return DataType.Boolean;
    if (typeof value === 'string') return DataType.String;
    if (value instanceof Date) return DataType.DateTime;
    return DataType.Null;
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
    const resultAny = result as unknown as Record<string, { dataValues?: DataValue[] }>;
    const dataValues: DataValue[] = resultAny.historyData
      ? (resultAny.historyData?.dataValues ?? [])
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
      inputArguments: args.map((a) => new Variant({ dataType: DataType.Null, value: a })),
    } as CallMethodRequest;
    const result = await this.session.call(request);
    return (result as unknown as Record<string, unknown>).outputArguments ?? null;
  }

  // ── Subscriptions ──────────────────────────────────────────

  async createMonitoredSubscription(
    options: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    // createSubscription2 works on both the standard session
    // and ClientSessionOptimized (which returns ClientSubscription2).
    const sub = await this.session.createSubscription2({
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
    const logger = this.logger;

    logger.info(
      `OPC UA CreateSubscription id=${subId} ` +
        `publishingInterval=${options.publishingIntervalMs}ms`,
    );

    const wrapper: IMonitoredSubscription = {
      id: subId,

      async addItems(sourceNodeIds: string[]): Promise<void> {
        const newIds = sourceNodeIds.filter((id) => !monitored.has(id));
        if (newIds.length === 0) return;

        // sub.monitor() works with both ClientSubscription
        // and ClientSubscription2 (optimized client).
        const items = await Promise.all(
          newIds.map((nodeId) =>
            sub.monitor(
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
        logger.info(
          `OPC UA CreateMonitoredItems: ${newIds.length} items added ` +
            `(total=${monitored.size})`,
        );
      },

      async removeItems(sourceNodeIds: string[]): Promise<void> {
        const toRemove = sourceNodeIds
          .map((id) => ({ id, item: monitored.get(id) }))
          .filter((e) => e.item != null);

        // Terminate all in parallel
        await Promise.all(
          toRemove.map(({ id, item }) => {
            monitored.delete(id);
            return item!.terminate().catch(() => {
              /* best effort */
            });
          }),
        );
      },

      onDataChange(cb: DataChangeCallback): void {
        dataChangeCb = cb;
      },

      async close(): Promise<void> {
        try {
          await sub.terminate();
        } catch {
          /* best effort */
        }
        monitored.clear();
      },
    };

    return wrapper;
  }
}
