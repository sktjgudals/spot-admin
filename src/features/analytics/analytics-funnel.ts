import {
  AnalyticsDataApiError,
  runAnalyticsFunnelReport,
  type AnalyticsDataApiOptions,
  type AnalyticsFunnelSubReport,
} from "./analytics-data-api";
import { normalizePlatform, type AnalyticsFilters } from "./analytics-filters";
import {
  dataQualityNoticesForReport,
  numericValue,
  quotaFromReports,
} from "./analytics-report-shaping";
import {
  FUNNEL_DEFINITIONS,
  buildFunnelRequest,
  type FunnelDefinition,
  type FunnelId,
} from "./funnel-definitions";
import type {
  AnalyticsDateRange,
  AnalyticsFunnelResult,
  AnalyticsFunnelStepResult,
  AnalyticsPropertyConfig,
} from "./types";

/** GA4 marks the un-broken-down totals with this reserved breakdown value. */
export const FUNNEL_TOTAL_VALUE = "RESERVED_TOTAL";

/** GA4 prefixes each step label with its 1-based position: "1. 파티 상세". */
const STEP_PREFIX = /^(\d+)\.\s*/;

type StepMetrics = {
  users: number;
  completionRate: number;
  abandonments: number;
  abandonmentRate: number;
};

function metricIndexes(table: AnalyticsFunnelSubReport) {
  const index = (name: string) =>
    table.metricHeaders.findIndex((header) => header.name === name);
  return {
    users: index("activeUsers"),
    completionRate: index("funnelStepCompletionRate"),
    abandonments: index("funnelStepAbandonments"),
    abandonmentRate: index("funnelStepAbandonmentRate"),
  };
}

/**
 * The two rate metrics arrive typed `TYPE_INTEGER` while holding fractions
 * ("0.412" is 41.2 %). Parsing them as floats regardless is the whole point of
 * not reading `metricHeaders[].type`.
 */
function readStepMetrics(
  values: readonly { value: string }[],
  indexes: ReturnType<typeof metricIndexes>,
): StepMetrics {
  return {
    users: numericValue(values[indexes.users]?.value),
    completionRate: numericValue(values[indexes.completionRate]?.value),
    abandonments: numericValue(values[indexes.abandonments]?.value),
    abandonmentRate: numericValue(values[indexes.abandonmentRate]?.value),
  };
}

function stepIndexOf(label: string, appearance: Map<string, number>): number {
  const match = STEP_PREFIX.exec(label);
  if (match) {
    const parsed = Number(match[1]) - 1;
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  const existing = appearance.get(label);
  if (existing !== undefined) return existing;
  const next = appearance.size;
  appearance.set(label, next);
  return next;
}

function buildSteps(
  byIndex: Map<number, StepMetrics>,
  definition: FunnelDefinition,
): AnalyticsFunnelStepResult[] {
  const firstUsers = byIndex.get(0)?.users ?? 0;
  const lastIndex = definition.steps.length - 1;
  return definition.steps.map((step, index) => {
    const metrics = byIndex.get(index);
    const users = metrics?.users ?? 0;
    // The last step has no next step, so GA4's completion and abandonment
    // figures there describe nothing. Showing "0%" would read as total loss.
    const isLast = index === lastIndex;
    return {
      index,
      name: step.name,
      users,
      completionRate: isLast ? null : (metrics?.completionRate ?? null),
      abandonments: isLast ? null : (metrics?.abandonments ?? null),
      abandonmentRate: isLast ? null : (metrics?.abandonmentRate ?? null),
      shareOfFirst: firstUsers > 0 ? users / firstUsers : 0,
    };
  });
}

export function shapeFunnel(
  table: AnalyticsFunnelSubReport,
  definition: FunnelDefinition,
  breakdown: boolean,
): {
  steps: AnalyticsFunnelStepResult[];
  breakdown: AnalyticsFunnelResult["breakdown"];
} {
  const indexes = metricIndexes(table);
  const appearance = new Map<string, number>();
  const totals = new Map<number, StepMetrics>();
  const grouped = new Map<string, Map<number, StepMetrics>>();

  for (const row of table.rows) {
    const label = row.dimensionValues[0]?.value ?? "";
    const stepIndex = stepIndexOf(label, appearance);
    const metrics = readStepMetrics(row.metricValues, indexes);

    if (!breakdown) {
      totals.set(stepIndex, metrics);
      continue;
    }
    const breakdownValue = row.dimensionValues[1]?.value ?? "";
    if (breakdownValue === FUNNEL_TOTAL_VALUE) {
      totals.set(stepIndex, metrics);
      continue;
    }
    const value = normalizePlatform(breakdownValue);
    const bucket = grouped.get(value) ?? new Map<number, StepMetrics>();
    bucket.set(stepIndex, metrics);
    grouped.set(value, bucket);
  }

  const steps = buildSteps(totals, definition);
  if (!breakdown) return { steps, breakdown: null };

  const rows = Array.from(grouped, ([value, byIndex]) => ({
    value,
    steps: buildSteps(byIndex, definition),
  })).sort(
    (a, b) =>
      (b.steps[0]?.users ?? 0) - (a.steps[0]?.users ?? 0) ||
      a.value.localeCompare(b.value),
  );
  return { steps, breakdown: { dimension: "platform", rows } };
}

export type FetchFunnelInput = {
  property: AnalyticsPropertyConfig;
  range: AnalyticsDateRange;
  filters: AnalyticsFilters;
  funnelId: FunnelId;
  breakdown: boolean;
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: AnalyticsDataApiOptions["fetchImpl"];
};

export async function fetchFunnel(
  input: FetchFunnelInput,
): Promise<AnalyticsFunnelResult> {
  const definition = FUNNEL_DEFINITIONS[input.funnelId];
  const response = await runAnalyticsFunnelReport(
    input.property.id,
    buildFunnelRequest(definition, input.range, input.filters, input.breakdown),
    {
      accessToken: input.accessToken,
      signal: input.signal,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    },
  );

  const table = response.funnelTable;
  if (!table) {
    // `assertFunnelContract` already rejected this; the guard narrows the type.
    throw new AnalyticsDataApiError(
      "invalid-response",
      "Google Analytics 퍼널 응답에 결과 표가 없습니다.",
    );
  }

  const { steps, breakdown } = shapeFunnel(table, definition, input.breakdown);
  return {
    view: "funnel",
    funnelId: definition.id,
    title: definition.title,
    description: definition.description,
    steps,
    breakdown,
    // A funnel reports people, never money; the union carries the field so the
    // dashboard can format any result the same way.
    currencyCode: "KRW",
    quota: quotaFromReports([response], "funnel"),
    dataQualityNotices: dataQualityNoticesForReport(table.metadata, {
      key: `funnel:${definition.id}`,
      title: definition.title,
    }),
    isEmpty: steps.every((step) => step.users === 0),
  };
}
