// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — node-opcua client wrapper
// ─────────────────────────────────────────────────────────────

import os from 'node:os';

import {
  type DataChangeCallback,
  dataValueToHistorical,
  dataValueToSource,
  type ILogger,
  type IMonitoredSubscription,
  type MonitoredSubscriptionOptions,
  type NamespaceInfo,
  type ObjectTypeInfo,
  type ObjectTypeMemberInfo,
  type SourceDataValue,
  type SourceHistoricalValue,
  type SourceNodeInfo,
  toNsuNodeId,
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
import type { OPCUACertificateManager } from 'node-opcua-certificate-manager';
import { coerceSecurityPolicy } from 'node-opcua-secure-channel';
import { createCertificateManager } from './certificate-manager.js';
import { coerceToDataType, inferDataType } from './data-type-coercer.js';
import {
  coerceMessageSecurityMode,
  coercePolicyToUri,
  discoverBestEndpoint,
  type EndpointLike,
  selectBestEndpoint,
} from './endpoint-discovery.js';
import { refToSourceNode } from './opcua-mapper.js';
import type { OpcUaClientOptions } from './opcua-types.js';
import { wrapSessionIfOptimized } from './optimized.js';

const RESULT_MASK_ALL = 63;
const NAMESPACE_ARRAY_NODE_ID = 'i=2255';

/** Requested lifetime count for OPC UA subscriptions. */
const SUBSCRIPTION_LIFETIME_COUNT = 100;
/** Requested keep-alive count for OPC UA subscriptions. */
const SUBSCRIPTION_KEEPALIVE_COUNT = 10;
/** Queue size for monitored items in subscriptions. */
const MONITORED_ITEM_QUEUE_SIZE = 10;
/** Priority level for OPC UA subscriptions. */
const SUBSCRIPTION_PRIORITY = 10;

/**
 * Number of ObjectType nodes enriched concurrently with their
 * member definitions.  200 balances parallelism against server
 * load — the optimized client coalesces concurrent calls within
 * each chunk into fewer wire-level OPC UA requests, so larger
 * chunks improve throughput without overloading the server.
 */
const ENRICH_CHUNK_SIZE = 200;

// Re-export EndpointLike so existing consumers keep working
export type { EndpointLike };

/** OPC UA session-level traffic statistics */
export interface OpcuaStats {
  transactionsPerformed: number;
  bytesRead: number;
  bytesWritten: number;
  services: {
    browse: number;
    read: number;
    write: number;
    translate: number;
    subscribe: number;
    call: number;
    readHistory: number;
  };
}

function validateOpcUaClientOptions(opts: OpcUaClientOptions): void {
  if (!opts || typeof opts !== 'object') {
    throw new Error('OPC UA client options must be an object');
  }
  if (typeof opts.endpointUrl !== 'string' || !opts.endpointUrl.trim()) {
    throw new Error('OPC UA endpointUrl must be a non-empty string');
  }
  if (!opts.endpointUrl.startsWith('opc.tcp://')) {
    throw new Error('OPC UA endpointUrl must start with "opc.tcp://"');
  }
  if (
    opts.securityMode !== undefined &&
    !['None', 'Sign', 'SignAndEncrypt', 'Auto'].includes(opts.securityMode)
  ) {
    throw new Error(
      `OPC UA securityMode must be "None", "Sign", "SignAndEncrypt", or "Auto", got "${opts.securityMode}"`,
    );
  }
  if (
    opts.optimizedClient !== undefined &&
    !['auto', 'disabled'].includes(opts.optimizedClient)
  ) {
    throw new Error(
      `OPC UA optimizedClient must be "auto" or "disabled", got "${opts.optimizedClient}"`,
    );
  }
  if (
    opts.browseStrategy !== undefined &&
    !['parallel', 'browseAll'].includes(opts.browseStrategy)
  ) {
    throw new Error(
      `OPC UA browseStrategy must be "parallel" or "browseAll", got "${opts.browseStrategy}"`,
    );
  }
  if (opts.browseFilter !== undefined) {
    const filter = opts.browseFilter;
    if (filter !== 'application-only' && filter !== 'all' && !Array.isArray(filter)) {
      throw new Error(
        'OPC UA browseFilter must be "application-only", "all", or an array of string node IDs/browse names',
      );
    }
    if (Array.isArray(filter) && filter.some((item) => typeof item !== 'string')) {
      throw new Error('OPC UA browseFilter array must contain only strings');
    }
  }
  const stringFields: (keyof OpcUaClientOptions)[] = [
    'username',
    'password',
    'securityPolicy',
    'applicationName',
    'applicationUri',
    'pkiFolder',
    'certificateSubject',
  ];
  for (const field of stringFields) {
    if (opts[field] !== undefined && typeof opts[field] !== 'string') {
      throw new Error(`OPC UA ${field} must be a string`);
    }
  }
}

export class OpcUaClient {
  private _client: OPCUAClient | null = null;
  private _session: ClientSession | null = null;
  private _certificateManager: OPCUACertificateManager | null = null;
  private _namespaceArray: string[] = [];
  private _serviceCounters = {
    browse: 0,
    read: 0,
    write: 0,
    translate: 0,
    subscribe: 0,
    call: 0,
    readHistory: 0,
  };
  private readonly _opts: Required<
    Pick<
      OpcUaClientOptions,
      | 'endpointUrl'
      | 'securityMode'
      | 'securityPolicy'
      | 'applicationName'
      | 'optimizedClient'
      | 'browseStrategy'
      | 'browseFilter'
    >
  > &
    Pick<
      OpcUaClientOptions,
      'username' | 'password' | 'applicationUri' | 'pkiFolder' | 'certificateSubject'
    >;

  constructor(
    opts: OpcUaClientOptions,
    private readonly logger: ILogger,
  ) {
    validateOpcUaClientOptions(opts);
    this._opts = {
      endpointUrl: opts.endpointUrl,
      securityMode: opts.securityMode ?? 'Auto',
      securityPolicy: opts.securityPolicy ?? 'Auto',
      applicationName: opts.applicationName ?? 'node-i3x',
      optimizedClient: opts.optimizedClient ?? 'auto',
      browseStrategy: opts.browseStrategy ?? 'parallel',
      browseFilter: opts.browseFilter ?? 'application-only',
      username: opts.username,
      password: opts.password,
      applicationUri: opts.applicationUri,
      pkiFolder: opts.pkiFolder,
      certificateSubject: opts.certificateSubject,
    };
  }

  getStats(): OpcuaStats {
    return {
      transactionsPerformed: this._client?.transactionsPerformed ?? 0,
      bytesRead: this._client?.bytesRead ?? 0,
      bytesWritten: this._client?.bytesWritten ?? 0,
      services: { ...this._serviceCounters },
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async connect(): Promise<void> {
    // ── Certificate manager (dedicated PKI per instance) ────
    const certificateManager = await createCertificateManager(this._opts, this.logger);
    this._certificateManager = certificateManager;

    // ── Security mode / policy resolution ──────────────────
    let securityMode: MessageSecurityMode;
    let securityPolicy: string;

    this.logger.info(
      `Security configuration: mode='${this._opts.securityMode}', ` +
        `policy='${this._opts.securityPolicy}'`,
    );

    if (this._opts.securityMode === 'None') {
      // No security — policy is always None
      securityMode = MessageSecurityMode.None;
      securityPolicy = coerceSecurityPolicy('None');
      this.logger.info(`Using None/None (no security).`);
    } else if (
      this._opts.securityMode === 'Auto' &&
      this._opts.securityPolicy === 'Auto'
    ) {
      // Both auto-discovered — pick strongest combination
      this.logger.info('Auto/Auto: discovering best endpoint...');
      const best = await discoverBestEndpoint(this._opts.endpointUrl, this.logger);
      securityMode = best.securityMode;
      securityPolicy = best.securityPolicy;
    } else if (this._opts.securityMode === 'Auto') {
      // Auto mode + explicit policy — find the best mode
      // that supports the requested policy
      const policyUri = coercePolicyToUri(this._opts.securityPolicy);
      this.logger.info(
        `Auto mode + explicit policy: discovering best mode for ${policyUri}...`,
      );
      const best = await discoverBestEndpoint(
        this._opts.endpointUrl,
        this.logger,
        undefined,
        policyUri,
      );
      securityMode = best.securityMode;
      securityPolicy = best.securityPolicy;
    } else if (this._opts.securityPolicy === 'Auto') {
      // Explicit mode + auto policy — find the strongest
      // policy for the requested mode
      const explicitMode = coerceMessageSecurityMode(this._opts.securityMode);
      this.logger.info(
        `Explicit mode=${MessageSecurityMode[explicitMode]} ` +
          `(${explicitMode}) + auto policy: ` +
          `discovering best policy...`,
      );
      const best = await discoverBestEndpoint(
        this._opts.endpointUrl,
        this.logger,
        explicitMode,
      );
      securityMode = best.securityMode;
      securityPolicy = best.securityPolicy;
    } else {
      // Fully explicit — coerce both to node-opcua types
      securityMode = coerceMessageSecurityMode(this._opts.securityMode);
      securityPolicy = coercePolicyToUri(this._opts.securityPolicy);
      this.logger.info(
        `Fully explicit: mode=${MessageSecurityMode[securityMode]} ` +
          `(${securityMode}), policy=${securityPolicy}`,
      );
    }

    this.logger.info(
      `Resolved security: ` +
        `MessageSecurityMode=${MessageSecurityMode[securityMode]} ` +
        `(enum=${securityMode}), ` +
        `SecurityPolicy=${securityPolicy}`,
    );

    // ── Build applicationUri ───────────────────────────────
    const hostname = os.hostname();
    const applicationUri =
      this._opts.applicationUri ?? `urn:${hostname}:${this._opts.applicationName}`;

    // ── Create client ──────────────────────────────────────
    const clientOptions = {
      applicationName: this._opts.applicationName,
      applicationUri,
      securityMode,
      securityPolicy,
      clientCertificateManager: certificateManager,
      connectionStrategy: {
        initialDelay: 1000,
        maxDelay: 5_000,
        maxRetry: 2,
      },
      keepSessionAlive: true,
      endpointMustExist: false,
    };

    this.logger.info(
      `OPCUAClient.create parameters: ${JSON.stringify(
        clientOptions,
        (key, value) => {
          if (key === 'clientCertificateManager') {
            return value ? 'OPCUACertificateManager' : 'undefined';
          }
          return value;
        },
        2,
      )}`,
    );

    this._client = OPCUAClient.create(clientOptions);

    this._client.on('backoff', (count: number, delay: number) => {
      this.logger.warn(`Connection backoff #${count}, retrying in ${delay}ms`);
    });
    this._client.on('connection_reestablished', () => {
      this.logger.info('OPC UA connection re-established');
    });

    this.logger.info(
      `Connecting to ${this._opts.endpointUrl} ` +
        `(securityMode=${MessageSecurityMode[securityMode]}, ` +
        `securityPolicy=${securityPolicy})...`,
    );
    await this._client.connect(this._opts.endpointUrl);

    const userIdentity =
      this._opts.username && this._opts.password
        ? {
            type: UserTokenType.UserName as const,
            userName: this._opts.username,
            password: this._opts.password,
          }
        : undefined;

    const sessionParams = {
      userIdentity: userIdentity
        ? {
            type: UserTokenType[userIdentity.type] ?? userIdentity.type,
            userName: userIdentity.userName,
            password: '***',
          }
        : undefined,
    };
    this.logger.info(
      `OPCUAClient.createSession parameters: ${JSON.stringify(sessionParams, null, 2)}`,
    );

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
      nodeId: coerceNodeId(NAMESPACE_ARRAY_NODE_ID),
      attributeId: AttributeIds.Value,
    });
    this._namespaceArray = nsArrayDv.value?.value ?? [];
    this.logger.info('OPC UA session created');
  }

  async disconnect(): Promise<void> {
    if (this._session) {
      try {
        await this._session.close();
      } catch (err) {
        this.logger.debug(`best-effort session.close failed: ${(err as Error).message}`);
      }
      this._session = null;
    }
    if (this._client) {
      try {
        await this._client.disconnect();
      } catch (err) {
        this.logger.debug(
          `best-effort client.disconnect failed: ${(err as Error).message}`,
        );
      }
      this._client = null;
    }
    if (this._certificateManager) {
      try {
        await this._certificateManager.dispose();
      } catch (err) {
        this.logger.debug(
          `best-effort certificateManager.dispose failed: ${(err as Error).message}`,
        );
      }
      this._certificateManager = null;
    }
    this.logger.info('OPC UA disconnected');
  }

  // ── Endpoint selection (static, delegates to module) ─────

  /**
   * Select the best endpoint from a list of endpoint
   * descriptions.  Pure ranking logic extracted to
   * `endpoint-discovery.ts` for unit-testing.
   */
  static selectBestEndpoint = selectBestEndpoint;

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

  private _makeBrowseDescriptions(
    nodeIds: string[],
    referenceTypeId = resolveNodeId('HierarchicalReferences'),
  ) {
    return nodeIds.map((nodeId) => ({
      nodeId: coerceNodeId(nodeId),
      browseDirection: BrowseDirection.Forward,
      includeSubtypes: true,
      referenceTypeId,
      resultMask: RESULT_MASK_ALL,
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
    referenceTypeId?: ReturnType<typeof resolveNodeId>,
  ): Promise<{ refs: ReferenceDescription[]; txCount: number }> {
    const desc = this._makeBrowseDescriptions([nodeId], referenceTypeId)[0]!;
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
    referenceTypeId?: ReturnType<typeof resolveNodeId>,
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
          wave.map((w) => this._browseSingleNode(w.nodeId, referenceTypeId)),
        );
      } else {
        const descriptions = this._makeBrowseDescriptions(
          wave.map((w) => w.nodeId),
          referenceTypeId,
        );
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
    this._serviceCounters.browse++;
    const objectsFolderId = resolveNodeId('ObjectsFolder').toString();
    const filter = this._opts.browseFilter ?? 'application-only';

    const { items, txCount, ms } = await this._bfsBrowse<SourceNodeInfo>(
      objectsFolderId,
      (ref, parentNodeId) => {
        // Children of ObjectsFolder are roots (parentId = null)
        const effectiveParent = parentNodeId === objectsFolderId ? null : parentNodeId;
        // Apply browse filter for top-level children of ObjectsFolder
        if (parentNodeId === objectsFolderId) {
          if (
            filter === 'application-only' &&
            (ref.browseName?.namespaceIndex ?? 0) === 0
          ) {
            return null;
          }
          if (Array.isArray(filter)) {
            const nodeId = ref.nodeId.toString();
            const name = ref.browseName?.name ?? '';
            const matched = filter.some((f) => f === nodeId || f === name);
            if (!matched) return null;
          }
        }
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

    const variables = items.filter((item) => item.nodeClass === 'Variable');
    if (variables.length > 0) {
      const readItems = variables.map((v) => ({
        nodeId: v.sourceNodeId,
        attributeId: AttributeIds.DataType,
      }));
      try {
        const dvs = await this.session.read(readItems);
        const dvsArr = Array.isArray(dvs) ? dvs : [dvs];

        const uniqueDtIds = new Set<string>();
        for (let i = 0; i < variables.length; i++) {
          const rawDt = dvsArr[i]?.value?.value;
          if (rawDt) {
            uniqueDtIds.add(rawDt.toString());
          }
        }

        const uniqueDtIdsArr = Array.from(uniqueDtIds);
        const dtBrowseNames = new Map<string, string>();
        if (uniqueDtIdsArr.length > 0) {
          const readBrowseNames = uniqueDtIdsArr.map((id) => ({
            nodeId: id,
            attributeId: AttributeIds.BrowseName,
          }));
          const bnResults = await this.session.read(readBrowseNames);
          const bnResultsArr = Array.isArray(bnResults) ? bnResults : [bnResults];
          for (let i = 0; i < uniqueDtIdsArr.length; i++) {
            const bn = bnResultsArr[i]?.value?.value;
            if (bn && typeof bn.name === 'string') {
              dtBrowseNames.set(uniqueDtIdsArr[i]!, bn.name);
            }
          }
        }

        for (let i = 0; i < variables.length; i++) {
          const v = variables[i]!;
          const rawDt = dvsArr[i]?.value?.value;
          if (rawDt) {
            const rawDtStr = rawDt.toString();
            (v as any).dataType = toNsuNodeId(rawDtStr, this._namespaceArray);
            const name = dtBrowseNames.get(rawDtStr);
            if (name) {
              (v as any).dataTypeName = name;
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to batch-read Variable DataTypes: ${err}`);
      }
    }

    const strategy = this._opts.browseStrategy !== 'browseAll' ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse tree: ${items.length} nodes in ${ms.toFixed(0)}ms ` +
        `(strategy=${strategy}, transactions=${txCount})`,
    );
    return items;
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    this._serviceCounters.browse++;
    // Use HierarchicalReferences to navigate folders (Organizes)
    // and the subtype hierarchy (HasSubtype), but only collect
    // and recurse into ObjectType nodes. This prevents recursing
    // into type members (HasComponent → Variables/Objects) which
    // would explode the graph to 7000+ false "types".
    const { items, txCount, ms } = await this._bfsBrowse<ObjectTypeInfo>(
      resolveNodeId('ObjectTypesFolder').toString(),
      (ref, parentNodeId) => {
        // Only collect actual ObjectType nodes
        if (ref.nodeClass !== NodeClass.ObjectType) return null;
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
      (ref) => {
        // Only recurse into ObjectType nodes — skip members
        return ref.nodeClass === NodeClass.ObjectType;
      },
    );

    const strategy = this._opts.browseStrategy !== 'browseAll' ? 'parallel' : 'browseAll';
    this.logger.info(
      `Browse object types: ${items.length} types in ${ms.toFixed(0)}ms ` +
        `(strategy=${strategy}, transactions=${txCount})`,
    );

    // Enrich each type with its direct members.
    // Skip standard OPC UA types (ns=0) to avoid timeout.
    // Process in chunks to balance parallelism vs server load.
    // The optimized client batches concurrent calls within each
    // chunk into fewer wire-level OPC UA requests.
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

    // Process in chunks of ENRICH_CHUNK_SIZE for controlled
    // concurrency. Each chunk fires N concurrent
    // _browseTypeMembers calls that the optimized client
    // coalesces into batched OPC UA operations.
    const memberResults: ObjectTypeInfo[] = [];

    for (let i = 0; i < nonStdTypes.length; i += ENRICH_CHUNK_SIZE) {
      const chunk = nonStdTypes.slice(i, i + ENRICH_CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map((type) =>
          this._browseTypeMembers(type.sourceNodeId).then(
            (members) => ({ ...type, members }),
            () => type, // on error, keep type without members
          ),
        ),
      );
      memberResults.push(...chunkResults);
      if (nonStdTypes.length > ENRICH_CHUNK_SIZE) {
        this.logger.info(
          `Enriching types: ${Math.min(i + ENRICH_CHUNK_SIZE, nonStdTypes.length)}` +
            `/${nonStdTypes.length} done`,
        );
      }
    }

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
      } catch (err) {
        this.logger.debug(
          `Failed to resolve DataTypes during browse: ${(err as Error).message}`,
        );
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
        resultMask: RESULT_MASK_ALL,
        requestedMaxReferencesPerNode: 0,
      }));
      try {
        const mrResults = await browseAll(this.session, mrDescriptions);
        for (let i = 0; i < memberRefs.length; i++) {
          const childId = memberRefs[i]!.nodeId.toString();
          const mrRef = mrResults[i]?.references?.[0];
          modellingRuleMap.set(childId, mrRef?.displayName?.text ?? null);
        }
      } catch (err) {
        this.logger.debug(
          `Failed to resolve ModellingRules during browse: ${(err as Error).message}`,
        );
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
      displayName: uri.split('/').filter(Boolean).pop() ?? `ns${idx}`,
    }));
  }

  // ── Read / Write ───────────────────────────────────────────

  async readValue(nodeId: string): Promise<SourceDataValue> {
    this._serviceCounters.read++;
    const dv = await this.session.read({
      nodeId: coerceNodeId(nodeId),
      attributeId: AttributeIds.Value,
    });
    return dataValueToSource(dv);
  }

  async readValues(nodeIds: string[]): Promise<SourceDataValue[]> {
    this._serviceCounters.read++;
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
    this._serviceCounters.write++;
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
      coercedValue = coerceToDataType(value, targetDataType);
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
              : inferDataType(coercedValue),
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

  // ── History ────────────────────────────────────────────────

  async readHistory(
    nodeId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<SourceHistoricalValue[]> {
    this._serviceCounters.readHistory++;
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
    this._serviceCounters.call++;
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
    this._serviceCounters.subscribe++;
    // createSubscription2 works on both the standard session
    // and ClientSessionOptimized (which returns ClientSubscription2).
    const sub = await this.session.createSubscription2({
      requestedPublishingInterval: options.publishingIntervalMs,
      requestedLifetimeCount: SUBSCRIPTION_LIFETIME_COUNT,
      requestedMaxKeepAliveCount: SUBSCRIPTION_KEEPALIVE_COUNT,
      maxNotificationsPerPublish: 0,
      publishingEnabled: true,
      priority: SUBSCRIPTION_PRIORITY,
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
                samplingInterval: options.samplingIntervalMs,
                discardOldest: true,
                queueSize: MONITORED_ITEM_QUEUE_SIZE,
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
        } catch (err) {
          logger.debug(`Failed to terminate subscription: ${(err as Error).message}`);
        }
        monitored.clear();
      },
    };

    return wrapper;
  }
}
