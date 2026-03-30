"use client";

import { useEffect, useState } from "react";

import { MetricsPanel } from "@/components/MetricsPanel";
import { Button, Card, StatusBadge } from "@/components/ui";
import { apiGet, type MlMetricsResponse, withInstanceQuery } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

export default function MlAnalyticsPage() {
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const [metrics, setMetrics] = useState<MlMetricsResponse | null>(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async (active = true) => {
    try {
      setIsRefreshing(true);
      const data = await apiGet<MlMetricsResponse>(
        withInstanceQuery("/soc/ml/metrics", selectedInstanceId),
      );
      if (active) {
        setMetrics(data);
        setError("");
      }
    } catch (err) {
      if (active) {
        setError(
          err instanceof Error ? err.message : "Failed to load ML metrics",
        );
      }
    } finally {
      if (active) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    let active = true;

    load(active);
    return () => {
      active = false;
    };
  }, [selectedInstanceId]);

  return (
    <div className="space-y-4">
      <Card title="ML Analytics Panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Model quality and attack prediction telemetry.
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge label={isRefreshing ? "running" : "success"} />
            <Button variant="outline" size="sm" onClick={() => void load(true)}>
              Refresh Metrics
            </Button>
          </div>
        </div>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {metrics ? (
        <MetricsPanel data={metrics} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading ML metrics...</p>
      )}
    </div>
  );
}
