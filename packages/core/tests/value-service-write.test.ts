import { describe, expect, it, vi } from 'vitest';
import type { IDataSourcePort, SourceNodeInfo } from '../src/index.js';
import { ModelService, nullLogger, stableI3xId, ValueService } from '../src/index.js';

function mockDataSource(nodes: SourceNodeInfo[]): IDataSourcePort {
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
    readHistory: async () => [],
    createMonitoredSubscription: async () => ({}) as any,
  };
}

describe('ValueService writeValue', () => {
  const rootNsu = 'nsu=http://test.org/:Root';
  const childNsu = 'nsu=http://test.org/:Temperature';

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
  ];

  it('writes value successfully for existing element', async () => {
    const ds = mockDataSource(mockNodes);
    const writeValueSpy = vi.spyOn(ds, 'writeValue');
    const modelService = new ModelService(ds, nullLogger);
    const valueService = new ValueService(ds, modelService, nullLogger);
    const model = await modelService.getOrBuildModel();

    const tempId = [...model.nodesById.values()].find(
      (n) => n.name === 'Temperature',
    )!.id;

    await valueService.writeValue(tempId, 23.8);

    expect(writeValueSpy).toHaveBeenCalledWith('ns=2;i=2', 23.8);
  });

  it('throws error for non-existing element', async () => {
    const ds = mockDataSource(mockNodes);
    const modelService = new ModelService(ds, nullLogger);
    const valueService = new ValueService(ds, modelService, nullLogger);

    await expect(valueService.writeValue('invalid-id', 23.8)).rejects.toThrow(
      "Element 'invalid-id' not found",
    );
  });
});
