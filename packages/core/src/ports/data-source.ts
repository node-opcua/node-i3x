// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  IDataSourcePort (outbound port)
// ─────────────────────────────────────────────────────────────
//
// This is the hexagonal boundary.  The domain services call this
// port; adapters (OPC UA, MQTT, mock, …) implement it.
// ─────────────────────────────────────────────────────────────

import type { ILogger } from './logger.js';

// ── Source-agnostic types returned by any adapter ────────────

/** A node discovered during a browse / tree-walk of the source system. */
export interface SourceNodeInfo {
  readonly sourceNodeId: string;
  readonly parentSourceNodeId: string | null;
  readonly browseName: string;
  /** Namespace-URI-qualified browse name: `"nsu=http://…:Name"` */
  readonly nsuQualifiedName: string;
  readonly displayName: string;
  /** Source-native class name, e.g. 'Object', 'Variable', 'Method'. */
  readonly nodeClass: string;
  /** Type definition of this node (e.g. 'ns=0;i=63' for BaseObjectType). */
  readonly typeDefinition: string | null;
  /** Namespace URI for this node's browse name. */
  readonly namespaceUri: string;
  readonly eventNotifier: boolean;
}

/**
 * Controls which subtrees under the OPC UA Objects folder
 * are exposed via the i3X REST API.
 *
 * - `'application-only'` — skip standard OPC UA nodes (ns=0)
 *   such as `Server`, `Aliases`, etc. **This is the default.**
 * - `'all'` — expose every node under ObjectsFolder.
 * - `string[]` — explicit list of NodeIds or BrowseNames
 *   of top-level objects to include (e.g. `['ns=1;s=SmartFactory']`).
 */
export type BrowseFilter = 'application-only' | 'all' | string[];

/** Namespace metadata from the source system. */
export interface NamespaceInfo {
  readonly uri: string;
  readonly displayName: string;
}

/** Object-type metadata from the source system. */
export interface ObjectTypeInfo {
  readonly sourceNodeId: string;
  readonly parentSourceNodeId: string | null;
  readonly browseName: string;
  readonly displayName: string;
  readonly namespaceUri: string;
  /** Members (variables, objects, methods) declared by this type. */
  readonly members?: readonly ObjectTypeMemberInfo[];
}

/** A member (variable / property / object / method) of an ObjectType. */
export interface ObjectTypeMemberInfo {
  readonly browseName: string;
  readonly displayName: string;
  /** 'Variable' | 'Object' | 'Method' */
  readonly nodeClass: string;
  /** OPC UA data type name, e.g. 'Double', 'Boolean', 'i=11'. */
  readonly dataType: string | null;
  /** 'Mandatory' | 'Optional' | null */
  readonly modellingRule: string | null;
}

/** A single value read from the source, with quality + timestamp. */
export interface SourceDataValue {
  readonly value: unknown;
  readonly quality: string;
  /** RFC 3339 UTC timestamp. */
  readonly timestamp: string;
  readonly statusCode?: number;
}

/** A single historical value from the source. */
export interface SourceHistoricalValue {
  readonly value: unknown;
  readonly quality: string;
  readonly timestamp: string;
}

// ── Subscription abstractions ────────────────────────────────

export type DataChangeCallback = (
  sourceNodeId: string,
  value: unknown,
  quality: string,
  timestamp: string,
) => void;

export interface MonitoredSubscriptionOptions {
  readonly publishingIntervalMs: number;
}

/**
 * A handle to a live, source-level monitored subscription.
 *
 * Adapters return this from `createMonitoredSubscription`.
 * The domain uses it to add/remove items and receive callbacks.
 */
export interface IMonitoredSubscription {
  readonly id: string;
  addItems(sourceNodeIds: string[]): Promise<void>;
  removeItems(sourceNodeIds: string[]): Promise<void>;
  onDataChange(cb: DataChangeCallback): void;
  close(): Promise<void>;
}

// ── The port itself ──────────────────────────────────────────

/**
 * Outbound port — the domain's single contract with the data layer.
 *
 * Any data source (OPC UA, MQTT, database, flat file, mock test
 * double) must implement this interface to be usable by the i3X
 * domain services.
 */
export interface IDataSourcePort {
  // ── Lifecycle ──
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // ── Model discovery ──
  browseTree(): Promise<SourceNodeInfo[]>;
  getNamespaces(): Promise<NamespaceInfo[]>;
  getObjectTypes(): Promise<ObjectTypeInfo[]>;

  // ── Value operations ──
  readValue(sourceNodeId: string): Promise<SourceDataValue>;
  readValues(sourceNodeIds: string[]): Promise<SourceDataValue[]>;
  writeValue(sourceNodeId: string, value: unknown): Promise<void>;

  // ── History operations ──
  readHistory(
    sourceNodeId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<SourceHistoricalValue[]>;

  // ── Subscription operations ──
  createMonitoredSubscription(
    options: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription>;

  // ── Stats (optional) ──
  getStats?(): {
    transactionsPerformed: number;
    bytesRead: number;
    bytesWritten: number;
    services: Record<string, number>;
  };
}

/**
 * Factory function type for creating data-source adapters.
 *
 * The composition root uses this to wire adapters without
 * importing concrete classes.
 */
export type DataSourceFactory = (logger: ILogger) => IDataSourcePort;
