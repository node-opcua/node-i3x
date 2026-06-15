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

describe('Related Objects API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let modelService: ModelService;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    modelService = new ModelService(ds, logger);
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
    });
  });

  it('POST /v1/objects/related returns child components for parent asset', async () => {
    const model = await modelService.getOrBuildModel();
    const machineId = model.rootIds[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/related',
      payload: { elementIds: [machineId] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].elementId).toBe(machineId);
    expect(body.results[0].result).toHaveLength(1);
    expect(body.results[0].result[0].sourceRelationship).toBe('HasComponent');
    expect(body.results[0].result[0].object.displayName).toBe('Temperature');
  });

  it('POST /v1/objects/related returns parent asset for child variable', async () => {
    const model = await modelService.getOrBuildModel();
    const temperatureId = modelService.findNode(model, 'Temperature')!.id;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/related',
      payload: { elementIds: [temperatureId] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].elementId).toBe(temperatureId);
    expect(body.results[0].result).toHaveLength(1);
    expect(body.results[0].result[0].sourceRelationship).toBe('IsComponentOf');
    expect(body.results[0].result[0].object.displayName).toBe('Machine');
  });

  it('POST /v1/objects/related returns 404 for unknown elementId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/related',
      payload: { elementIds: ['invalid-id'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].elementId).toBe('invalid-id');
    expect(body.results[0].responseDetail.status).toBe(404);
  });
});
