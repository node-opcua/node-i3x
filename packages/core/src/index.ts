// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  Public API barrel export
// ─────────────────────────────────────────────────────────────

export type { I3xStack, I3xStackOptions } from './create-i3x-stack.js';
export { createI3xStack } from './create-i3x-stack.js';
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
// Helpers
export * from './helpers/opcua-mapping.js';
export * from './helpers/vqt-helpers.js';
// Ports
export type {
  BrowseFilter,
  DataChangeCallback,
  DataSourceFactory,
  IDataSourcePort,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  ObjectTypeMemberInfo,
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
export {
  buildAllObjectTypeSchemas,
  buildObjectTypeSchema,
} from './services/schema-builder.js';
export { SubscriptionService } from './services/subscription-service.js';
export { TypeService } from './services/type-service.js';
export { ValueService } from './services/value-service.js';

// API types
export type * from './types/api.js';
