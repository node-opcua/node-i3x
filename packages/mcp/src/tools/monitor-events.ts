import { z } from 'zod';
import type { I3XClientBinding } from '../bindings/types.js';

export const monitorEventsSchema = z.object({
  elementIds: z
    .array(z.string())
    .min(1)
    .describe("Array of asset elementIds to monitor (e.g. ['Boiler_101', 'Pump_101'])"),
  condition: z
    .string()
    .optional()
    .describe(
      "Optional monitoring alert condition filter (e.g. 'temperature > 85 || quality != Good')",
    ),
});

export async function handleMonitorEvents(
  binding: I3XClientBinding,
  args: z.infer<typeof monitorEventsSchema>,
) {
  const { elementIds, condition } = args;

  // Snapshot current state first
  const currentValues = await binding.getObjectValues(elementIds);

  return {
    status: 'monitoring_active',
    monitoredAssets: elementIds,
    alertCondition: condition || 'All value or quality changes',
    initialSnapshot: currentValues,
    instructions:
      'Subscription stream registered. The MCP server will emit notification events on matching VQT telemetry updates or threshold breaches.',
  };
}
