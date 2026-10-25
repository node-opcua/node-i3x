import type {
  CurrentValueResult,
  HistoricalValueResult,
  Namespace,
  ObjectInstanceResponse,
  ObjectType,
  RelationshipType,
  ServerInfo,
} from '@node-i3x/core';

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
  getRelatedObjects(
    elementId: string,
    relationshipType?: string,
  ): Promise<ObjectInstanceResponse[]>;
  getObjectValues(elementIds: string[], maxDepth?: number): Promise<CurrentValueResult[]>;
  getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth?: number,
  ): Promise<HistoricalValueResult[]>;
  findSuggestions(unknownId: string): Promise<string[]>;
}
