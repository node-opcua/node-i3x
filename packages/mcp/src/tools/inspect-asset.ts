import { z } from 'zod';
import type { I3XClientBinding } from '../bindings/types.js';

export const inspectAssetSchema = z.object({
  elementId: z
    .string()
    .describe("The elementId of the asset to inspect (e.g. 'Pump_101', 'Boiler_101')"),
  includeValues: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include live VQT (Value, Quality, Timestamp) telemetry values'),
  includeSchema: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include the ObjectType JSON Schema definition'),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(2)
    .describe(
      'Value read depth through components: 1 = the asset only (an Object usually has no value of its own), 2 = with its components (default), 0 = unlimited',
    ),
});

export async function handleInspectAsset(
  binding: I3XClientBinding,
  args: z.infer<typeof inspectAssetSchema>,
) {
  const { elementId, includeValues, includeSchema, maxDepth } = args;

  const asset = await binding.getObjectById(elementId);
  if (!asset) {
    const suggestions = await binding.findSuggestions(elementId);
    return {
      error: `Asset '${elementId}' not found in i3X address space.`,
      suggestions: suggestions.length > 0 ? suggestions : 'No close matches found.',
      tip: "Use 'i3x_explore_plant_hierarchy' to list all root industrial assets.",
    };
  }

  const result: Record<string, unknown> = {
    elementId: asset.elementId,
    displayName: asset.displayName || asset.elementId,
    description: asset.metadata?.description || undefined,
    typeElementId: asset.typeElementId,
    parentId: asset.parentId ?? null,
    isRoot: !asset.parentId,
  };
  const warnings: string[] = [];

  // Run sub-components, schema, and telemetry fetches concurrently for maximum speed & fault-tolerance
  const relatedPromise = binding.getRelatedObjects(elementId);
  const schemaPromise =
    includeSchema && asset.typeElementId
      ? binding.getObjectTypes()
      : Promise.resolve(null);
  const valuesPromise = includeValues
    ? binding.getObjectValues([elementId], maxDepth)
    : Promise.resolve(null);

  const [relatedResult, schemaResult, valuesResult] = await Promise.allSettled([
    relatedPromise,
    schemaPromise,
    valuesPromise,
  ]);

  // Sub-components: related objects also include the parent (a reverse relationship).
  if (relatedResult.status === 'fulfilled') {
    const subComponents = relatedResult.value.filter(
      (r) => r.object.elementId !== asset.parentId,
    );
    if (subComponents.length > 0) {
      result.subComponents = subComponents.map((r) => ({
        elementId: r.object.elementId,
        displayName: r.object.displayName || r.object.elementId,
        typeElementId: r.object.typeElementId,
        relationship: r.sourceRelationship,
      }));
    }
  } else {
    warnings.push(`Sub-components unavailable: ${errorMessage(relatedResult.reason)}`);
  }

  // Schema definition
  if (schemaResult.status === 'fulfilled') {
    const targetType = schemaResult.value?.find(
      (t) => t.elementId === asset.typeElementId,
    );
    if (targetType) {
      result.typeDefinition = {
        elementId: targetType.elementId,
        displayName: targetType.displayName,
        schema: targetType.schema,
      };
    }
  } else {
    warnings.push(`Type schema unavailable: ${errorMessage(schemaResult.reason)}`);
  }

  // Current telemetry values
  if (valuesResult.status === 'fulfilled') {
    const entry = valuesResult.value?.[0];
    if (entry?.result) result.currentValues = entry.result;
    else if (entry?.error) warnings.push(`Telemetry unavailable: ${entry.error}`);
  } else {
    warnings.push(`Telemetry unavailable: ${errorMessage(valuesResult.reason)}`);
  }

  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
