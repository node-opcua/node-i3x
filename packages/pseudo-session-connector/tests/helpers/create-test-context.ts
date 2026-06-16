// ─────────────────────────────────────────────────────────────
// Test helper — creates a standalone AddressSpace with known
// nodes for testing PseudoSessionDataSourceAdapter.
// ─────────────────────────────────────────────────────────────
import {
  DataType,
  type IAddressSpace,
  type Namespace,
  OPCUAServer,
  Variant,
} from 'node-opcua';

export interface TestContext {
  server: OPCUAServer;
  addressSpace: IAddressSpace;
  namespace: Namespace;
  /** Node IDs of the test nodes created */
  nodeIds: {
    testObject: string;
    temperature: string;
    pressure: string;
    nestedChild: string;
    nestedVariable: string;
    emptyObject: string;
    testMachineType: string;
    deepParent: string;
  };
}

/**
 * Creates a mini OPCUAServer (not started on any port)
 * with a populated AddressSpace containing test nodes.
 *
 * Call `teardownTestContext()` when done.
 */
export async function createTestContext(): Promise<TestContext> {
  const server = new OPCUAServer({
    port: 0, // no real listening
  });
  await server.initialize();

  const addressSpace = server.engine.addressSpace;
  if (!addressSpace) {
    throw new Error('Address space not initialized');
  }
  const namespace = addressSpace.registerNamespace('http://test.i3x.example.com/');

  // ── Test object under ObjectsFolder ──
  const testObject = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'TestObject',
    displayName: 'Test Object',
  });

  // ── Temperature variable (Double, initial 42.5) ──
  const temperature = namespace.addVariable({
    componentOf: testObject,
    browseName: 'Temperature',
    displayName: 'Temperature',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 42.5,
    }),
  });

  // ── Pressure variable (Double, initial 101.3) ──
  const pressure = namespace.addVariable({
    componentOf: testObject,
    browseName: 'Pressure',
    displayName: 'Pressure',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 101.3,
    }),
  });

  // ── Install in-memory historization on process variables ──
  addressSpace.installHistoricalDataNode(temperature, {
    maxOnlineValues: 100,
  });
  addressSpace.installHistoricalDataNode(pressure, {
    maxOnlineValues: 100,
  });

  // Seed a couple of values so history is not empty
  temperature.setValueFromSource(new Variant({ dataType: DataType.Double, value: 43.0 }));
  pressure.setValueFromSource(new Variant({ dataType: DataType.Double, value: 102.0 }));

  // ── NestedChild object under TestObject (for nested browse / history) ──
  const nestedChild = namespace.addObject({
    componentOf: testObject,
    browseName: 'NestedChild',
    displayName: 'Nested Child',
  });

  const nestedVariable = namespace.addVariable({
    componentOf: nestedChild,
    browseName: 'NestedTemp',
    displayName: 'Nested Temperature',
    dataType: DataType.Double,
    value: new Variant({ dataType: DataType.Double, value: 10.0 }),
  });

  // ── EmptyObject — no children (for fallback paths) ──
  const emptyObject = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'EmptyObject',
    displayName: 'Empty Object',
  });

  // ── DeepParent — only Object children, grandchild has Variable ──
  // Triggers the recursive loop in _findFirstChildVariable
  const deepParent = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'DeepParent',
    displayName: 'Deep Parent',
  });

  const deepChild = namespace.addObject({
    componentOf: deepParent,
    browseName: 'DeepChild',
    displayName: 'Deep Child',
  });

  namespace.addVariable({
    componentOf: deepChild,
    browseName: 'DeepVar',
    displayName: 'Deep Variable',
    dataType: DataType.Double,
    value: new Variant({ dataType: DataType.Double, value: 5.0 }),
  });

  // ── Custom ObjectType with members (for getObjectTypes enrichment) ──
  const testMachineType = namespace.addObjectType({
    browseName: 'TestMachineType',
    displayName: 'Test Machine Type',
  });

  namespace.addVariable({
    propertyOf: testMachineType,
    browseName: 'Speed',
    displayName: 'Speed',
    dataType: DataType.Double,
    modellingRule: 'Mandatory',
  });

  namespace.addMethod(testMachineType, {
    browseName: 'Start',
    modellingRule: 'Mandatory',
  });

  return {
    server,
    addressSpace,
    namespace,
    nodeIds: {
      testObject: testObject.nodeId.toString(),
      temperature: temperature.nodeId.toString(),
      pressure: pressure.nodeId.toString(),
      nestedChild: nestedChild.nodeId.toString(),
      nestedVariable: nestedVariable.nodeId.toString(),
      emptyObject: emptyObject.nodeId.toString(),
      testMachineType: testMachineType.nodeId.toString(),
      deepParent: deepParent.nodeId.toString(),
    },
  };
}

export async function teardownTestContext(ctx: TestContext): Promise<void> {
  ctx.addressSpace.dispose();
}
