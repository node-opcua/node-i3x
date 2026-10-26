// Shared fixture for the contract tests: a real rest-server stack over the
// rest-server tests' MockDataSource, served in-process through inject().
import { createI3xStack, nullLogger } from '@node-i3x/core';
import type { RestServerDeps } from '@node-i3x/rest-server';
import { MockDataSource } from '../../../rest-server/tests/helpers/mock-data-source.js';

// Machine (root) ── Temperature, Reset, Motor ── Speed
export function makeDeps(
  extra: Partial<RestServerDeps> = {},
  configure?: (ds: MockDataSource) => void,
): RestServerDeps {
  const ds = new MockDataSource();
  ds.values['ns=2;s=Speed'] = 1500;
  ds.extraNodes = [
    {
      sourceNodeId: 'ns=2;s=Motor',
      parentSourceNodeId: 'ns=2;s=Machine',
      browseName: 'Motor',
      nsuQualifiedName: 'nsu=http://example.com/:Motor',
      displayName: 'Motor',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://example.com/',
      eventNotifier: false,
    },
    {
      sourceNodeId: 'ns=2;s=Speed',
      parentSourceNodeId: 'ns=2;s=Motor',
      browseName: 'Speed',
      nsuQualifiedName: 'nsu=http://example.com/:Speed',
      displayName: 'Speed',
      nodeClass: 'Variable',
      typeDefinition: 'Double',
      dataType: 'Double',
      dataTypeName: 'Double',
      namespaceUri: 'http://example.com/',
      eventNotifier: false,
    },
  ];
  configure?.(ds);
  return {
    ...createI3xStack(ds, nullLogger),
    dataSource: ds,
    logger: nullLogger,
    ...extra,
  };
}
