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
      "ISO 8601 start time or relative time string (e.g. '-2h', '-30m', '-1d') for history mode",
    ),
  endTime: z
    .string()
    .optional()
    .describe('ISO 8601 end time (defaults to now) for history mode'),
  aggregateStats: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to pre-compute min/max/mean statistical summaries for numeric sensor streams',
    ),
});

function parseStartTime(input?: string): string {
  if (!input) {
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return d.toISOString();
  }

  const match = input.match(/^-(\d+)([smhdw])$/i);
  if (match) {
    const amount = parseInt(match[1]!, 10);
    const unit = match[2]!.toLowerCase();
    const d = new Date();

    switch (unit) {
      case 's':
        d.setSeconds(d.getSeconds() - amount);
        break;
      case 'm':
        d.setMinutes(d.getMinutes() - amount);
        break;
      case 'h':
        d.setHours(d.getHours() - amount);
        break;
      case 'd':
        d.setDate(d.getDate() - amount);
        break;
      case 'w':
        d.setDate(d.getDate() - amount * 7);
        break;
    }
    return d.toISOString();
  }

  // Fallback to standard ISO Date parsing
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() - 1);
    return defaultDate.toISOString();
  }

  return parsed.toISOString();
}

export async function handleQueryTelemetry(
  binding: I3XClientBinding,
  args: z.infer<typeof queryTelemetrySchema>,
) {
  const { elementIds, mode, aggregateStats } = args;

  if (mode === 'current') {
    const values = await binding.getObjectValues(elementIds);
    return {
      mode: 'current',
      telemetry: values,
    };
  }

  // History mode
  const startTime = parseStartTime(args.startTime);
  const endTimeDate = args.endTime ? new Date(args.endTime) : new Date();
  const endTime = Number.isNaN(endTimeDate.getTime())
    ? new Date().toISOString()
    : endTimeDate.toISOString();

  const history = await binding.getHistoricalValues(elementIds, startTime, endTime);

  if (!aggregateStats) {
    return {
      mode: 'history',
      timeRange: { startTime, endTime },
      history,
    };
  }

  // Calculate pre-computed statistical aggregates
  const reports = history.map((record, idx) => {
    const elementId = elementIds[idx] || `element_${idx}`;
    const report: Record<string, unknown> = {
      elementId,
      timeRange: { startTime, endTime },
      dataPoints: record.values || [],
    };

    const numericValues: number[] = [];
    let badQualityCount = 0;

    for (const v of record.values || []) {
      if (v.quality && String(v.quality).toUpperCase() !== 'GOOD') {
        badQualityCount++;
      }
      if (typeof v.value === 'number' && !Number.isNaN(v.value)) {
        numericValues.push(v.value);
      }
    }

    if (numericValues.length > 0) {
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const sum = numericValues.reduce((a, b) => a + b, 0);
      const mean = Math.round((sum / numericValues.length) * 100) / 100;

      report.statistics = {
        min,
        max,
        mean,
        count: numericValues.length,
        badQualityCount,
      };
    } else {
      report.statistics = {
        count: (record.values || []).length,
        badQualityCount,
      };
    }

    return report;
  });

  return {
    mode: 'history',
    timeRange: { startTime, endTime },
    telemetryReports: reports,
  };
}
