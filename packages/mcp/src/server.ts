import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { RestClientBinding } from './bindings/rest-binding.js';
import type { I3XClientBinding } from './bindings/types.js';
import { connectSchema, handleConnect } from './tools/connect.js';
import { discoverTypesSchema, handleDiscoverTypes } from './tools/discover-types.js';
import {
  exploreHierarchySchema,
  handleExploreHierarchy,
} from './tools/explore-hierarchy.js';
import { handleInspectAsset, inspectAssetSchema } from './tools/inspect-asset.js';
import { handleMonitorEvents, monitorEventsSchema } from './tools/monitor-events.js';
import { handleQueryTelemetry, queryTelemetrySchema } from './tools/query-telemetry.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

export class NodeI3xMcpServer {
  private readonly server: Server;
  private binding: I3XClientBinding;

  constructor(binding?: I3XClientBinding) {
    this.binding = binding || new RestClientBinding();

    this.server = new Server(
      {
        name: '@node-i3x/mcp',
        version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.setupHandlers();
  }

  public setBinding(binding: I3XClientBinding): void {
    this.binding = binding;
  }

  public getBinding(): I3XClientBinding {
    return this.binding;
  }

  private setupHandlers() {
    // List Available MCP Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'i3x_connect',
          description:
            'Connect or switch dynamically to a specific i3X server endpoint URL and optional Bearer token at runtime.',
          inputSchema: {
            type: 'object',
            properties: {
              serverUrl: {
                type: 'string',
                description:
                  "Target i3X Gateway REST endpoint URL (e.g. 'http://192.168.1.50:8000' or 'https://i3x-portal.sterfive.io/instance/SESSION_ID')",
              },
              authToken: {
                type: 'string',
                description: 'Optional Bearer authentication token for secured endpoints',
              },
              verifyConnection: {
                type: 'boolean',
                description:
                  'Whether to verify connectivity by querying server /v1/info (default: true)',
              },
            },
            required: ['serverUrl'],
          },
        },
        {
          name: 'i3x_inspect_asset',
          description:
            'Single-turn complete asset diagnostic. Returns identity, ObjectType schema, parent/child hierarchy, and live VQT telemetry in 1 call.',
          inputSchema: {
            type: 'object',
            properties: {
              elementId: {
                type: 'string',
                description:
                  "The elementId of the asset to inspect (e.g. 'Pump_101', 'Boiler_101')",
              },
              includeValues: {
                type: 'boolean',
                description:
                  'Whether to include live VQT telemetry values (default: true)',
              },
              includeSchema: {
                type: 'boolean',
                description:
                  'Whether to include the ObjectType JSON Schema definition (default: true)',
              },
              maxDepth: {
                type: 'number',
                description:
                  'Value read depth through components: 1 = the element only, 2 = with its components (default), 0 = unlimited',
              },
            },
            required: ['elementId'],
          },
        },
        {
          name: 'i3x_explore_plant_hierarchy',
          description:
            'ISA-95 plant topology discovery. Traverses plant hierarchy from root assets down to child components up to maxDepth.',
          inputSchema: {
            type: 'object',
            properties: {
              rootElementId: {
                type: 'string',
                description:
                  'Optional specific root asset elementId. If omitted, explores all root assets.',
              },
              maxDepth: {
                type: 'number',
                description:
                  'Maximum depth to traverse child components (1 to 5, default: 2)',
              },
            },
          },
        },
        {
          name: 'i3x_query_telemetry',
          description:
            'Live current VQT telemetry or historical time-series trend analysis with pre-computed statistical summaries (min, max, mean).',
          inputSchema: {
            type: 'object',
            properties: {
              elementIds: {
                type: 'array',
                items: { type: 'string' },
                description:
                  "Array of asset elementIds to query (e.g. ['Pump_101', 'Boiler_101'])",
              },
              mode: {
                type: 'string',
                enum: ['current', 'history'],
                description:
                  "Query mode: 'current' for live VQT, 'history' for time-series trend analysis",
              },
              startTime: {
                type: 'string',
                description:
                  "ISO 8601 or relative duration (e.g. '-2h', '-30m') for history mode",
              },
              endTime: {
                type: 'string',
                description:
                  "ISO 8601 or relative duration (e.g. '-10m') end time (defaults to now) for history mode",
              },
              maxDepth: {
                type: 'number',
                description:
                  'Value read depth through components: 1 = the element only, 2 = with its components (default), 0 = unlimited',
              },
              aggregateStats: {
                type: 'boolean',
                description:
                  'Whether to pre-compute min/max/mean statistical summaries (default: true)',
              },
            },
            required: ['elementIds'],
          },
        },
        {
          name: 'i3x_discover_types_and_schemas',
          description:
            'Search registered i3X ObjectTypes, RelationshipTypes, and JSON Schema field validation requirements.',
          inputSchema: {
            type: 'object',
            properties: {
              typeElementId: {
                type: 'string',
                description:
                  "Optional specific ObjectType elementId (e.g. 'BoilerType'). If omitted, lists all types.",
              },
              namespaceUri: {
                type: 'string',
                description:
                  "Optional namespaceUri filter (e.g. 'http://sterfive.com/UA/Demo/')",
              },
            },
          },
        },
        {
          name: 'i3x_monitor_asset_events',
          description:
            'One-shot health check of assets: current VQT values plus an alert list of every series whose quality is not Good. Does not subscribe; call again to re-check.',
          inputSchema: {
            type: 'object',
            properties: {
              elementIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of asset elementIds to check',
              },
              maxDepth: {
                type: 'number',
                description:
                  'Value read depth through components: 1 = the element only, 2 = with its components (default), 0 = unlimited',
              },
            },
            required: ['elementIds'],
          },
        },
      ],
    }));

    // Handle Tool Execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;

      try {
        let result: unknown;

        switch (name) {
          case 'i3x_connect': {
            const parsed = connectSchema.parse(rawArgs);
            result = await handleConnect(parsed, (newBinding) => {
              this.binding = newBinding;
            });
            break;
          }
          case 'i3x_inspect_asset': {
            const parsed = inspectAssetSchema.parse(rawArgs);
            result = await handleInspectAsset(this.binding, parsed);
            break;
          }
          case 'i3x_explore_plant_hierarchy': {
            const parsed = exploreHierarchySchema.parse(rawArgs);
            result = await handleExploreHierarchy(this.binding, parsed);
            break;
          }
          case 'i3x_query_telemetry': {
            const parsed = queryTelemetrySchema.parse(rawArgs);
            result = await handleQueryTelemetry(this.binding, parsed);
            break;
          }
          case 'i3x_discover_types_and_schemas': {
            const parsed = discoverTypesSchema.parse(rawArgs);
            result = await handleDiscoverTypes(this.binding, parsed);
            break;
          }
          case 'i3x_monitor_asset_events': {
            const parsed = monitorEventsSchema.parse(rawArgs);
            result = await handleMonitorEvents(this.binding, parsed);
            break;
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: (err as Error).message,
                  tip: "Check parameters or use 'i3x_explore_plant_hierarchy' to list available assets.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    });

    // List Resources (i3x://info, i3x://namespaces)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'i3x://info',
          name: 'i3X Server Metadata',
          description: 'Server capabilities, spec version, and vendor information',
          mimeType: 'application/json',
        },
        {
          uri: 'i3x://namespaces',
          name: 'Registered Namespaces',
          description: 'List of registered OPC UA / i3X namespace URIs',
          mimeType: 'application/json',
        },
      ],
    }));

    // Read Resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'i3x://info') {
        const info = await this.binding.getInfo();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      if (uri === 'i3x://namespaces') {
        const namespaces = await this.binding.getNamespaces();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(namespaces, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    });
  }

  async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
