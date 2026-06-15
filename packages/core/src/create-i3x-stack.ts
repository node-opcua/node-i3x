// ─────────────────────────────────────────────────────────────
// @node-i3x/core — Service Wiring Factory
// ─────────────────────────────────────────────────────────────

import type { IDataSourcePort } from './ports/data-source.js';
import type { ILogger } from './ports/logger.js';
import { HistoryService } from './services/history-service.js';
import { ModelService } from './services/model-service.js';
import { SubscriptionService } from './services/subscription-service.js';
import { TypeService } from './services/type-service.js';
import { ValueService } from './services/value-service.js';

export interface I3xStackOptions {
  publishIntervalMs?: number;
  samplingIntervalMs?: number;
}

export interface I3xStack {
  modelService: ModelService;
  valueService: ValueService;
  historyService: HistoryService;
  subscriptionService: SubscriptionService;
  typeService: TypeService;
}

/**
 * Instantiate and wire all i3X domain services with the given data source port.
 * Reduces duplication across servers, demos, and E2E tests.
 */
export function createI3xStack(
  dataSource: IDataSourcePort,
  logger: ILogger,
  options?: I3xStackOptions,
): I3xStack {
  const modelService = new ModelService(dataSource, logger);
  const valueService = new ValueService(dataSource, modelService, logger);
  const historyService = new HistoryService(dataSource, modelService, logger);
  const subscriptionService = new SubscriptionService(
    dataSource,
    modelService,
    logger,
    options?.publishIntervalMs,
    options?.samplingIntervalMs,
  );
  const typeService = new TypeService(dataSource, logger);

  return {
    modelService,
    valueService,
    historyService,
    subscriptionService,
    typeService,
  };
}
