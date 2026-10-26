import { z } from 'zod';

/** Distinct elementIds per call: bounds request size and the tool result. */
export const MAX_ELEMENT_IDS = 100;

/** elementIds, deduplicated in order: repeated ids only multiply the output. */
export function elementIdsSchema(description: string) {
  return z
    .array(z.string())
    .min(1)
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length <= MAX_ELEMENT_IDS, {
      message: `At most ${MAX_ELEMENT_IDS} distinct elementIds per call.`,
    })
    .describe(`${description}; duplicates are ignored, at most ${MAX_ELEMENT_IDS}`);
}
