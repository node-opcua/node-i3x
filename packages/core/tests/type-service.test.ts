import { describe, expect, it, vi } from 'vitest';
import type { IDataSourcePort, ObjectTypeInfo } from '../src/index.js';
import { nullLogger, TypeService } from '../src/index.js';

function mockDataSource(types: ObjectTypeInfo[]): IDataSourcePort {
  return {
    browseTree: async () => [],
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getNamespaces: async () => [],
    getObjectTypes: async () => types,
    readValue: async () => ({
      value: null,
      quality: 'Good',
      timestamp: '',
    }),
    readValues: async () => [],
    writeValue: async () => {},
    readHistory: async () => [],
    createMonitoredSubscription: async () => ({}) as any,
  };
}

describe('TypeService', () => {
  const mockTypes: ObjectTypeInfo[] = [
    {
      sourceNodeId: 'ns=2;i=1001',
      displayName: 'CustomMachineType',
      nsuQualifiedName: 'nsu=http://custom.namespace/:CustomMachineType',
      namespaceUri: 'http://custom.namespace/',
      parentSourceNodeId: null,
      variables: [
        {
          sourceNodeId: 'ns=2;i=6001',
          browseName: 'Temperature',
          displayName: 'Temperature',
          nsuQualifiedName: 'nsu=http://custom.namespace/:Temperature',
          dataType: 'Double',
        },
      ],
    },
    {
      sourceNodeId: 'ns=2;i=1002',
      displayName: 'OtherType',
      nsuQualifiedName: 'nsu=http://other.namespace/:OtherType',
      namespaceUri: 'http://other.namespace/',
      parentSourceNodeId: null,
      variables: [],
    },
  ];

  it('preloads types and gets all object types', async () => {
    const ds = mockDataSource(mockTypes);
    const getObjectTypesSpy = vi.spyOn(ds, 'getObjectTypes');

    const typeService = new TypeService(ds, nullLogger);
    await typeService.preloadTypes();

    expect(getObjectTypesSpy).toHaveBeenCalledTimes(1);

    const types = await typeService.getObjectTypes();
    expect(types).toHaveLength(3); // 2 custom types + 1 UnknownType fallback
    expect(types.map((t) => t.displayName)).toContain('CustomMachineType');
    expect(types.map((t) => t.displayName)).toContain('OtherType');
    expect(types.map((t) => t.displayName)).toContain('UnknownType');
  });

  it('filters by namespaceUri', async () => {
    const ds = mockDataSource(mockTypes);
    const typeService = new TypeService(ds, nullLogger);

    const filtered = await typeService.getObjectTypes('http://custom.namespace/');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.displayName).toBe('CustomMachineType');
  });

  it('queries object types by elementId in order', async () => {
    const ds = mockDataSource(mockTypes);
    const typeService = new TypeService(ds, nullLogger);

    const types = await typeService.getObjectTypes();
    const elementId1 = types.find(
      (t) => t.displayName === 'CustomMachineType',
    )!.elementId;
    const elementId2 = types.find((t) => t.displayName === 'OtherType')!.elementId;

    const queried = await typeService.queryObjectTypes([
      elementId2,
      'invalid-id',
      elementId1,
    ]);
    expect(queried).toHaveLength(3);
    expect(queried[0]!.displayName).toBe('OtherType');
    expect(queried[1]).toBeNull();
    expect(queried[2]!.displayName).toBe('CustomMachineType');
  });

  it('invalidates cache and fetches fresh data', async () => {
    const ds = mockDataSource(mockTypes);
    const getObjectTypesSpy = vi.spyOn(ds, 'getObjectTypes');
    const typeService = new TypeService(ds, nullLogger);

    await typeService.getObjectTypes();
    await typeService.getObjectTypes();
    expect(getObjectTypesSpy).toHaveBeenCalledTimes(1);

    typeService.invalidateCache();
    await typeService.getObjectTypes();
    expect(getObjectTypesSpy).toHaveBeenCalledTimes(2);
  });
});
