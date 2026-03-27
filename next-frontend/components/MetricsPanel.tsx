"use client";

import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MlMetricsResponse } from "@/lib/api";

const DIST_COLORS = [
  "var(--status-info-fg)",
  "var(--status-ok-fg)",
  "var(--brand-500)",
  "var(--destructive)",
  "var(--chart-4)",
  "var(--chart-2)",
];

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{(value * 100).toFixed(2)}%</p>
    </div>
  );
}

export function MetricsPanel({ data }: { data: MlMetricsResponse }) {
  const distribution = Object.entries(data.prediction_distribution).map(([name, value]) => ({ name, value }));
  const distributionTotal = Math.max(
    distribution.reduce((sum, item) => sum + Number(item.value || 0), 0),
    1,
  );
  const maxCell = Math.max(...data.confusion_matrix.map((item) => item.value), 1);
  const modelEntries = Object.entries(data.models || {});

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Accuracy" value={data.accuracy} />
        <MetricTile label="Precision" value={data.precision} />
        <MetricTile label="Recall" value={data.recall} />
        <MetricTile label="F1 Score" value={data.f1_score} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Model Algorithms</h3>
          {modelEntries.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modelEntries.map(([name, metrics]) => (
                <div key={name} className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm font-semibold text-foreground">{name.replace(/_/g, " ")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Accuracy: {typeof metrics.accuracy === "number" ? (metrics.accuracy * 100).toFixed(2) + "%" : "-"}</p>
                  <p className="text-xs text-muted-foreground">Weighted F1: {typeof metrics.weighted_f1 === "number" ? (metrics.weighted_f1 * 100).toFixed(2) + "%" : "-"}</p>
                  <p className="text-xs text-muted-foreground">ROC AUC: {typeof metrics.roc_auc === "number" ? metrics.roc_auc.toFixed(4) : "-"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No model metadata available.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Confusion Matrix Heatmap</h3>
          <div className="grid grid-cols-3 gap-2">
            {data.confusion_matrix.map((item, index) => {
              const alpha = Math.max(0.14, item.value / maxCell);
              return (
                <div
                  key={`${item.actual}-${item.predicted}-${index}`}
                  className="rounded-lg border border-border p-2"
                  style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(alpha * 45)}%, var(--card))` }}
                >
                  <p className="text-[10px] uppercase text-muted-foreground">A: {item.actual}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">P: {item.predicted}</p>
                  <p className="text-lg font-bold text-foreground">{item.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">ROC Curve (AUC {data.roc_auc.toFixed(3)})</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.roc_curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="fpr" stroke="var(--muted-foreground)" />
                <YAxis dataKey="tpr" stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line type="monotone" dataKey="tpr" stroke="var(--brand-500)" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Prediction Distribution</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distribution}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={120}
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${Math.round((percent || 0) * 100)}% (${Number(value || 0).toLocaleString()})`}
              >
                {distribution.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={DIST_COLORS[idx % DIST_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {distribution.map((item, idx) => (
            <div key={item.name} className="flex items-center justify-between rounded-md border border-border bg-muted/35 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIST_COLORS[idx % DIST_COLORS.length] }} />
                <span className="text-muted-foreground">{item.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {Number(item.value || 0).toLocaleString()} ({Math.round((Number(item.value || 0) / distributionTotal) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
