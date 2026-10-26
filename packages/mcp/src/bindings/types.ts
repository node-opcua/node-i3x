import type {
  CurrentValueResult,
  HistoricalValueResult,
  Namespace,
  ObjectInstanceResponse,
  ObjectType,
  RelatedObjectResult,
  RelationshipType,
  ServerInfo,
} from '@node-i3x/core';

/** Outcome of a bulk read for one requested elementId: its result, or why it failed. */
export interface ElementResult<T> {
  elementId: string;
  result?: T;
  error?: string;
}

/** A known object whose elementId or displayName is close to an unknown query. */
export interface Suggestion {
  elementId: string;
  displayName?: string;
}

export interface AssetDiagnosticReport {
  elementId: string;
  displayName?: string;
  description?: string;
  typeElementId?: string;
  typeSchema?: Record<string, unknown>;
  parentId?: string;
  subComponents?: Array<{
    elementId: string;
    displayName?: string;
    relationshipType?: string;
  }>;
  currentValues?: Record<string, { value: unknown; quality: string; timestamp: string }>;
  diagnosticTips?: string[];
}

export interface HierarchyNode {
  elementId: string;
  displayName?: string;
  typeElementId?: string;
  children?: HierarchyNode[];
}

export interface TelemetrySummary {
  elementId: string;
  values: Array<{ timestamp: string; value: unknown; quality: string }>;
  statistics?: {
    min?: number;
    max?: number;
    mean?: number;
    count: number;
    badQualityCount: number;
  };
}

export interface I3XClientBinding {
  getInfo(): Promise<ServerInfo>;
  getNamespaces(): Promise<Namespace[]>;
  getObjectTypes(namespaceUri?: string): Promise<ObjectType[]>;
  getRelationshipTypes(): Promise<RelationshipType[]>;
  getObjects(options?: {
    rootOnly?: boolean;
    typeElementId?: string;
  }): Promise<ObjectInstanceResponse[]>;
  getObjectById(elementId: string): Promise<ObjectInstanceResponse | null>;
  /** Related objects with their relationship (children, and the parent as a reverse one). */
  getRelatedObjects(
    elementId: string,
    relationshipType?: string,
  ): Promise<RelatedObjectResult[]>;
  /** One entry per requested elementId, in request order. */
  getObjectValues(
    elementIds: string[],
    maxDepth?: number,
  ): Promise<ElementResult<CurrentValueResult>[]>;
  /** One entry per requested elementId, in request order. */
  getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth?: number,
  ): Promise<ElementResult<HistoricalValueResult>[]>;
  findSuggestions(query: string): Promise<Suggestion[]>;
}
