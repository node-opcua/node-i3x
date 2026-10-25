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
});

export async function handleInspectAsset(
  binding: I3XClientBinding,
  args: z.infer<typeof inspectAssetSchema>,
) {
  const { elementId, includeValues, includeSchema } = args;

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
    isRoot: !asset.parentId,
  };

  // Run sub-components, schema, and telemetry fetches concurrently for maximum speed & fault-tolerance
  const relatedPromise = binding.getRelatedObjects(elementId);
  const schemaPromise =
    includeSchema && asset.typeElementId
      ? binding.getObjectTypes()
      : Promise.resolve(null);
  const valuesPromise = includeValues
    ? binding.getObjectValues([elementId])
    : Promise.resolve(null);

  const [relatedResult, schemaResult, valuesResult] = await Promise.allSettled([
    relatedPromise,
    schemaPromise,
    valuesPromise,
  ]);

  // Sub-components
  if (
    relatedResult.status === 'fulfilled' &&
    Array.isArray(relatedResult.value) &&
    relatedResult.value.length > 0
  ) {
    result.subComponents = relatedResult.value.map((r) => ({
      elementId: r.elementId,
      displayName: r.displayName || r.elementId,
      typeElementId: r.typeElementId,
    }));
  }

  // Schema definition
  if (schemaResult.status === 'fulfilled' && Array.isArray(schemaResult.value)) {
    const targetType = schemaResult.value.find(
      (t) => t.elementId === asset.typeElementId,
    );
    if (targetType) {
      result.typeDefinition = {
        elementId: targetType.elementId,
        displayName: targetType.displayName,
        schema: targetType.schema,
      };
    }
  }

  // Current telemetry values
  if (
    valuesResult.status === 'fulfilled' &&
    Array.isArray(valuesResult.value) &&
    valuesResult.value.length > 0
  ) {
    result.currentValues = valuesResult.value[0];
  } else if (valuesResult.status === 'rejected') {
    result.currentValuesWarning = 'Telemetry data temporarily unavailable';
  }

  return result;
}
