import { z } from 'zod';
import type { I3XClientBinding } from '../bindings/types.js';

export const monitorEventsSchema = z.object({
  elementIds: z
    .array(z.string())
    .min(1)
    .describe("Array of asset elementIds to check (e.g. ['Boiler_101', 'Pump_101'])"),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(2)
    .describe(
      'Read depth through components: 1 = the element only, 2 = with its components (default), 0 = unlimited',
    ),
});

/**
 * One-shot health snapshot: current values plus every series whose quality is not Good.
 * It does not subscribe: MCP tool calls are request/response, so call it again to re-check.
 */
export async function handleMonitorEvents(
  binding: I3XClientBinding,
  args: z.infer<typeof monitorEventsSchema>,
) {
  const { elementIds, maxDepth } = args;
  const snapshot = await binding.getObjectValues(elementIds, maxDepth);

  const alerts: Array<{ elementId: string; quality?: string; error?: string }> = [];
  for (const { elementId, result, error } of snapshot) {
    if (error) {
      alerts.push({ elementId, error });
      continue;
    }
    if (result && !isGood(result.quality)) {
      alerts.push({ elementId, quality: result.quality });
    }
    for (const [componentId, vqt] of Object.entries(result?.components ?? {})) {
      if (!isGood(vqt.quality))
        alerts.push({ elementId: componentId, quality: vqt.quality });
    }
  }

  return {
    status: 'snapshot',
    checkedAt: new Date().toISOString(),
    alerts,
    snapshot,
    note: 'Point-in-time read; no subscription is created. Call again to re-check.',
  };
}

function isGood(quality: unknown): boolean {
  return String(quality).toLowerCase().startsWith('good');
}
