// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  Public API barrel export
// ─────────────────────────────────────────────────────────────

// Domain models
export type {
  BuildResult,
  DataQuality,
  ModelNode,
  NodeKind,
} from './domain/model-node.js';
export type { Namespace } from './domain/namespace.js';
export type { ObjectType, RelationshipType } from './domain/object-type.js';
export type {
  CreateSubscriptionOptions,
  MonitoredObjectEntry,
  SubscriptionDeleteResult,
  SubscriptionDetail,
  SubscriptionSyncResult,
  SubscriptionUpdate,
} from './domain/subscription.js';
export type { CurrentValueResult, HistoricalValueResult, VQT } from './domain/vqt.js';

// Ports
export type {
  DataChangeCallback,
  DataSourceFactory,
  IDataSourcePort,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from './ports/data-source.js';
export type { ILogger } from './ports/logger.js';
export { consoleLogger, nullLogger } from './ports/logger.js';
export { HistoryService } from './services/history-service.js';
export { inferKind, mapNode, mapType, stableI3xId } from './services/mapper.js';
// Services
export {
  buildTypeIdMap,
  emptyBuildResult,
  ModelService,
} from './services/model-service.js';
export { SubscriptionService } from './services/subscription-service.js';
export { ValueService } from './services/value-service.js';

// API types
export type * from './types/api.js';
