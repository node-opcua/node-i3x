import { describe, expect, it } from 'vitest';
import type {
  IDataSourcePort,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '../src/index.js';
import { HistoryService, ModelService, nullLogger, stableI3xId } from '../src/index.js';

function mockDataSource(
  nodes: SourceNodeInfo[],
  historyData: Record<string, SourceHistoricalValue[]>,
): IDataSourcePort {
  return {
    browseTree: async () => nodes,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getNamespaces: async () => [],
    getObjectTypes: async () => [],
    readValue: async () => ({ value: null, quality: 'Good', timestamp: '' }),
    readValues: async () => [],
    writeValue: async () => {},
    readHistory: async (nodeId, _start, _end) => {
      if (nodeId === 'error-node') {
        throw new Error('History read not supported');
      }
      return historyData[nodeId] ?? [];
    },
    createMonitoredSubscription: async () => ({}) as any,
  };
}

describe('HistoryService', () => {
  const rootNsu = 'nsu=http://test.org/:Root';
  const childNsu = 'nsu=http://test.org/:Temperature';
  const errorNsu = 'nsu=http://test.org/:ErrorNode';

  const mockNodes: SourceNodeInfo[] = [
    {
      sourceNodeId: 'ns=2;i=1',
      browseName: 'Root',
      displayName: 'Root',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://test.org/',
      eventNotifier: false,
      parentSourceNodeId: null,
      nsuQualifiedName: rootNsu,
    },
    {
      sourceNodeId: 'ns=2;i=2',
      browseName: 'Temperature',
      displayName: 'Temperature',
      nodeClass: 'Variable',
      typeDefinition: null,
      namespaceUri: 'http://test.org/',
      eventNotifier: false,
      parentSourceNodeId: 'ns=2;i=1',
      nsuQualifiedName: childNsu,
    },
    {
      sourceNodeId: 'error-node',
      browseName: 'ErrorNode',
      displayName: 'ErrorNode',
      nodeClass: 'Variable',
      typeDefinition: null,
      namespaceUri: 'http://test.org/',
      eventNotifier: false,
      parentSourceNodeId: 'ns=2;i=1',
      nsuQualifiedName: errorNsu,
    },
  ];

  const mockHistory: Record<string, SourceHistoricalValue[]> = {
    'ns=2;i=2': [
      { value: 20.5, quality: 'Good', timestamp: '2026-06-15T10:00:00Z' },
      { value: 21.0, quality: 'Good', timestamp: '2026-06-15T11:00:00Z' },
    ],
  };

  it('reads history successfully for existing elements', async () => {
    const ds = mockDataSource(mockNodes, mockHistory);
    const modelService = new ModelService(ds, nullLogger);
    const historyService = new HistoryService(ds, modelService, nullLogger);

    const tempId = stableI3xId(`${rootNsu}/${childNsu}`, 'property');

    const results = await historyService.readHistory([tempId], null, null);
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.elementId).toBe(tempId);
    expect(results[0]!.result!.isComposition).toBe(false);
    expect(results[0]!.result!.values).toHaveLength(2);
    expect(results[0]!.result!.values[0]!.value).toBe(20.5);
    expect(results[0]!.result!.values[0]!.quality).toBe('Good');
  });

  it('returns 404 for non-existing elements', async () => {
    const ds = mockDataSource(mockNodes, mockHistory);
    const modelService = new ModelService(ds, nullLogger);
    const historyService = new HistoryService(ds, modelService, nullLogger);

    const results = await historyService.readHistory(['invalid-id'], null, null);
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.responseDetail!.status).toBe(404);
    expect(results[0]!.responseDetail!.title).toBe('Not Found');
  });

  it('returns 501 when data source readHistory throws an error', async () => {
    const ds = mockDataSource(mockNodes, mockHistory);
    const modelService = new ModelService(ds, nullLogger);
    const historyService = new HistoryService(ds, modelService, nullLogger);

    const errorId = stableI3xId(`${rootNsu}/${errorNsu}`, 'property');

    const results = await historyService.readHistory([errorId], null, null);
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.responseDetail!.status).toBe(501);
    expect(results[0]!.responseDetail!.title).toBe('Not Implemented');
  });

  it('handles composition history queries with maxDepth', async () => {
    const ds = mockDataSource(mockNodes, mockHistory);
    const modelService = new ModelService(ds, nullLogger);
    const historyService = new HistoryService(ds, modelService, nullLogger);

    const rootId = stableI3xId(rootNsu, 'asset');
    const tempId = stableI3xId(`${rootNsu}/${childNsu}`, 'property');

    // Test maxDepth = 1 (default): should return isComposition: true but no components
    const results1 = await historyService.readHistory([rootId], null, null, 1);
    expect(results1).toHaveLength(1);
    expect(results1[0]!.success).toBe(true);
    expect(results1[0]!.result!.isComposition).toBe(true);
    expect(results1[0]!.result!.components).toBeUndefined();

    // Test maxDepth = 2: should return components map containing child history
    const results2 = await historyService.readHistory([rootId], null, null, 2);
    expect(results2).toHaveLength(1);
    expect(results2[0]!.success).toBe(true);
    expect(results2[0]!.result!.isComposition).toBe(true);
    expect(results2[0]!.result!.components).toBeDefined();
    expect(results2[0]!.result!.components![tempId]).toBeDefined();
    expect(results2[0]!.result!.components![tempId]!.values).toHaveLength(2);
    expect(results2[0]!.result!.components![tempId]!.values[0]!.value).toBe(20.5);
  });
});
