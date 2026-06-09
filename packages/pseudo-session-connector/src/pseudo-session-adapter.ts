// ─────────────────────────────────────────────────────────────
// @node-i3x/pseudo-session-connector — PseudoSessionDataSourceAdapter
// Implements IDataSourcePort using PseudoSession + AddressSpace
// ─────────────────────────────────────────────────────────────


import type {
  IDataSourcePort,
  ILogger,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '@node-i3x/core';
import type {
  IAddressSpace,
  UAVariable,
} from 'node-opcua-address-space-base';
import {
  AttributeIds,
  BrowseDirection,
  NodeClass,
} from 'node-opcua-data-model';
import type { DataValue } from 'node-opcua-data-value';
import {
  coerceNodeId,
  resolveNodeId,
} from 'node-opcua-nodeid';

import type { IBasicSession } from 'node-opcua-pseudo-session';
import type { BrowseResult } from 'node-opcua-service-browse';
import { StatusCodes } from 'node-opcua-status-code';
import type {
  BrowseDescriptionOptions,
  ReadValueIdOptions,
  ReferenceDescription,
  WriteValueOptions,
} from 'node-opcua-types';
import { DataType, Variant } from 'node-opcua-variant';

import {
  AddressSpaceMonitoredSubscription,
} from './address-space-subscription.js';

// ── Helpers ──────────────────────────────────────────────────

const NODE_CLASS_NAMES: Record<number, string> = {
  [NodeClass.Object]: 'Object',
  [NodeClass.Variable]: 'Variable',
  [NodeClass.Method]: 'Method',
  [NodeClass.ObjectType]: 'ObjectType',
  [NodeClass.VariableType]: 'VariableType',
  [NodeClass.ReferenceType]: 'ReferenceType',
  [NodeClass.DataType]: 'DataType',
  [NodeClass.View]: 'View',
};

function qualifiedNameToNsu(
  browseName: { namespaceIndex?: number; name?: string | null }
    | null | undefined,
  namespaceArray: readonly string[],
): string {
  if (!browseName?.name) return '';
  const nsIdx = browseName.namespaceIndex ?? 0;
  const nsUri = namespaceArray[nsIdx] ?? `ns=${nsIdx}`;
  return `nsu=${nsUri}:${browseName.name}`;
}

function dataValueToSource(dv: DataValue): SourceDataValue {
  const isGood =
    dv.statusCode?.equals(StatusCodes.Good) ?? false;
  return {
    value: dv.value?.value ?? null,
    quality: isGood ? 'Good' : 'Bad',
    timestamp:
      dv.sourceTimestamp?.toISOString() ??
      dv.serverTimestamp?.toISOString() ??
      new Date().toISOString(),
    statusCode: dv.statusCode?.value,
  };
}

// ── Adapter ──────────────────────────────────────────────────

/**
 * IDataSourcePort implementation that connects directly to a
 * node-opcua AddressSpace via PseudoSession — no binary
 * OPC UA transport required.
 */
export class PseudoSessionDataSourceAdapter
  implements IDataSourcePort {

  private _connected = false;
  private _session: IBasicSession | null = null;
  private _namespaceArray: string[] = [];

  constructor(
    private readonly _addressSpace: IAddressSpace,
    private readonly _logger: ILogger,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────

  async connect(): Promise<void> {
    // Dynamically import PseudoSession to keep the static
    // dependency graph on the address-space *interfaces* only.
    const { PseudoSession } = await import(
      'node-opcua-address-space'
    );
    this._session = new PseudoSession(this._addressSpace);
    // Cache namespace array
    const nsArrayDv = await this._session.read({
      nodeId: coerceNodeId('i=2255'),
      attributeId: AttributeIds.Value,
    });
    this._namespaceArray = nsArrayDv.value?.value ?? [];
    this._connected = true;
    this._logger.info(
      'PseudoSession connected to AddressSpace ' +
      `(${this._namespaceArray.length} namespaces)`,
    );
  }

  async disconnect(): Promise<void> {
    this._session = null;
    this._connected = false;
    this._logger.info('PseudoSession disconnected');
  }

  isConnected(): boolean {
    return this._connected;
  }

  private get session(): IBasicSession {
    if (!this._session) {
      throw new Error('PseudoSession not connected');
    }
    return this._session;
  }

  // ── Namespaces ───────────────────────────────────────────

  async getNamespaces(): Promise<NamespaceInfo[]> {
    return this._namespaceArray.map((uri, idx) => ({
      uri,
      displayName:
        uri.split('/').filter(Boolean).pop() ?? `ns${idx}`,
    }));
  }

  // ── Browse ───────────────────────────────────────────────

  async browseTree(): Promise<SourceNodeInfo[]> {
    const objectsFolderId =
      resolveNodeId('ObjectsFolder').toString();

    const { items } = await this._bfsBrowse<SourceNodeInfo>(
      objectsFolderId,
      (ref, parentNodeId) => {
        const effectiveParent =
          parentNodeId === objectsFolderId
            ? null
            : parentNodeId;
        return this._refToSourceNode(ref, effectiveParent);
      },
      (ref) =>
        ref.nodeClass === NodeClass.Object ||
        ref.nodeClass === NodeClass.Variable,
    );
    this._logger.info(
      `PseudoSession browseTree: ${items.length} nodes`,
    );
    return items;
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    const { items } = await this._bfsBrowse<ObjectTypeInfo>(
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
    this._logger.info(
      `PseudoSession getObjectTypes: ${items.length} types`,
    );
    return items;
  }

  // ── Read / Write ─────────────────────────────────────────

  async readValue(nodeId: string): Promise<SourceDataValue> {
    const dv = await this.session.read({
      nodeId: coerceNodeId(nodeId),
      attributeId: AttributeIds.Value,
    });
    return dataValueToSource(dv);
  }

  async readValues(
    nodeIds: string[],
  ): Promise<SourceDataValue[]> {
    if (nodeIds.length === 0) return [];
    const items: ReadValueIdOptions[] = nodeIds.map((id) => ({
      nodeId: coerceNodeId(id),
      attributeId: AttributeIds.Value,
    }));
    const dvs = await this.session.read(items);
    const arr = Array.isArray(dvs) ? dvs : [dvs];
    return arr.map(dataValueToSource);
  }

  async writeValue(
    nodeId: string,
    value: unknown,
  ): Promise<void> {
    // Read the current data type so we can build a proper
    // Variant for the PseudoSession (which, unlike a
    // network session, does not auto-coerce DataType.Null).
    const node = this._addressSpace.findNode(
      coerceNodeId(nodeId),
    );
    if (!node || node.nodeClass !== NodeClass.Variable) {
      throw new Error(
        `Cannot write: ${nodeId} is not a Variable`,
      );
    }
    const variable = node as UAVariable;
    const dataType = variable.dataType;
    const dtNode = this._addressSpace.findDataType(dataType);
    const basicType =
      dtNode
        ? variable.getBasicDataType()
        : DataType.Null;

    const writeValue: WriteValueOptions = {
      nodeId: coerceNodeId(nodeId),
      attributeId: AttributeIds.Value,
      value: {
        value: new Variant({ dataType: basicType, value }),
      },
    };
    const result = await this.session.write(writeValue);
    const code = Array.isArray(result) ? result[0] : result;
    if (code && !code.equals(StatusCodes.Good)) {
      throw new Error(`Write failed: ${code.toString()}`);
    }
  }

  // ── History (stub) ───────────────────────────────────────

  async readHistory(
    _sourceNodeId: string,
    _startTime: Date,
    _endTime: Date,
  ): Promise<SourceHistoricalValue[]> {
    this._logger.warn(
      'readHistory not yet implemented for PseudoSession',
    );
    return [];
  }

  // ── Subscriptions ────────────────────────────────────────

  async createMonitoredSubscription(
    _options: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    return new AddressSpaceMonitoredSubscription(
      this._addressSpace,
      this._logger,
    );
  }

  // ── Private browse helpers ───────────────────────────────

  private _refToSourceNode(
    ref: ReferenceDescription,
    parentSourceNodeId: string | null,
  ): SourceNodeInfo {
    const nodeClass =
      ref.nodeClass ?? NodeClass.Unspecified;
    const nsuQName = qualifiedNameToNsu(
      ref.browseName,
      this._namespaceArray,
    );

    let namespaceUri = '';
    const nsuMatch = nsuQName.match(/^nsu=(.+):([^:]+)$/);
    if (nsuMatch) {
      namespaceUri = nsuMatch[1] || "";
    } else {
      const nsIdx = ref.browseName?.namespaceIndex ?? 0;
      namespaceUri = this._namespaceArray[nsIdx] ?? '';
    }

    return {
      sourceNodeId: ref.nodeId.toString(),
      parentSourceNodeId,
      browseName: ref.browseName?.toString() ?? '',
      nsuQualifiedName: nsuQName,
      displayName:
        ref.displayName?.text ??
        ref.browseName?.toString() ??
        '',
      nodeClass:
        NODE_CLASS_NAMES[nodeClass] ?? 'Unknown',
      typeDefinition: ref.typeDefinition
        ? ref.typeDefinition.toString()
        : null,
      namespaceUri,
      eventNotifier:
        ref.nodeClass === NodeClass.Object
          ? (((ref as unknown as Record<string, unknown>)
              .eventNotifier as number) ?? 0) !== 0
          : false,
    };
  }

  private async _bfsBrowse<T>(
    seedNodeId: string,
    onRef: (
      ref: ReferenceDescription,
      parentNodeId: string | null,
    ) => T | null,
    shouldRecurse?: (ref: ReferenceDescription) => boolean,
  ): Promise<{ items: T[] }> {
    const output: T[] = [];
    const visited = new Set<string>();

    let frontier: Array<{
      nodeId: string;
      parentId: string | null;
    }> = [{ nodeId: seedNodeId, parentId: null }];

    while (frontier.length > 0) {
      const wave = frontier.filter(
        (f) => !visited.has(f.nodeId),
      );
      for (const item of wave) visited.add(item.nodeId);
      if (wave.length === 0) break;

      const descriptions: BrowseDescriptionOptions[] =
        wave.map((w) => ({
          nodeId: coerceNodeId(w.nodeId),
          browseDirection: BrowseDirection.Forward,
          includeSubtypes: true,
          referenceTypeId: resolveNodeId(
            'HierarchicalReferences',
          ),
          resultMask: 63,
          requestedMaxReferencesPerNode: 0,
        }));

      const browseResults: BrowseResult[] =
        await this.session.browse(descriptions);

      const nextFrontier: typeof frontier = [];
      for (let i = 0; i < wave.length; i++) {
        const item = wave[i];
        if (!item) continue; // Shouldn't happen, but just in case
        const result = browseResults[i];
        if (!result) continue; // Shouldn't happen, but just in case
        const refs = result.references ?? [];

        for (const ref of refs) {
          const childId = ref.nodeId.toString();
          if (visited.has(childId)) continue;

          const mapped = onRef(ref, item.nodeId);
          if (mapped !== null) output.push(mapped);

          if (!shouldRecurse || shouldRecurse(ref)) {
            nextFrontier.push({
              nodeId: childId,
              parentId: item.nodeId,
            });
          }
        }
      }
      frontier = nextFrontier;
    }

    return { items: output };
  }
}
