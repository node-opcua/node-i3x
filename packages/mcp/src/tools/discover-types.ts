import { z } from 'zod';
import type { I3XClientBinding } from '../bindings/types.js';

export const discoverTypesSchema = z.object({
  typeElementId: z
    .string()
    .optional()
    .describe(
      "Optional specific ObjectType elementId (e.g. 'BoilerType'). If omitted, lists all types.",
    ),
  namespaceUri: z
    .string()
    .optional()
    .describe("Optional namespaceUri filter (e.g. 'http://sterfive.com/UA/Demo/')"),
});

export async function handleDiscoverTypes(
  binding: I3XClientBinding,
  args: z.infer<typeof discoverTypesSchema>,
) {
  const { typeElementId, namespaceUri } = args;

  const [objectTypes, relationshipTypes, namespaces] = await Promise.all([
    binding.getObjectTypes(namespaceUri),
    binding.getRelationshipTypes(),
    binding.getNamespaces(),
  ]);

  if (typeElementId) {
    const matched = objectTypes.find((t) => t.elementId === typeElementId);
    if (!matched) {
      return {
        error: `ObjectType '${typeElementId}' not found.`,
        availableTypes: objectTypes.map((t) => t.elementId),
      };
    }
    return {
      objectType: matched,
    };
  }

  return {
    namespacesCount: namespaces.length,
    namespaces,
    objectTypesCount: objectTypes.length,
    objectTypes: objectTypes.map((t) => {
      const schemaObj =
        t.schema && typeof t.schema === 'object'
          ? (t.schema as Record<string, unknown>)
          : null;
      const required =
        schemaObj && Array.isArray(schemaObj.required)
          ? (schemaObj.required as string[])
          : [];

      return {
        elementId: t.elementId,
        displayName: t.displayName || t.elementId,
        namespaceUri: t.namespaceUri,
        requiredProperties: required,
      };
    }),
    relationshipTypesCount: relationshipTypes.length,
    relationshipTypes,
  };
}
