// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  API types (framework-agnostic)
// ─────────────────────────────────────────────────────────────

// ── Response wrappers ────────────────────────────────────────

export interface SuccessResponse<T> {
  success: boolean;
  result: T | null;
}

export interface ErrorDetail {
  code: number;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetail;
}

export interface BulkResultItem<T> {
  success: boolean;
  elementId?: string | null;
  subscriptionId?: string | null;
  result?: T | null;
  error?: ErrorDetail | null;
}

export interface BulkResponse<T> {
  success: boolean;
  results: BulkResultItem<T>[];
}

// ── Info ─────────────────────────────────────────────────────

export interface QueryCapabilities { history: boolean; }
export interface UpdateCapabilities { current: boolean; history: boolean; }
export interface SubscribeCapabilities { stream: boolean; }

export interface ServerCapabilities {
  query: QueryCapabilities;
  update: UpdateCapabilities;
  subscribe: SubscribeCapabilities;
}

export interface ServerInfo {
  specVersion: string;
  serverVersion?: string | null;
  serverName?: string | null;
  capabilities: ServerCapabilities;
}

// ── Objects ──────────────────────────────────────────────────

export interface ObjectInstanceMetadata {
  typeNamespaceUri?: string | null;
  sourceTypeId?: string | null;
  description?: string | null;
  relationships?: Record<string, unknown> | null;
  extendedAttributes?: Record<string, unknown> | null;
  system?: Record<string, unknown> | null;
}

export interface ObjectInstanceResponse {
  elementId: string;
  displayName: string;
  typeElementId: string;
  parentId?: string | null;
  isComposition: boolean;
  isExtended?: boolean;
  metadata?: ObjectInstanceMetadata | null;
}

export interface RelatedObjectResult {
  sourceRelationship: string;
  object: ObjectInstanceResponse;
}

// ── Subscriptions ────────────────────────────────────────────

export interface SyncUpdateResponse {
  sequenceNumber: number;
  elementId: string;
  value: unknown;
  quality: string;
  timestamp: string;
}

export interface CreateSubscriptionRequest {
  clientId?: string | null;
  displayName?: string | null;
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  clientId?: string | null;
  displayName?: string | null;
}

export interface SubscriptionDetailResponse {
  subscriptionId: string;
  clientId?: string | null;
  displayName?: string | null;
  monitoredObjects: Array<Record<string, unknown>>;
  mode?: string | null;
}

// ── Request bodies ───────────────────────────────────────────

export interface ElementIdsRequest { elementIds: string[]; }

export interface GetObjectsRequest {
  elementIds: string[];
  includeMetadata?: boolean;
}

export interface GetRelatedObjectsRequest {
  elementIds: string[];
  relationshipType?: string | null;
  includeMetadata?: boolean;
}

export interface GetObjectValueRequest {
  elementIds: string[];
  maxDepth?: number;
}

export interface GetObjectHistoryRequest {
  elementIds: string[];
  startTime?: string | null;
  endTime?: string | null;
  maxDepth?: number;
}

export interface RegisterMonitoredItemsRequest {
  subscriptionId: string;
  elementIds: string[];
  maxDepth?: number;
}

export interface SyncRequest {
  clientId?: string | null;
  subscriptionId: string;
  acknowledgeSequence?: number;
  lastSequenceNumber?: number;
}

export interface StreamRequest {
  clientId?: string | null;
  subscriptionId: string;
  acknowledgeSequence?: number;
  lastSequenceNumber?: number;
}

export interface ListSubscriptionsRequest {
  clientId?: string | null;
  subscriptionIds: string[];
}

export interface DeleteSubscriptionsRequest {
  clientId?: string | null;
  subscriptionIds: string[];
}
