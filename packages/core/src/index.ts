// ─────────────────────────────────────────────────────────────
// @i3x/core  —  Public API barrel export
// ─────────────────────────────────────────────────────────────

// Domain models
export type { NodeKind, ModelNode, BuildResult } from './domain/model-node.js';
export type { DataQuality } from './domain/model-node.js';
export type { VQT, CurrentValueResult, HistoricalValueResult } from './domain/vqt.js';
export type { Namespace } from './domain/namespace.js';
export type { ObjectType, RelationshipType } from './domain/object-type.js';
export type {
  SubscriptionUpdate,
  SubscriptionSyncResult,
  SubscriptionDeleteResult,
  SubscriptionDetail,
  MonitoredObjectEntry,
  CreateSubscriptionOptions,
} from './domain/subscription.js';

// Ports
export type {
  IDataSourcePort,
  SourceNodeInfo,
  NamespaceInfo,
  ObjectTypeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  DataChangeCallback,
  MonitoredSubscriptionOptions,
  IMonitoredSubscription,
  DataSourceFactory,
} from './ports/data-source.js';
export type { ILogger } from './ports/logger.js';
export { nullLogger, consoleLogger } from './ports/logger.js';

// Services
export { ModelService, emptyBuildResult } from './services/model-service.js';
export { ValueService } from './services/value-service.js';
export { HistoryService } from './services/history-service.js';
export { SubscriptionService } from './services/subscription-service.js';
export { stableI3xId, inferKind, mapNode, mapType } from './services/mapper.js';

// API types
export type * from './types/api.js';
