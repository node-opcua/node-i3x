/** Default cap on a serialized tool result, in characters (I3X_MCP_MAX_RESULT_CHARS). */
export const DEFAULT_MAX_RESULT_CHARS = 100_000;

const NARROWING_HINTS: Record<string, string> = {
  i3x_explore_plant_hierarchy: 'pass rootElementId, or lower maxDepth or maxNodes',
  i3x_inspect_asset: 'lower maxDepth, or set includeSchema to false',
  i3x_query_telemetry: 'pass fewer elementIds, lower maxDepth, or shorten the time range',
  i3x_discover_types_and_schemas: 'pass typeElementId or namespaceUri',
  i3x_monitor_asset_events: 'pass fewer elementIds or lower maxDepth',
};

/**
 * Serialize a tool result, cutting it at `maxChars` with an explicit notice of what
 * was cut and how to narrow the query, instead of flooding the client's context.
 */
export function serializeToolResult(
  tool: string,
  result: unknown,
  maxChars: number,
): string {
  const text = JSON.stringify(result, null, 2);
  if (text.length <= maxChars) return text;
  const hint = NARROWING_HINTS[tool] ?? 'narrow the query';
  return (
    `${text.slice(0, maxChars)}\n\n` +
    `[Result truncated: showing the first ${maxChars} of ${text.length} characters, ` +
    `so the JSON above is incomplete. To see everything, ${hint}.]`
  );
}
