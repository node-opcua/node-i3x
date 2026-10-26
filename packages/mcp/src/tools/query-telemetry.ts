import type { VQT } from '@node-i3x/core';
import { z } from 'zod';
import type { I3XClientBinding } from '../bindings/types.js';

export const queryTelemetrySchema = z.object({
  elementIds: z
    .array(z.string())
    .min(1)
    .describe("Array of asset elementIds to query (e.g. ['Pump_101', 'Boiler_101'])"),
  mode: z
    .enum(['current', 'history'])
    .optional()
    .default('current')
    .describe(
      "Query mode: 'current' for live VQT telemetry, 'history' for time-series trend analysis",
    ),
  startTime: z
    .string()
    .optional()
    .describe(
      "ISO 8601 start time or relative time string (e.g. '-2h', '-30m', '-1d') for history mode (default: -1h)",
    ),
  endTime: z
    .string()
    .optional()
    .describe(
      "ISO 8601 end time or relative time string (e.g. '-10m') for history mode (default: now)",
    ),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(2)
    .describe(
      'Read depth through components: 1 = the element only, 2 = with its components (default), 0 = unlimited',
    ),
  aggregateStats: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to pre-compute min/max/mean statistical summaries for numeric sensor streams',
    ),
});

const RELATIVE_TIME = /^-(\d+)([smhdw])$/i;
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** ISO 8601 or relative ('-2h') time to ISO; an unparseable value is an error, not a default. */
export function parseTime(
  input: string | undefined,
  fallback: Date,
  name: string,
): string {
  if (!input) return fallback.toISOString();

  const match = input.match(RELATIVE_TIME);
  if (match) {
    const amount = Number.parseInt(match[1]!, 10);
    return new Date(
      Date.now() - amount * UNIT_MS[match[2]!.toLowerCase()]!,
    ).toISOString();
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid ${name} '${input}': expected ISO 8601 (e.g. '2026-10-25T10:00:00Z') or a relative time (e.g. '-2h').`,
    );
  }
  return parsed.toISOString();
}

/** GoodNoData is a good status (no data in range), not a bad sample. */
function isBadQuality(quality: unknown): boolean {
  return quality != null && !String(quality).toLowerCase().startsWith('good');
}

function seriesStatistics(values: readonly VQT[]) {
  const numericValues: number[] = [];
  let badQualityCount = 0;
  for (const v of values) {
    if (isBadQuality(v.quality)) badQualityCount++;
    if (typeof v.value === 'number' && !Number.isNaN(v.value))
      numericValues.push(v.value);
  }
  if (numericValues.length === 0) return { count: values.length, badQualityCount };

  const sum = numericValues.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
    mean: Math.round((sum / numericValues.length) * 100) / 100,
    count: numericValues.length,
    badQualityCount,
  };
}

export async function handleQueryTelemetry(
  binding: I3XClientBinding,
  args: z.infer<typeof queryTelemetrySchema>,
) {
  const { elementIds, mode, aggregateStats, maxDepth } = args;

  if (mode === 'current') {
    const values = await binding.getObjectValues(elementIds, maxDepth);
    return {
      mode: 'current',
      telemetry: values,
    };
  }

  // History mode
  const now = new Date();
  const startTime = parseTime(
    args.startTime,
    new Date(now.getTime() - UNIT_MS.h!),
    'startTime',
  );
  const endTime = parseTime(args.endTime, now, 'endTime');
  if (startTime > endTime) {
    throw new Error(`startTime ${startTime} is after endTime ${endTime}.`);
  }

  const history = await binding.getHistoricalValues(
    elementIds,
    startTime,
    endTime,
    maxDepth,
  );

  if (!aggregateStats) {
    return {
      mode: 'history',
      timeRange: { startTime, endTime },
      history,
    };
  }

  // Statistics per series: the element's own values and each component separately,
  // since mixing e.g. a temperature with a pressure is meaningless.
  const reports = history.map(({ elementId, result, error }) => {
    if (error || !result) return { elementId, error: error ?? 'No history returned' };

    const report: Record<string, unknown> = {
      elementId,
      dataPoints: result.values ?? [],
      statistics: seriesStatistics(result.values ?? []),
    };
    if (result.components) {
      report.components = Object.fromEntries(
        Object.entries(result.components).map(([componentId, { values }]) => [
          componentId,
          { dataPoints: values ?? [], statistics: seriesStatistics(values ?? []) },
        ]),
      );
    }
    return report;
  });

  return {
    mode: 'history',
    timeRange: { startTime, endTime },
    telemetryReports: reports,
  };
}
