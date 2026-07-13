"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DailySeriesPoint = {
  date: string; // MM/DD
  applications: number;
  views: number;
};

export type PartyViewSeries = {
  partyId: string;
  title: string;
  totalViews: number;
  /** dateKey (YYYY-MM-DD) → viewCount */
  byDate: Record<string, number>;
};

const SERIES_COLORS = [
  "#9C6CF2",
  "#C23E73",
  "#14b8a6",
  "#6366f1",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#10b981",
];

export function DashboardMonthChart({ data }: { data: DailySeriesPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="applications"
            name="신청"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="views"
            name="조회(합계)"
            stroke="#14b8a6"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PartyViewsCompare({
  dateKeys,
  parties,
  defaultSelected = 5,
}: {
  /** YYYY-MM-DD keys in order */
  dateKeys: string[];
  parties: PartyViewSeries[];
  defaultSelected?: number;
}) {
  const ranked = useMemo(
    () => [...parties].sort((a, b) => b.totalViews - a.totalViews),
    [parties],
  );

  const [selected, setSelected] = useState<Set<string>>(() => {
    const top = ranked.slice(0, defaultSelected).map((p) => p.partyId);
    return new Set(top.length > 0 ? top : ranked.slice(0, 3).map((p) => p.partyId));
  });

  const chartData = useMemo(() => {
    return dateKeys.map((key) => {
      const row: Record<string, string | number> = {
        date: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
      };
      for (const p of ranked) {
        if (!selected.has(p.partyId)) continue;
        row[p.partyId] = p.byDate[key] ?? 0;
      }
      return row;
    });
  }, [dateKeys, ranked, selected]);

  const selectedParties = ranked.filter((p) => selected.has(p.partyId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (ranked.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        이번 달 파티별 조회 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ranked.map((p, i) => (
          <label
            key={p.partyId}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={selected.has(p.partyId)}
              onChange={() => toggle(p.partyId)}
            />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="truncate max-w-[180px]">{p.title}</span>
          </label>
        ))}
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {selectedParties.map((p) => {
              const colorIdx = ranked.findIndex((r) => r.partyId === p.partyId);
              return (
                <Line
                  key={p.partyId}
                  type="monotone"
                  dataKey={p.partyId}
                  name={p.title}
                  stroke={SERIES_COLORS[colorIdx % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>파티</TableHead>
              <TableHead className="text-right">이번 달 조회</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((p) => (
              <TableRow key={p.partyId}>
                <TableCell className="font-medium text-sm">{p.title}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.totalViews.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
