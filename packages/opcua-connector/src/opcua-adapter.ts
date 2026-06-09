// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OpcUaDataSourceAdapter
// Implements IDataSourcePort using OpcUaClient
// ─────────────────────────────────────────────────────────────

import type {
  IDataSourcePort,
  ILogger,
  SourceNodeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  NamespaceInfo,
  ObjectTypeInfo,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
} from '@node-i3x/core';
import type { OpcUaClient } from './opcua-client.js';

/**
 * Adapter that bridges @node-i3x/core's IDataSourcePort to the
 * OPC UA world via OpcUaClient.
 *
 * This is the ONLY class that both imports from @node-i3x/core
 * AND from node-opcua land (via OpcUaClient).
 */
export class OpcUaDataSourceAdapter implements IDataSourcePort {
  constructor(
    private readonly client: OpcUaClient,
    private readonly logger: ILogger,
  ) {}

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  async browseTree(): Promise<SourceNodeInfo[]> {
    return this.client.browseTree();
  }

  async getNamespaces(): Promise<NamespaceInfo[]> {
    return this.client.getNamespaces();
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    return this.client.getObjectTypes();
  }

  async readValue(sourceNodeId: string): Promise<SourceDataValue> {
    return this.client.readValue(sourceNodeId);
  }

  async readValues(sourceNodeIds: string[]): Promise<SourceDataValue[]> {
    return this.client.readValues(sourceNodeIds);
  }

  async writeValue(sourceNodeId: string, value: unknown): Promise<void> {
    return this.client.writeValue(sourceNodeId, value);
  }

  async readHistory(
    sourceNodeId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<SourceHistoricalValue[]> {
    return this.client.readHistory(sourceNodeId, startTime, endTime);
  }

  async createMonitoredSubscription(
    options: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    return this.client.createMonitoredSubscription(options);
  }
}
