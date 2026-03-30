"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SocDashboardResponse, WordCloudItem } from "@/lib/api";

const CHART_COLORS = [
  "var(--brand-400)",
  "var(--brand-500)",
  "var(--primary)",
  "var(--accent)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--status-medium-fg)",
  "var(--destructive)",
];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
      {label ? (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div
            key={`${item.name || "value"}-${index}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground">
              {item.name || "Value"}
            </span>
            <span className="font-semibold text-foreground">
              {Number(item.value || 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 lg:p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PieChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = Math.max(
    data.reduce((sum, item) => sum + item.value, 0),
    1,
  );

  return (
    <SectionCard title={title}>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={98}
              paddingAngle={2}
              isAnimationActive
              animationDuration={900}
              onMouseLeave={() => setHoveredIndex(null)}
              onMouseEnter={(_, index) => setHoveredIndex(index)}
              labelLine={false}
              label={({ name, value, percent }) => {
                const pct = Math.round((percent || 0) * 100);
                return `${name}: ${pct}% (${Number(value || 0).toLocaleString()})`;
              }}
            >
              {data.map((entry, idx) => (
                <Cell
                  key={`${entry.name}-${idx}`}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  opacity={
                    hoveredIndex === null || hoveredIndex === idx ? 1 : 0.58
                  }
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.map((item, idx) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-semibold text-foreground">
              {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BarChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <SectionCard title={title}>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 12, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="name"
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "var(--muted)", fillOpacity: 0.28 }}
            />
            <Bar
              dataKey="value"
              radius={[8, 8, 0, 0]}
              onMouseMove={(_, index) => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <LabelList
                dataKey="value"
                position="top"
                fill="var(--foreground)"
                fontSize={11}
              />
              {data.map((entry, idx) => (
                <Cell
                  key={`${entry.name}-${idx}`}
                  fill="var(--primary)"
                  opacity={
                    hoveredIndex === null || hoveredIndex === idx ? 1 : 0.52
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function LineChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<{ time: string; count: number }>;
}) {
  const points = useMemo(() => {
    return [...data]
      .map((item, index) => ({
        ...item,
        _index: index,
        _ts: Number.isFinite(new Date(item.time).getTime())
          ? new Date(item.time).getTime()
          : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => {
        if (a._ts === b._ts) {
          return a._index - b._index;
        }
        return a._ts - b._ts;
      })
      .map(({ _index, _ts, ...item }) => item);
  }, [data]);

  return (
    <SectionCard title={title}>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 16, right: 12, left: 0, bottom: 6 }}
          >
            <defs>
              <linearGradient id="alertsArea" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 11 }}
              minTickGap={26}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#alertsArea)"
              dot={{
                r: 3.5,
                fill: "var(--card)",
                stroke: "var(--primary)",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 5,
                fill: "var(--primary)",
                stroke: "var(--background)",
                strokeWidth: 2,
              }}
              isAnimationActive
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function TagCloud({ data }: { data: WordCloudItem[] }) {
  const min = Math.min(...data.map((item) => item.value), 0);
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {data.map((item, index) => {
        const weight = (item.value - min) / Math.max(max - min, 1);
        const spanClass = weight > 0.72 ? "sm:col-span-2" : "col-span-1";
        const size = `${(0.8 + weight * 0.7).toFixed(2)}rem`;
        return (
          <button
            key={`${item.text}-${index}`}
            type="button"
            className={`group flex min-h-12 items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-left transition duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${spanClass}`}
          >
            <span
              className="truncate font-semibold text-foreground transition-colors group-hover:text-primary"
              style={{ fontSize: size }}
            >
              {item.text}
            </span>
            <span className="ml-2 shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {item.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CloseReasonChips({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const total = Math.max(
    data.reduce((sum, item) => sum + item.value, 0),
    1,
  );

  return (
    <div className="space-y-2">
      {data
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((item, index) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div
              key={`${item.name}-${index}`}
              className="rounded-lg border border-border bg-muted/35 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                </div>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-semibold text-foreground">
                  {item.value}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${pct}%`,
                    background: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "critical" | "high" | "base";
}) {
  const toneClass =
    tone === "critical"
      ? "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]"
      : tone === "high"
        ? "border-[var(--status-high-fg)] bg-[var(--status-high-bg)]"
        : "border-border bg-card";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export function DashboardCharts({ data }: { data: SocDashboardResponse }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            title="Total Cases"
            value={data.kpis.total_cases}
            tone="base"
          />
          <KpiCard
            title="High Severity"
            value={data.kpis.high_severity}
            tone="high"
          />
          <KpiCard
            title="Critical Alerts"
            value={data.kpis.critical_alerts}
            tone="critical"
          />
        </div>
        <section className="rounded-xl border border-border bg-card p-4 lg:p-5">
          <p className="text-sm text-muted-foreground">Loading charts...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Total Cases"
          value={data.kpis.total_cases}
          tone="base"
        />
        <KpiCard
          title="High Severity"
          value={data.kpis.high_severity}
          tone="high"
        />
        <KpiCard
          title="Critical Alerts"
          value={data.kpis.critical_alerts}
          tone="critical"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PieChartCard title="Status Breakdown" data={data.status_pie} />
        <PieChartCard title="Severity Breakdown" data={data.severity_pie} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BarChartCard title="Alert Types" data={data.alert_types_bar} />
        <LineChartCard title="Alerts Over Time" data={data.alerts_over_time} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Tag Word Cloud">
          <TagCloud data={data.word_cloud} />
        </SectionCard>

        <SectionCard title="Close Reasons">
          <CloseReasonChips data={data.close_reason_bar} />
        </SectionCard>
      </div>
    </div>
  );
}
