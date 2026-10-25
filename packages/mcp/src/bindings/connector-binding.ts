import type {
  CurrentValueResult,
  HistoricalValueResult,
  I3xStack,
  ModelNode,
  Namespace,
  ObjectInstanceResponse,
  ObjectType,
  RelationshipType,
  ServerInfo,
} from '@node-i3x/core';
import { rankSuggestions } from '../utils/similarity.js';
import type { I3XClientBinding } from './types.js';

export class InProcessConnectorBinding implements I3XClientBinding {
  constructor(private readonly stack: I3xStack) {}

  async getInfo(): Promise<ServerInfo> {
    return {
      specVersion: '1.0.0-beta',
      serverVersion: '0.10.0',
      serverName: 'node-i3x (In-Process Direct)',
      capabilities: {
        query: { history: true },
        update: { current: true, history: true },
        subscribe: { stream: true },
      },
    };
  }

  async getNamespaces(): Promise<Namespace[]> {
    const model = await this.stack.modelService.getOrBuildModel();
    const uris = new Set<string>();
    for (const node of model.nodesById.values()) {
      if (node.namespaceUri) uris.add(node.namespaceUri);
    }
    return Array.from(uris).map((uri) => ({
      uri,
      displayName: uri,
    }));
  }

  async getObjectTypes(namespaceUri?: string): Promise<ObjectType[]> {
    return this.stack.typeService.getObjectTypes(namespaceUri);
  }

  async getRelationshipTypes(): Promise<RelationshipType[]> {
    return [
      {
        elementId: 'HasComponent',
        displayName: 'Has Component',
        namespaceUri: 'http://opcfoundation.org/UA/',
        relationshipId: 'i=47',
        reverseOf: 'ComponentOf',
      },
      {
        elementId: 'HasProperty',
        displayName: 'Has Property',
        namespaceUri: 'http://opcfoundation.org/UA/',
        relationshipId: 'i=46',
        reverseOf: 'PropertyOf',
      },
    ];
  }

  async getObjects(options?: {
    rootOnly?: boolean;
    typeElementId?: string;
  }): Promise<ObjectInstanceResponse[]> {
    const model = await this.stack.modelService.getOrBuildModel();
    let nodes: ModelNode[];

    if (options?.rootOnly) {
      nodes = model.rootIds
        .map((id) => model.nodesById.get(id))
        .filter((n): n is ModelNode => n !== undefined && n.kind === 'instance');
    } else {
      nodes = Array.from(model.nodesById.values()).filter(
        (n): n is ModelNode => n.kind === 'instance' || n.kind === 'property',
      );
    }

    if (options?.typeElementId) {
      nodes = nodes.filter((n) => n.type === options.typeElementId);
    }

    const rootSet = new Set(model.rootIds);

    return nodes.map((n) => ({
      elementId: n.id,
      displayName: n.name,
      typeElementId: n.type || 'BaseObjectType',
      parentId: rootSet.has(n.id) ? null : undefined,
      isComposition: n.kind === 'instance',
      metadata: {
        typeNamespaceUri: n.namespaceUri,
        engUnit: n.engUnit || null,
        sourceTypeId: n.sourceTypeId || null,
      },
    }));
  }

  async getObjectById(elementId: string): Promise<ObjectInstanceResponse | null> {
    const objects = await this.getObjects();
    return objects.find((o) => o.elementId === elementId) || null;
  }

  async getRelatedObjects(elementId: string): Promise<ObjectInstanceResponse[]> {
    const model = await this.stack.modelService.getOrBuildModel();
    const node = model.nodesById.get(elementId);
    if (!node?.children) return [];

    const children = node.children
      .map((childId) => model.nodesById.get(childId))
      .filter((n): n is ModelNode => n !== undefined);

    return children.map((n) => ({
      elementId: n.id,
      displayName: n.name,
      typeElementId: n.type || 'BaseObjectType',
      parentId: elementId,
      isComposition: n.kind === 'instance',
      metadata: {
        typeNamespaceUri: n.namespaceUri,
        engUnit: n.engUnit || null,
        sourceTypeId: n.sourceTypeId || null,
      },
    }));
  }

  async getObjectValues(
    elementIds: string[],
    maxDepth = 1,
  ): Promise<CurrentValueResult[]> {
    const bulkResults = await this.stack.valueService.readValues(elementIds, maxDepth);
    return bulkResults
      .map((r) => r.result)
      .filter((v): v is CurrentValueResult => v !== null && v !== undefined);
  }

  async getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth = 1,
  ): Promise<HistoricalValueResult[]> {
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    const bulkResults = await this.stack.historyService.readHistory(
      elementIds,
      start,
      end,
      maxDepth,
    );
    return bulkResults
      .map((r) => r.result)
      .filter((v): v is HistoricalValueResult => v !== null && v !== undefined);
  }

  async findSuggestions(unknownId: string): Promise<string[]> {
    try {
      const allObjects = await this.getObjects();
      const candidates = allObjects.map((o) => o.elementId);
      return rankSuggestions(unknownId, candidates, 5, 0.4);
    } catch {
      return [];
    }
  }
}
