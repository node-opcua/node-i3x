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

  return {
    server,
    addressSpace,
    namespace,
    nodeIds: {
      testObject: testObject.nodeId.toString(),
      temperature: temperature.nodeId.toString(),
      pressure: pressure.nodeId.toString(),
    },
  };
}

export async function teardownTestContext(ctx: TestContext): Promise<void> {
  ctx.addressSpace.dispose();
}
