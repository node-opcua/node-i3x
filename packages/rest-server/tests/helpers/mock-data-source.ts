import type {
  DataChangeCallback,
  IDataSourcePort,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '@node-i3x/core';

/**
 * Shared mock data source used across REST server tests.
 *
 * Provides a deterministic OPC UA-like address space with a
 * single Machine asset containing a Temperature variable.
 */
export class MockDataSource implements IDataSourcePort {
  values: Record<string, unknown> = { 'ns=2;s=Temperature': 42.5 };
  connected = true;

  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }

  async browseTree(): Promise<SourceNodeInfo[]> {
    return [
      {
        sourceNodeId: 'ns=2;s=Machine',
        parentSourceNodeId: null,
        browseName: 'Machine',
        nsuQualifiedName: 'nsu=http://example.com/:Machine',
        displayName: 'Machine',
        nodeClass: 'Object',
        typeDefinition: 'ns=1;i=1001',
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Temperature',
        parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Temperature',
        nsuQualifiedName: 'nsu=http://example.com/:Temperature',
        displayName: 'Temperature',
        nodeClass: 'Variable',
        typeDefinition: 'Double',
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Reset',
        parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Reset',
        nsuQualifiedName: 'nsu=http://example.com/:Reset',
        displayName: 'Reset',
        nodeClass: 'Method',
        typeDefinition: null,
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
    ];
  }

  async getNamespaces(): Promise<NamespaceInfo[]> {
    return [
      { uri: 'http://example.com/i3x', displayName: 'I3X' },
      { uri: 'http://example.com/custom', displayName: 'Custom' },
    ];
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    return [
      {
        sourceNodeId: 'ns=1;i=1001',
        parentSourceNodeId: null,
        browseName: 'MachineType',
        displayName: 'Machine Type',
        namespaceUri: 'http://example.com/',
        members: [
          {
            browseName: 'Temperature',
            displayName: 'Temperature',
            nodeClass: 'Variable',
            dataType: 'Double',
            modellingRule: 'Mandatory',
          },
        ],
      },
    ];
  }

  async readValue(nodeId: string): Promise<SourceDataValue> {
    return {
      value: this.values[nodeId] ?? null,
      quality: 'Good',
      timestamp: new Date().toISOString(),
    };
  }

  async readValues(nodeIds: string[]): Promise<SourceDataValue[]> {
    return nodeIds.map((id) => ({
      value: this.values[id] ?? null,
      quality: 'Good',
      timestamp: new Date().toISOString(),
    }));
  }

  async writeValue(nodeId: string, value: unknown) {
    this.values[nodeId] = value;
  }

  async readHistory(): Promise<SourceHistoricalValue[]> {
    return [{ value: 42, quality: 'Good', timestamp: new Date().toISOString() }];
  }

  async createMonitoredSubscription(
    _opts: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    let _cb: DataChangeCallback | null = null;
    return {
      id: 'mock-sub',
      async addItems() {},
      async removeItems() {},
      onDataChange(c) {
        _cb = c;
      },
      async close() {},
    };
  }
}
