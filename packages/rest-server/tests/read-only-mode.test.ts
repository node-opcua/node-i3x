import type { IDataSourcePort, SourceNodeInfo } from '@node-i3x/core';
import {
  HistoryService,
  ModelService,
  nullLogger,
  SubscriptionService,
  TypeService,
  ValueService,
} from '@node-i3x/core';
import { createApp } from '@node-i3x/rest-server';
import { beforeAll, describe, expect, it } from 'vitest';

class MockDataSource implements IDataSourcePort {
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
        sourceNodeId: 'ns=2;s=Temperature',
        parentSourceNodeId: null,
        browseName: 'Temperature',
        nsuQualifiedName: 'nsu=http://example.com/:Temperature',
        displayName: 'Temperature',
        nodeClass: 'Variable',
        typeDefinition: 'Double',
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
    ];
  }
  async getNamespaces() {
    return [];
  }
  async getObjectTypes() {
    return [];
  }
  async readValue() {
    return { value: 12.3, quality: 'Good' as const, timestamp: '' };
  }
  async readValues() {
    return [];
  }
  async writeValue() {}
  async readHistory() {
    return [];
  }
  async createMonitoredSubscription() {
    return {} as any;
  }
}

describe('Read-Only Mode', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    const modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    const subscriptionService = new SubscriptionService(
      ds,
      modelService,
      logger,
      1000,
      250,
    );
    const typeService = new TypeService(ds, logger);

    app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
      readOnly: true, // Enable Read-Only Mode
      experimental: true,
    });
  });

  it('PUT /v1/objects/:elementId/value returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/some-id/value',
      payload: { value: 42 },
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
    expect(body.responseDetail.detail).toContain('read-only mode');
  });

  it('PUT /v1/objects/value returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/value',
      payload: [{ elementId: 'some-id', value: 42 }],
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
    expect(body.responseDetail.detail).toContain('read-only mode');
  });

  it('PUT /v1/objects/:elementId/history returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/some-id/history',
      payload: {},
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
  });

  it('PUT /v1/objects/history returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/history',
      payload: {},
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
  });
});
