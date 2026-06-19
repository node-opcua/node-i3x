import type { IDataSourcePort, SourceNodeInfo } from '@node-i3x/core';
import { buildTypeIdMap, ModelService, nullLogger, stableI3xId } from '@node-i3x/core';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────

function expectedPropertyId(
  parentPath: string,
  parentBrowseName: string,
  relativePath: string,
): string {
  const parentAssetId = stableI3xId(parentPath, 'asset');
  const hashPart = parentAssetId.split('-')[1];

  const cleanName = (name: string): string => {
    let cleaned = name;
    const cttIndex = cleaned.toLowerCase().indexOf('-for-ctt-');
    if (cttIndex >= 0) {
      cleaned = cleaned.slice(cttIndex + 9);
    }
    return cleaned
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const segments = relativePath.includes('nsu=')
    ? relativePath.split('/nsu=')
    : relativePath.split('/');

  const cleanSegments = segments.map((segment) => {
    const colonIdx = segment.lastIndexOf(':');
    const name = colonIdx >= 0 ? segment.slice(colonIdx + 1) : segment;
    return cleanName(name);
  });
  const relativePathCleaned = cleanSegments.filter(Boolean).join('-');

  const parentNameCleaned = cleanName(parentBrowseName);

  return `property-${hashPart}-${parentNameCleaned}-${relativePathCleaned}`;
}

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
    const nodes = [sourceNode({ sourceNodeId: 'ns=2;i=1', nsuQualifiedName: nsu })];
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

    const childId = expectedPropertyId(rootNsu, 'Root', childNsu);

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

    const propId = expectedPropertyId(rootNsu, 'Plant', `${assetNsu}/${propNsu}`);

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

    const idChildA = expectedPropertyId(parentA, 'BoilerA', childName);
    const idChildB = expectedPropertyId(parentB, 'BoilerB', childName);

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

  it('dangling/unreachable nodes fallback to sourceNodeId to ensure unique element IDs', async () => {
    const nodes = [
      sourceNode({
        sourceNodeId: 'ns=2;i=10',
        nsuQualifiedName: 'nsu=http://test.org/:Dangling',
        parentSourceNodeId: 'ns=2;i=999',
      }),
      sourceNode({
        sourceNodeId: 'ns=2;i=11',
        nsuQualifiedName: 'nsu=http://test.org/:Dangling',
        parentSourceNodeId: 'ns=2;i=999',
      }),
    ];
    const svc = new ModelService(mockDataSource(nodes), nullLogger);
    const model = await svc.getOrBuildModel();

    const expectedId1 = stableI3xId('ns=2;i=10', 'asset');
    const expectedId2 = stableI3xId('ns=2;i=11', 'asset');

    expect(model.nodesById.has(expectedId1)).toBe(true);
    expect(model.nodesById.has(expectedId2)).toBe(true);
    expect(expectedId1).not.toBe(expectedId2);
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

    const varId = expectedPropertyId(rootNsu, 'Root', varNsu);
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

    const [parentSourceId, methodSourceId] = model.actionToMethod.get(methodId) ?? [];
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

    const svc = new ModelService(mockDataSource([root, ...children]), nullLogger);
    const model = await svc.getOrBuildModel();

    const rootId = stableI3xId(rootNsu, 'asset');
    expect(model.rootIds).toHaveLength(1);
    expect(model.rootIds[0]).toBe(rootId);

    const rootChildren = model.childrenById.get(rootId);
    expect(rootChildren).toBeDefined();
    expect(rootChildren).toHaveLength(5);

    // Verify each child has the correct element ID
    const rootBrowseName = rootNsu.split(':').pop() ?? '';
    for (const name of childNames) {
      const childNsu = `nsu=http://test.org/:${name}`;
      const expectedId = expectedPropertyId(rootNsu, rootBrowseName, childNsu);
      expect(rootChildren).toContain(expectedId);
      expect(model.nodesById.has(expectedId)).toBe(true);
    }
  });

  it('resolves asset type to matched Object Type or UnknownType', async () => {
    const rootNsu = 'nsu=http://test.org/:Root';
    const nodes = [
      sourceNode({
        sourceNodeId: 'ns=2;i=1',
        nsuQualifiedName: rootNsu,
        typeDefinition: 'ns=1;i=1001',
      }),
      sourceNode({
        sourceNodeId: 'ns=2;i=2',
        nsuQualifiedName: 'nsu=http://test.org/:Dangling',
        typeDefinition: 'ns=1;i=2002',
        parentSourceNodeId: 'ns=2;i=999',
      }),
    ];

    const ds = {
      ...mockDataSource(nodes),
      getObjectTypes: async () => [
        {
          sourceNodeId: 'ns=1;i=1001',
          parentSourceNodeId: null,
          browseName: 'MachineType',
          displayName: 'MachineType',
          namespaceUri: 'http://test.org/',
        },
      ],
    };

    const svc = new ModelService(ds, nullLogger);
    const model = await svc.getOrBuildModel();

    const rootId = stableI3xId(rootNsu, 'asset');
    const rootNode = model.nodesById.get(rootId);
    expect(rootNode?.type).toBe(
      'object-type:machinetype [ nsu=http://test.org/;i=1001 ]',
    );

    const danglingId = stableI3xId('ns=2;i=2', 'asset');
    const danglingNode = model.nodesById.get(danglingId);
    expect(danglingNode?.type).toBe('UnknownType');
  });

  describe('buildTypeIdMap options and prefixes', () => {
    const mockTypes = [
      {
        sourceNodeId: 'ns=1;i=1001',
        parentSourceNodeId: null,
        browseName: 'MachineType',
        displayName: 'Machine Type',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=1;i=1002',
        parentSourceNodeId: 'ns=0;i=17602', // parent is BaseInterfaceType
        browseName: 'ICoffeeInterface',
        displayName: 'ICoffeeInterface',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=0;i=17602',
        parentSourceNodeId: null,
        browseName: 'BaseInterfaceType',
        displayName: 'BaseInterfaceType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=1;i=1003',
        parentSourceNodeId: 'ns=0;i=2915', // parent is AlarmConditionType
        browseName: 'TemperatureAlarm',
        displayName: 'TemperatureAlarm',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=0;i=2915',
        parentSourceNodeId: 'ns=0;i=2782',
        browseName: 'AlarmConditionType',
        displayName: 'AlarmConditionType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=0;i=2782',
        parentSourceNodeId: 'ns=0;i=2041',
        browseName: 'ConditionType',
        displayName: 'ConditionType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=0;i=2041',
        parentSourceNodeId: null,
        browseName: 'BaseEventType',
        displayName: 'BaseEventType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=1;i=1004',
        parentSourceNodeId: 'ns=0;i=2299', // parent is StateMachineType
        browseName: 'BrewingStateMachine',
        displayName: 'BrewingStateMachine',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=0;i=2299',
        parentSourceNodeId: null,
        browseName: 'StateMachineType',
        displayName: 'StateMachineType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=1;i=1005',
        parentSourceNodeId: 'ns=0;i=62', // parent is BaseVariableType
        browseName: 'AnalogItemType',
        displayName: 'AnalogItemType',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=0;i=62',
        parentSourceNodeId: null,
        browseName: 'BaseVariableType',
        displayName: 'BaseVariableType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
      {
        sourceNodeId: 'ns=1;i=1006',
        parentSourceNodeId: 'ns=0;i=24', // parent is BaseDataType
        browseName: 'CustomDataType',
        displayName: 'CustomDataType',
        namespaceUri: 'http://test.org/',
      },
      {
        sourceNodeId: 'ns=0;i=24',
        parentSourceNodeId: null,
        browseName: 'BaseDataType',
        displayName: 'BaseDataType',
        namespaceUri: 'http://opcfoundation.org/UA/',
      },
    ];

    it('supports hash format', () => {
      const map = buildTypeIdMap(mockTypes, 'hash');
      expect(map.get('ns=1;i=1001')).toBe(
        stableI3xId('nsu=http://test.org/:MachineType', 'type'),
      );
    });

    it('supports name format', () => {
      const map = buildTypeIdMap(mockTypes, 'name');
      expect(map.get('ns=1;i=1001')).toBe('machinetype [ nsu=http://test.org/;i=1001 ]');
      expect(map.get('ns=1;i=1002')).toBe(
        'icoffeeinterface [ nsu=http://test.org/;i=1002 ]',
      );
    });

    it('supports prefixed-name format with proper inheritance mapping', () => {
      const map = buildTypeIdMap(mockTypes, 'prefixed-name');
      expect(map.get('ns=1;i=1001')).toBe(
        'object-type:machinetype [ nsu=http://test.org/;i=1001 ]',
      );
      expect(map.get('ns=1;i=1002')).toBe(
        'interface-type:icoffeeinterface [ nsu=http://test.org/;i=1002 ]',
      );
      expect(map.get('ns=1;i=1003')).toBe(
        'alarm-type:temperaturealarm [ nsu=http://test.org/;i=1003 ]',
      );
      expect(map.get('ns=1;i=1004')).toBe(
        'state-machine-type:brewingstatemachine [ nsu=http://test.org/;i=1004 ]',
      );
      expect(map.get('ns=1;i=1005')).toBe(
        'variable-type:analogitemtype [ nsu=http://test.org/;i=1005 ]',
      );
      expect(map.get('ns=1;i=1006')).toBe(
        'datatype:customdatatype [ nsu=http://test.org/;i=1006 ]',
      );
    });
  });

  describe('ModelService - property nesting (EURange/EngineeringUnit)', () => {
    it('Variable with nested properties (EURange, EngineeringUnit) maps to correct property IDs under the parent asset', async () => {
      const parentAssetPath = 'nsu=http://test.org/:CoffeeMachineA';
      const paramSetPath = `${parentAssetPath}/nsu=http://test.org/:ParameterSet`;
      const tempPath = `${paramSetPath}/nsu=http://test.org/:Temperature`;
      const euRangePath = `${tempPath}/nsu=http://opcfoundation.org/UA/DI/:EURange`;
      const engUnitPath = `${tempPath}/nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit`;

      const nodes = [
        sourceNode({
          sourceNodeId: 'ns=2;i=100',
          nsuQualifiedName: parentAssetPath,
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=101',
          nsuQualifiedName: 'nsu=http://test.org/:ParameterSet',
          parentSourceNodeId: 'ns=2;i=100',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=102',
          nsuQualifiedName: 'nsu=http://test.org/:Temperature',
          parentSourceNodeId: 'ns=2;i=101',
          nodeClass: 'Variable',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=103',
          nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/DI/:EURange',
          parentSourceNodeId: 'ns=2;i=102',
          nodeClass: 'Variable',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=104',
          nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit',
          parentSourceNodeId: 'ns=2;i=102',
          nodeClass: 'Variable',
        }),
      ];

      const svc = new ModelService(mockDataSource(nodes), nullLogger);
      const model = await svc.getOrBuildModel();

      const expectedTempId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/Temperature',
      );
      const expectedEURangeId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/Temperature/EURange',
      );
      const expectedEngUnitId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/Temperature/EngineeringUnit',
      );

      expect(model.nodesById.has(expectedTempId)).toBe(true);
      expect(model.nodesById.has(expectedEURangeId)).toBe(true);
      expect(model.nodesById.has(expectedEngUnitId)).toBe(true);

      // Verify human-readable pattern
      expect(expectedTempId).toMatch(/-coffeemachinea-parameterset-temperature$/);
      expect(expectedEURangeId).toMatch(
        /-coffeemachinea-parameterset-temperature-eurange$/,
      );
      expect(expectedEngUnitId).toMatch(
        /-coffeemachinea-parameterset-temperature-engineeringunit$/,
      );
    });

    it('correctly stops parent asset lookup when encountering namespace-prefixed containers like 2:DeviceSet', async () => {
      const deviceSetPath = 'nsu=http://opcfoundation.org/UA/DI/:DeviceSet';
      const coffeeMachinePath = `${deviceSetPath}/nsu=http://example.com/:CoffeeMachineA`;
      const tempPath = `${coffeeMachinePath}/nsu=http://example.com/:Temperature`;

      const nodes = [
        sourceNode({
          sourceNodeId: 'ns=2;i=5001',
          nsuQualifiedName: deviceSetPath,
          browseName: '2:DeviceSet',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=100',
          nsuQualifiedName: 'nsu=http://example.com/:CoffeeMachineA',
          parentSourceNodeId: 'ns=2;i=5001',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=102',
          nsuQualifiedName: 'nsu=http://example.com/:Temperature',
          parentSourceNodeId: 'ns=2;i=100',
          nodeClass: 'Variable',
        }),
      ];

      const svc = new ModelService(mockDataSource(nodes), nullLogger);
      const model = await svc.getOrBuildModel();

      const expectedTempId = expectedPropertyId(
        coffeeMachinePath,
        'CoffeeMachineA',
        'Temperature',
      );
      expect(model.nodesById.has(expectedTempId)).toBe(true);
      expect(expectedTempId).toMatch(/-coffeemachinea-temperature$/);
      expect(expectedTempId).not.toContain('deviceset');
    });

    it('Variable with nested EngineeringUnit property maps engUnit correctly from data source', async () => {
      const parentAssetPath = 'nsu=http://test.org/:CoffeeMachineA';
      const paramSetPath = `${parentAssetPath}/nsu=http://test.org/:ParameterSet`;
      const tempPath = `${paramSetPath}/nsu=http://test.org/:Temperature`;
      const engUnitPath = `${tempPath}/nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit`;

      const nodes = [
        sourceNode({
          sourceNodeId: 'ns=2;i=100',
          nsuQualifiedName: parentAssetPath,
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=101',
          nsuQualifiedName: 'nsu=http://test.org/:ParameterSet',
          parentSourceNodeId: 'ns=2;i=100',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=102',
          nsuQualifiedName: 'nsu=http://test.org/:Temperature',
          parentSourceNodeId: 'ns=2;i=101',
          nodeClass: 'Variable',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=104',
          nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit',
          parentSourceNodeId: 'ns=2;i=102',
          nodeClass: 'Variable',
        }),
      ];

      const customDataSource = mockDataSource(nodes);
      customDataSource.readValues = async (ids) => {
        if (ids.includes('ns=2;i=104')) {
          return [
            {
              value: {
                displayName: { text: '°C' },
              },
              quality: 'Good',
              timestamp: '',
            },
          ];
        }
        return [];
      };

      const svc = new ModelService(customDataSource, nullLogger);
      const model = await svc.getOrBuildModel();

      const expectedTempId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/Temperature',
      );

      const tempNode = model.nodesById.get(expectedTempId);
      expect(tempNode).toBeDefined();
      expect(tempNode?.engUnit).toBe('CEL');
    });

    it('Variable with nested EngineeringUnit property maps engUnit from raw string representation', async () => {
      const parentAssetPath = 'nsu=http://test.org/:CoffeeMachineA';
      const paramSetPath = `${parentAssetPath}/nsu=http://test.org/:ParameterSet`;
      const tempPath = `${paramSetPath}/nsu=http://test.org/:Pressure`;
      const engUnitPath = `${tempPath}/nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit`;

      const nodes = [
        sourceNode({
          sourceNodeId: 'ns=2;i=100',
          nsuQualifiedName: parentAssetPath,
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=101',
          nsuQualifiedName: 'nsu=http://test.org/:ParameterSet',
          parentSourceNodeId: 'ns=2;i=100',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=105',
          nsuQualifiedName: 'nsu=http://test.org/:Pressure',
          parentSourceNodeId: 'ns=2;i=101',
          nodeClass: 'Variable',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=106',
          nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/DI/:EngineeringUnit',
          parentSourceNodeId: 'ns=2;i=105',
          nodeClass: 'Variable',
        }),
      ];

      const customDataSource = mockDataSource(nodes);
      customDataSource.readValues = async (ids) => {
        if (ids.includes('ns=2;i=106')) {
          return [
            {
              value: 'bar',
              quality: 'Good',
              timestamp: '',
            },
          ];
        }
        return [];
      };

      const svc = new ModelService(customDataSource, nullLogger);
      const model = await svc.getOrBuildModel();

      const expectedPressureId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/Pressure',
      );

      const pressureNode = model.nodesById.get(expectedPressureId);
      expect(pressureNode).toBeDefined();
      expect(pressureNode?.engUnit).toBe('BAR');
    });

    it('Variable with nested EngineeringUnits (plural) property maps engUnit and translates mm correctly', async () => {
      const parentAssetPath = 'nsu=http://test.org/:CoffeeMachineA';
      const paramSetPath = `${parentAssetPath}/nsu=http://test.org/:ParameterSet`;
      const levelPath = `${paramSetPath}/nsu=http://test.org/:WaterTankLevel`;
      const engUnitsPath = `${levelPath}/nsu=http://opcfoundation.org/UA/DI/:EngineeringUnits`;

      const nodes = [
        sourceNode({
          sourceNodeId: 'ns=2;i=100',
          nsuQualifiedName: parentAssetPath,
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=101',
          nsuQualifiedName: 'nsu=http://test.org/:ParameterSet',
          parentSourceNodeId: 'ns=2;i=100',
          nodeClass: 'Object',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=201',
          nsuQualifiedName: 'nsu=http://test.org/:WaterTankLevel',
          parentSourceNodeId: 'ns=2;i=101',
          nodeClass: 'Variable',
        }),
        sourceNode({
          sourceNodeId: 'ns=2;i=202',
          nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/DI/:EngineeringUnits',
          parentSourceNodeId: 'ns=2;i=201',
          nodeClass: 'Variable',
        }),
      ];

      const customDataSource = mockDataSource(nodes);
      customDataSource.readValues = async (ids) => {
        if (ids.includes('ns=2;i=202')) {
          return [
            {
              value: {
                displayName: { text: 'mm' },
              },
              quality: 'Good',
              timestamp: '',
            },
          ];
        }
        return [];
      };

      const svc = new ModelService(customDataSource, nullLogger);
      const model = await svc.getOrBuildModel();

      const expectedLevelId = expectedPropertyId(
        parentAssetPath,
        'CoffeeMachineA',
        'ParameterSet/WaterTankLevel',
      );

      const levelNode = model.nodesById.get(expectedLevelId);
      expect(levelNode).toBeDefined();
      expect(levelNode?.engUnit).toBe('MMT');
    });
  });
});
