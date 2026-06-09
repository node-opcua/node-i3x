import type { IDataSourcePort, SourceNodeInfo } from '@node-i3x/core';
import { ModelService, nullLogger, stableI3xId } from '@node-i3x/core';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────

function mockDataSource(nodes: SourceNodeInfo[]): IDataSourcePort {
  return {
    browseTree: async () => nodes,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getNamespaces: async () => [],
    getObjectTypes: async () => [],
    readValue: async () => ({
      value: null,
      quality: 'Good',
      timestamp: '',
    }),
    readValues: async () => [],
    writeValue: async () => {},
    readHistory: async () => [],
    createMonitoredSubscription: async () => ({
      id: 'mock',
      addItems: async () => {},
      removeItems: async () => {},
      onDataChange: () => {},
      close: async () => {},
    }),
  };
}

function sourceNode(
  overrides: Partial<SourceNodeInfo> & {
    sourceNodeId: string;
    nsuQualifiedName: string;
  },
): SourceNodeInfo {
  return {
    parentSourceNodeId: null,
    browseName: overrides.nsuQualifiedName.split(':').pop() ?? '',
    displayName: overrides.nsuQualifiedName.split(':').pop() ?? '',
    nodeClass: 'Object',
    typeDefinition: null,
    namespaceUri: 'http://test.org/',
    eventNotifier: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('ModelService – browse path construction', () => {
  it('single root node gets its nsuQualifiedName as browse path', async () => {
    const nsu = 'nsu=http://test.org/:Root';
    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: nsu }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const expectedId = stableI3xId(nsu, 'asset');
    expect(model.rootIds).toHaveLength(1);
    expect(model.rootIds[0]).toBe(expectedId);
    expect(model.nodesById.get(expectedId)).toBeDefined();
    expect(model.nodesById.get(expectedId)!.kind).toBe('asset');
  });

  it('child browse path = parentPath / childNsu', async () => {
    const rootNsu = 'nsu=http://test.org/:Root';
    const childNsu = 'nsu=http://test.org/:Temperature';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: rootNsu }),
      sourceNode({
        sourceNodeId: 'ns=2;i=2',
        nsuQualifiedName: childNsu,
        parentSourceNodeId: 'ns=2;i=1',
        nodeClass: 'Variable',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const expectedChildPath = `${rootNsu}/${childNsu}`;
    const childId = stableI3xId(expectedChildPath, 'property');

    expect(model.nodesById.has(childId)).toBe(true);
    expect(model.nodesById.get(childId)!.kind).toBe('property');
  });

  it('3-level nesting produces correct concatenated browse path', async () => {
    const rootNsu = 'nsu=http://test.org/:Plant';
    const assetNsu = 'nsu=http://test.org/:Boiler';
    const propNsu = 'nsu=http://test.org/:Pressure';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=10', nsuQualifiedName: rootNsu }),
      sourceNode({
        sourceNodeId: 'ns=2;i=11',
        nsuQualifiedName: assetNsu,
        parentSourceNodeId: 'ns=2;i=10',
      }),
      sourceNode({
        sourceNodeId: 'ns=2;i=12',
        nsuQualifiedName: propNsu,
        parentSourceNodeId: 'ns=2;i=11',
        nodeClass: 'Variable',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const expectedPath = `${rootNsu}/${assetNsu}/${propNsu}`;
    const propId = stableI3xId(expectedPath, 'property');

    expect(model.nodesById.has(propId)).toBe(true);
    expect(model.nodesById.get(propId)?.kind).toBe('property');
  });

  it('multiple roots each appear in rootIds independently', async () => {
    const rootANsu = 'nsu=http://test.org/:LineA';
    const rootBNsu = 'nsu=http://test.org/:LineB';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: rootANsu }),
      sourceNode({ sourceNodeId: 'ns=2;i=2', nsuQualifiedName: rootBNsu }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const idA = stableI3xId(rootANsu, 'asset');
    const idB = stableI3xId(rootBNsu, 'asset');

    expect(model.rootIds).toHaveLength(2);
    expect(model.rootIds).toContain(idA);
    expect(model.rootIds).toContain(idB);
    // Neither's path should contain the other
    expect(idA).not.toBe(idB);
  });

  it('multi-namespace tree encodes both URIs in child browse path', async () => {
    const rootNsu = 'nsu=http://di.org/:DeviceSet';
    const childNsu = 'nsu=http://coffee.com/:Machine';

    const nodes = [
      sourceNode({
        sourceNodeId: 'ns=3;i=100',
        nsuQualifiedName: rootNsu,
        namespaceUri: 'http://di.org/',
      }),
      sourceNode({
        sourceNodeId: 'ns=4;i=200',
        nsuQualifiedName: childNsu,
        parentSourceNodeId: 'ns=3;i=100',
        namespaceUri: 'http://coffee.com/',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const expectedChildPath = `${rootNsu}/${childNsu}`;
    // Verify the path contains BOTH namespace URIs
    expect(expectedChildPath).toContain('http://di.org/');
    expect(expectedChildPath).toContain('http://coffee.com/');

    const childId = stableI3xId(expectedChildPath, 'asset');
    expect(model.nodesById.has(childId)).toBe(true);
  });
});

describe('ModelService – namespace index stability', () => {
  it('same tree with different ns indices produces identical element IDs', async () => {
    // Set A: ns=2 indices
    const nodesA = [
      sourceNode({
        sourceNodeId: 'ns=2;i=100',
        nsuQualifiedName: 'nsu=http://coffee.com/:Machine',
        namespaceUri: 'http://coffee.com/',
      }),
      sourceNode({
        sourceNodeId: 'ns=2;i=101',
        nsuQualifiedName: 'nsu=http://coffee.com/:Temp',
        parentSourceNodeId: 'ns=2;i=100',
        nodeClass: 'Variable',
        namespaceUri: 'http://coffee.com/',
      }),
    ];

    // Set B: ns=5 indices (simulating server restart)
    const nodesB = [
      sourceNode({
        sourceNodeId: 'ns=5;i=200',
        nsuQualifiedName: 'nsu=http://coffee.com/:Machine',
        namespaceUri: 'http://coffee.com/',
      }),
      sourceNode({
        sourceNodeId: 'ns=5;i=201',
        nsuQualifiedName: 'nsu=http://coffee.com/:Temp',
        parentSourceNodeId: 'ns=5;i=200',
        nodeClass: 'Variable',
        namespaceUri: 'http://coffee.com/',
      }),
    ];

    const svcA = new ModelService(mockDataSource(nodesA), nullLogger);
    const svcB = new ModelService(mockDataSource(nodesB), nullLogger);

    const modelA = await svcA.getOrBuildModel();
    const modelB = await svcB.getOrBuildModel();

    // Both should produce the exact same set of element IDs
    const idsA = [...modelA.nodesById.keys()].sort();
    const idsB = [...modelB.nodesById.keys()].sort();
    expect(idsA).toEqual(idsB);

    // Verify root IDs also match
    expect(modelA.rootIds?.toSorted()).toEqual(modelB.rootIds?.toSorted());
  });
});

describe('ModelService – uniqueness', () => {
  it('same browse name under different parents produces different IDs', async () => {
    const parentA = 'nsu=http://test.org/:BoilerA';
    const parentB = 'nsu=http://test.org/:BoilerB';
    const childName = 'nsu=http://test.org/:Temperature';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: parentA }),
      sourceNode({ sourceNodeId: 'ns=2;i=2', nsuQualifiedName: parentB }),
      sourceNode({
        sourceNodeId: 'ns=2;i=3',
        nsuQualifiedName: childName,
        parentSourceNodeId: 'ns=2;i=1',
        nodeClass: 'Variable',
      }),
      sourceNode({
        sourceNodeId: 'ns=2;i=4',
        nsuQualifiedName: childName,
        parentSourceNodeId: 'ns=2;i=2',
        nodeClass: 'Variable',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const idChildA = stableI3xId(`${parentA}/${childName}`, 'property');
    const idChildB = stableI3xId(`${parentB}/${childName}`, 'property');

    expect(idChildA).not.toBe(idChildB);
    expect(model.nodesById.has(idChildA)).toBe(true);
    expect(model.nodesById.has(idChildB)).toBe(true);
  });

  it('same path but different kinds produce different element IDs', async () => {
    const browsePath = 'nsu=http://test.org/:Root/nsu=http://test.org/:Foo';

    const assetId = stableI3xId(browsePath, 'asset');
    const propertyId = stableI3xId(browsePath, 'property');

    expect(assetId).not.toBe(propertyId);
    expect(assetId).toMatch(/^asset-/);
    expect(propertyId).toMatch(/^property-/);
  });
});

describe('ModelService – property and action mapping', () => {
  it('Variable nodes populate propertyToSource', async () => {
    const rootNsu = 'nsu=http://test.org/:Root';
    const varNsu = 'nsu=http://test.org/:Speed';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: rootNsu }),
      sourceNode({
        sourceNodeId: 'ns=2;i=2',
        nsuQualifiedName: varNsu,
        parentSourceNodeId: 'ns=2;i=1',
        nodeClass: 'Variable',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const varId = stableI3xId(`${rootNsu}/${varNsu}`, 'property');
    expect(model.propertyToSource.has(varId)).toBe(true);
    expect(model.propertyToSource.get(varId)).toBe('ns=2;i=2');
  });

  it('Method nodes populate actionToMethod', async () => {
    const rootNsu = 'nsu=http://test.org/:Machine';
    const methodNsu = 'nsu=http://test.org/:Reset';

    const nodes = [
      sourceNode({ sourceNodeId: 'ns=2;i=10', nsuQualifiedName: rootNsu }),
      sourceNode({
        sourceNodeId: 'ns=2;i=11',
        nsuQualifiedName: methodNsu,
        parentSourceNodeId: 'ns=2;i=10',
        nodeClass: 'Method',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const methodId = stableI3xId(`${rootNsu}/${methodNsu}`, 'action');
    expect(model.actionToMethod.has(methodId)).toBe(true);

    const [parentSourceId, methodSourceId] =
      model.actionToMethod.get(methodId) ?? [];
    expect(parentSourceId).toBe('ns=2;i=10');
    expect(methodSourceId).toBe('ns=2;i=11');
  });
});

describe('ModelService – edge cases', () => {
  it('empty tree produces empty model', async () => {
    const svc = new ModelService(mockDataSource([]), nullLogger);
    const model = await svc.getOrBuildModel();

    expect(model.nodesById.size).toBe(0);
    expect(model.rootIds).toHaveLength(0);
    expect(model.childrenById.size).toBe(0);
    expect(model.propertyToSource.size).toBe(0);
    expect(model.actionToMethod.size).toBe(0);
  });

  it('flat tree: root with many children, no nesting', async () => {
    const rootNsu = 'nsu=http://test.org/:Panel';
    const childNames = ['Temp', 'Humidity', 'Pressure', 'Flow', 'Level'];

    const root = sourceNode({
      sourceNodeId: 'ns=2;i=1',
      nsuQualifiedName: rootNsu,
    });
    const children = childNames.map((name, idx) =>
      sourceNode({
        sourceNodeId: `ns=2;i=${10 + idx}`,
        nsuQualifiedName: `nsu=http://test.org/:${name}`,
        parentSourceNodeId: 'ns=2;i=1',
        nodeClass: 'Variable',
      }),
    );

    const svc = new ModelService(
      mockDataSource([root, ...children]),
      nullLogger,
    );
    const model = await svc.getOrBuildModel();

    const rootId = stableI3xId(rootNsu, 'asset');
    expect(model.rootIds).toHaveLength(1);
    expect(model.rootIds[0]).toBe(rootId);

    const rootChildren = model.childrenById.get(rootId);
    expect(rootChildren).toBeDefined();
    expect(rootChildren).toHaveLength(5);

    // Verify each child has the correct element ID
    for (const name of childNames) {
      const childNsu = `nsu=http://test.org/:${name}`;
      const expectedId = stableI3xId(
        `${rootNsu}/${childNsu}`,
        'property',
      );
      expect(rootChildren).toContain(expectedId);
      expect(model.nodesById.has(expectedId)).toBe(true);
    }
  });
});
