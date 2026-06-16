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
import { MockDataSource } from './helpers/mock-data-source.js';

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
    expect(body.results[0].result).toHaveLength(2);
    const names = body.results[0].result.map(
      (r: Record<string, any>) => r.object.displayName,
    );
    expect(names).toContain('Temperature');
    expect(names).toContain('Reset');
    expect(
      body.results[0].result.every(
        (r: Record<string, any>) => r.sourceRelationship === 'HasComponent',
      ),
    ).toBe(true);
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
