"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { DashboardCharts } from "@/components/DashboardCharts";
import { IngestionControlPanel } from "@/components/IngestionControlPanel";
import { Button, Card, WebSocketStatusBadge } from "@/components/ui";
import {
  type AlertItem,
  type LiveEvent,
  type NamedValue,
  type SocDashboardResponse,
} from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

function toTitleCase(input: string): string {
  if (!input) {
    return "Unknown";
  }
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

function buildDashboardFromEvents(
  events: LiveEvent[],
  totalCases: number,
): SocDashboardResponse {
  const severityMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  const alertTypeMap = new Map<string, number>([
    ["EDR", 0],
    ["DLP", 0],
    ["Email", 0],
    ["IAM", 0],
    ["NDR", 0],
    ["Proxy", 0],
    ["Cloud", 0],
  ]);
  const overTimeMap = new Map<string, number>();
  const wordMap = new Map<string, number>();
  const closeReasonMap = new Map<string, number>([
    ["Escalated", 0],
    ["Investigating", 0],
    ["Benign", 0],
  ]);

  let highSeverity = 0;
  let criticalAlerts = 0;

  for (const item of events) {
    const detection =
      typeof item.detection === "object" && item.detection !== null
        ? (item.detection as Record<string, unknown>)
        : null;
    const severityRaw = String(
      item.severity || detection?.severity || "unknown",
    ).toLowerCase();
    const severityLabel = toTitleCase(severityRaw);
    severityMap.set(severityLabel, (severityMap.get(severityLabel) || 0) + 1);

    if (severityRaw === "high" || severityRaw === "critical") {
      highSeverity += 1;
    }
    if (severityRaw === "critical") {
      criticalAlerts += 1;
      closeReasonMap.set(
        "Escalated",
        (closeReasonMap.get("Escalated") || 0) + 1,
      );
    } else if (
      severityRaw === "low" &&
      String(item.attack_type || item.event_type || "").toLowerCase() ===
        "benign"
    ) {
      closeReasonMap.set("Benign", (closeReasonMap.get("Benign") || 0) + 1);
    } else {
      closeReasonMap.set(
        "Investigating",
        (closeReasonMap.get("Investigating") || 0) + 1,
      );
    }

    const attackTypeRaw = String(
      item.attack_type ||
        item.event_type ||
        detection?.attack_type ||
        "unknown",
    )
      .toLowerCase()
      .replace(/\s+/g, "");
    const mappedType =
      attackTypeRaw === "bruteforce"
        ? "IAM"
        : attackTypeRaw === "phishing"
          ? "Email"
          : attackTypeRaw === "webattack"
            ? "Proxy"
            : attackTypeRaw === "ddos" ||
                attackTypeRaw === "dos" ||
                attackTypeRaw === "portscan"
              ? "NDR"
              : attackTypeRaw === "botnet"
                ? "EDR"
                : attackTypeRaw === "infiltration"
                  ? "Cloud"
                  : "DLP";
    alertTypeMap.set(mappedType, (alertTypeMap.get(mappedType) || 0) + 1);

    const statusLabel = attackTypeRaw === "benign" ? "Closed" : "Open";
    statusMap.set(statusLabel, (statusMap.get(statusLabel) || 0) + 1);

    const timestamp = new Date(
      String(item.timestamp || new Date().toISOString()),
    );
    const timeKey = Number.isNaN(timestamp.getTime())
      ? "Unknown"
      : `${timestamp.getUTCFullYear()}-${String(timestamp.getUTCMonth() + 1).padStart(2, "0")}-${String(timestamp.getUTCDate()).padStart(2, "0")} ${String(timestamp.getUTCHours()).padStart(2, "0")}:00`;
    overTimeMap.set(timeKey, (overTimeMap.get(timeKey) || 0) + 1);

    if (attackTypeRaw.includes("brute")) {
      wordMap.set("iam", (wordMap.get("iam") || 0) + 1);
    }
    if (attackTypeRaw.includes("portscan")) {
      wordMap.set(
        "lateral-movement",
        (wordMap.get("lateral-movement") || 0) + 1,
      );
    }
    if (attackTypeRaw.includes("ddos") || attackTypeRaw.includes("dos")) {
      wordMap.set("exfiltration", (wordMap.get("exfiltration") || 0) + 1);
    }
    if (
      attackTypeRaw.includes("botnet") ||
      attackTypeRaw.includes("infiltration")
    ) {
      wordMap.set("malware", (wordMap.get("malware") || 0) + 1);
    }
  }

  const mapToValues = (source: Map<string, number>): NamedValue[] =>
    Array.from(source.entries()).map(([name, value]) => ({ name, value }));

  return {
    kpis: {
      total_cases: totalCases,
      high_severity: highSeverity,
      critical_alerts: criticalAlerts,
    },
    status_pie: mapToValues(statusMap),
    severity_pie: mapToValues(severityMap),
    alert_types_bar: mapToValues(alertTypeMap),
    alerts_over_time: Array.from(overTimeMap.entries())
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time)),
    word_cloud: Array.from(wordMap.entries()).map(([text, value]) => ({
      text,
      value,
    })),
    close_reason_bar: mapToValues(closeReasonMap),
  };
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const events = useSocStore((state) => state.events);
  const alerts = useSocStore((state) => state.alerts);
  const incidents = useSocStore((state) => state.incidents);
  const socketStatus = useSocStore((state) => state.socketStatus);
  const error = useSocStore((state) => state.error);
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const selectedApiKey = useSocStore((state) => state.selectedApiKey);
  const selectedIngestionMode = useSocStore(
    (state) => state.selectedIngestionMode,
  );
  const setInstanceFromRoute = useSocStore(
    (state) => state.setInstanceFromRoute,
  );
  const reconnectWebSocket = useSocStore((state) => state.reconnectWebSocket);
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);

  const logDashboardSnapshot = (label: string) => {
    console.log("[SOC][ui] dashboard snapshot", {
      label,
      instanceId: selectedInstanceId,
      socketStatus,
      alerts: alerts.length,
      incidents: incidents.length,
      bufferedEvents: events.length,
    });
  };

  useEffect(() => {
    const routeInstanceId = searchParams.get("instance_id");
    if (!routeInstanceId) {
      return;
    }
    void setInstanceFromRoute(routeInstanceId);
  }, [searchParams, setInstanceFromRoute]);

  const analyticsEvents = useMemo<LiveEvent[]>(() => {
    if (events.length) {
      return events;
    }

    return alerts.map((item: AlertItem) => ({
      timestamp: item.created_at,
      source_ip: item.source_ip || undefined,
      destination_ip: item.destination_ip || undefined,
      attack_type: item.attack_type || "Unknown",
      severity: item.severity,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    }));
  }, [alerts, events]);

  const dashboard = useMemo<SocDashboardResponse>(
    () => buildDashboardFromEvents(analyticsEvents, alerts.length),
    [alerts.length, analyticsEvents],
  );

  if (!selectedInstanceId || !selectedApiKey) {
    return (
      <Card title="Instance Required">
        <p className="text-sm text-muted-foreground">
          Select an instance in the control plane to start real-time SOC
          monitoring.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Real-Time SOC Feed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Real-Time SOC Feed
            </p>
            <p className="text-xs text-muted-foreground">
              Instance: {selectedInstanceId}
            </p>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              Total Alerts: {alerts.length}
            </p>
            <p className="text-xs text-muted-foreground">
              Total Incidents: {incidents.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <WebSocketStatusBadge status={socketStatus} />
            <Button
              variant="outline"
              size="sm"
              disabled={socketStatus === "open" || socketStatus === "connecting"}
              onClick={async () => {
                logDashboardSnapshot("before-reconnect-click");
                console.log("[SOC][ui] reconnect click start", { page: "dashboard" });

                reconnectWebSocket();

                try {
                  await refreshScopedData();
                  console.log("[SOC][ui] refreshScopedData completed", { page: "dashboard" });
                } catch (error) {
                  console.log("[SOC][ui] refreshScopedData failed", {
                    page: "dashboard",
                    error: error instanceof Error ? error.message : "unknown error",
                  });
                }

                window.setTimeout(() => {
                  logDashboardSnapshot("after-reconnect-click");
                }, 1200);
              }}
            >
              Reconnect
            </Button>
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <IngestionControlPanel
        instanceId={selectedInstanceId}
        apiKey={selectedApiKey}
        mode={selectedIngestionMode}
      />
      <DashboardCharts data={dashboard} />
    </div>
  );
}
