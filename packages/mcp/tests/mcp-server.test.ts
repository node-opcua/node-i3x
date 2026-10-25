import { describe, expect, it } from 'vitest';
import type { I3XClientBinding } from '../src/bindings/types.js';
import { handleDiscoverTypes } from '../src/tools/discover-types.js';
import { handleExploreHierarchy } from '../src/tools/explore-hierarchy.js';
import { handleInspectAsset } from '../src/tools/inspect-asset.js';
import { handleMonitorEvents } from '../src/tools/monitor-events.js';
import { handleQueryTelemetry } from '../src/tools/query-telemetry.js';

// Mock i3X Client Binding
class MockClientBinding implements I3XClientBinding {
  async getInfo() {
    return {
      specVersion: '1.0.0-beta',
      serverVersion: '0.10.0',
      serverName: 'Mock i3X Gateway',
      capabilities: {},
    };
  }

  async getNamespaces() {
    return [{ uri: 'http://example.org/UA/Demo/', displayName: 'Demo Namespace' }];
  }

  async getObjectTypes() {
    return [
      {
        elementId: 'BoilerType',
        displayName: 'Boiler Asset Type',
        namespaceUri: 'http://example.org/UA/Demo/',
        sourceTypeId: 'i=1001',
        version: '1.0',
        schema: {
          type: 'object',
          required: ['Temperature', 'Pressure'],
        },
        related: null,
      },
    ];
  }

  async getRelationshipTypes() {
    return [
      {
        elementId: 'HasComponent',
        displayName: 'Has Component',
        namespaceUri: 'http://opcfoundation.org/UA/',
        relationshipId: 'i=47',
        reverseOf: 'ComponentOf',
      },
    ];
  }

  async getObjects(options?: { rootOnly?: boolean }) {
    const all = [
      {
        elementId: 'Boiler_101',
        displayName: 'Boiler 101',
        typeElementId: 'BoilerType',
        isComposition: true,
        metadata: { description: 'Main plant boiler' },
      },
      {
        elementId: 'Pump_101',
        displayName: 'Feed Pump 101',
        parentId: 'Boiler_101',
        isComposition: true,
      },
    ];
    if (options?.rootOnly) return all.filter((o) => !o.parentId);
    return all;
  }

  async getObjectById(elementId: string) {
    const all = await this.getObjects();
    return all.find((o) => o.elementId === elementId) || null;
  }

  async getRelatedObjects(elementId: string) {
    if (elementId === 'Boiler_101') {
      return [
        {
          elementId: 'Pump_101',
          displayName: 'Feed Pump 101',
          typeElementId: 'PumpType',
        },
      ];
    }
    return [];
  }

  async getObjectValues(elementIds: string[]) {
    return elementIds.map((id) => ({
      isComposition: true,
      value: id === 'Boiler_101' ? { Temperature: 78.4, Pressure: 3.2 } : { Speed: 1500 },
      quality: 'Good' as const,
      timestamp: new Date().toISOString(),
    }));
  }

  async getHistoricalValues(elementIds: string[]) {
    return elementIds.map(() => ({
      isComposition: true,
      values: [
        { timestamp: '2026-10-25T10:00:00Z', value: 75.0, quality: 'Good' as const },
        { timestamp: '2026-10-25T11:00:00Z', value: 85.5, quality: 'Good' as const },
      ],
    }));
  }

  async findSuggestions(unknownId: string) {
    if (unknownId.includes('Boiler')) return ['Boiler_101'];
    return [];
  }
}

describe('@node-i3x/mcp High-Value Tools', () => {
  const mockBinding = new MockClientBinding();

  it('i3x_inspect_asset returns full single-turn diagnostic payload', async () => {
    const res = await handleInspectAsset(mockBinding, {
      elementId: 'Boiler_101',
      includeValues: true,
      includeSchema: true,
    });

    expect(res).toHaveProperty('elementId', 'Boiler_101');
    expect(res).toHaveProperty('displayName', 'Boiler 101');
    expect(res).toHaveProperty('typeDefinition');
    expect(res).toHaveProperty('subComponents');
    expect(res).toHaveProperty('currentValues');
  });

  it('i3x_inspect_asset provides self-correcting suggestions on missing asset', async () => {
    const res = await handleInspectAsset(mockBinding, {
      elementId: 'Boiler_999',
      includeValues: true,
      includeSchema: true,
    });

    expect(res).toHaveProperty('error');
    expect(res).toHaveProperty('suggestions', ['Boiler_101']);
  });

  it('i3x_explore_plant_hierarchy traverses ISA-95 topology tree', async () => {
    const res = await handleExploreHierarchy(mockBinding, { maxDepth: 2 });

    expect(res.totalRoots).toBe(1);
    expect(res.plantTopology[0].elementId).toBe('Boiler_101');
    expect(res.plantTopology[0].children?.[0].elementId).toBe('Pump_101');
  });

  it('i3x_query_telemetry pre-computes statistical summaries for history', async () => {
    const res = await handleQueryTelemetry(mockBinding, {
      elementIds: ['Boiler_101'],
      mode: 'history',
      startTime: '-2h',
      aggregateStats: true,
    });

    expect(res.mode).toBe('history');
    expect(res.telemetryReports[0].statistics).toEqual({
      min: 75.0,
      max: 85.5,
      mean: 80.25,
      count: 2,
      badQualityCount: 0,
    });
  });

  it('i3x_discover_types_and_schemas lists ObjectTypes and schema field rules', async () => {
    const res = await handleDiscoverTypes(mockBinding, {});

    expect(res.objectTypesCount).toBe(1);
    expect(res.objectTypes[0].elementId).toBe('BoilerType');
    expect(res.objectTypes[0].requiredProperties).toEqual(['Temperature', 'Pressure']);
  });

  it('i3x_monitor_asset_events sets up subscription stream snapshot', async () => {
    const res = await handleMonitorEvents(mockBinding, {
      elementIds: ['Boiler_101'],
      condition: 'temperature > 80',
    });

    expect(res.status).toBe('monitoring_active');
    expect(res.monitoredAssets).toEqual(['Boiler_101']);
  });

  it('similarity and ranking utility ranks typos higher than unrelated strings', async () => {
    const { rankSuggestions, computeSimilarity } = await import(
      '../src/utils/similarity.js'
    );

    const similarity = computeSimilarity('Boiler_101', 'Bioler_101');
    expect(similarity).toBeGreaterThan(0.7);

    const candidates = ['Pump_101', 'Boiler_101', 'Chiller_300', 'Boiler_Aux_2'];
    const ranked = rankSuggestions('Bioler_101', candidates);
    expect(ranked[0]).toBe('Boiler_101');
  });

  it('i3x_inspect_asset degrades gracefully when telemetry values fail', async () => {
    const faultBinding = new MockClientBinding();
    faultBinding.getObjectValues = async () => {
      throw new Error('Sensor gateway timeout');
    };

    const res = await handleInspectAsset(faultBinding, {
      elementId: 'Boiler_101',
      includeValues: true,
      includeSchema: true,
    });

    expect(res).toHaveProperty('elementId', 'Boiler_101');
    expect(res).toHaveProperty('displayName', 'Boiler 101');
    expect(res).toHaveProperty(
      'currentValuesWarning',
      'Telemetry data temporarily unavailable',
    );
  });

  it('i3x_connect dynamically switches endpoint and verifies connection', async () => {
    const { handleConnect } = await import('../src/tools/connect.js');

    let switchedBinding: I3XClientBinding | null = null;
    const res = await handleConnect(
      {
        serverUrl: 'http://127.0.0.1:9999',
        authToken: 'test-bearer-token',
        verifyConnection: false,
      },
      (newBinding) => {
        switchedBinding = newBinding;
      },
    );

    expect(res.status).toBe('connected');
    expect(res.authenticated).toBe(true);
    expect(res.serverUrl).toBe('http://127.0.0.1:9999');
    expect(switchedBinding).not.toBeNull();
  });
});
