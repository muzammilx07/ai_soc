"use client";

import { useEffect, useState } from "react";

import { DashboardCharts } from "@/components/DashboardCharts";
import { Button, Card, StatusBadge } from "@/components/ui";
import {
  apiGet,
  getWsBase,
  type SocDashboardResponse,
  type NamedValue,
  type SocSocketPayload,
} from "@/lib/api";

function toTitleCase(input: string): string {
  if (!input) {
    return "Unknown";
  }
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

function buildDashboardFromSocket(payload: SocSocketPayload): SocDashboardResponse {
  const events = Array.isArray(payload.events) ? payload.events : [];
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
    const severityRaw = String(item.severity || "unknown").toLowerCase();
    const severityLabel = toTitleCase(severityRaw);
    severityMap.set(severityLabel, (severityMap.get(severityLabel) || 0) + 1);

    if (severityRaw === "high" || severityRaw === "critical") {
      highSeverity += 1;
    }
    if (severityRaw === "critical") {
      criticalAlerts += 1;
      closeReasonMap.set("Escalated", (closeReasonMap.get("Escalated") || 0) + 1);
    } else if (severityRaw === "low" && String(item.attack_type || "").toLowerCase() === "benign") {
      closeReasonMap.set("Benign", (closeReasonMap.get("Benign") || 0) + 1);
    } else {
      closeReasonMap.set("Investigating", (closeReasonMap.get("Investigating") || 0) + 1);
    }

    const attackTypeRaw = String(item.attack_type || "unknown").toLowerCase().replace(/\s+/g, "");
    const mappedType =
      attackTypeRaw === "bruteforce"
        ? "IAM"
        : attackTypeRaw === "phishing"
          ? "Email"
          : attackTypeRaw === "webattack"
            ? "Proxy"
            : attackTypeRaw === "ddos" || attackTypeRaw === "dos" || attackTypeRaw === "portscan"
              ? "NDR"
              : attackTypeRaw === "botnet"
                ? "EDR"
                : attackTypeRaw === "infiltration"
                  ? "Cloud"
                  : "DLP";
    alertTypeMap.set(mappedType, (alertTypeMap.get(mappedType) || 0) + 1);

    const statusLabel = attackTypeRaw === "benign" ? "Closed" : "Open";
    statusMap.set(statusLabel, (statusMap.get(statusLabel) || 0) + 1);

    const timestamp = new Date(String(item.timestamp || payload.timestamp));
    const timeKey = Number.isNaN(timestamp.getTime())
      ? "Unknown"
      : `${timestamp.getUTCFullYear()}-${String(timestamp.getUTCMonth() + 1).padStart(2, "0")}-${String(timestamp.getUTCDate()).padStart(2, "0")} ${String(timestamp.getUTCHours()).padStart(2, "0")}:00`;
    overTimeMap.set(timeKey, (overTimeMap.get(timeKey) || 0) + 1);

    if (attackTypeRaw.includes("brute")) {
      wordMap.set("iam", (wordMap.get("iam") || 0) + 1);
    }
    if (attackTypeRaw.includes("portscan")) {
      wordMap.set("lateral-movement", (wordMap.get("lateral-movement") || 0) + 1);
    }
    if (attackTypeRaw.includes("ddos") || attackTypeRaw.includes("dos")) {
      wordMap.set("exfiltration", (wordMap.get("exfiltration") || 0) + 1);
    }
    if (attackTypeRaw.includes("botnet") || attackTypeRaw.includes("infiltration")) {
      wordMap.set("malware", (wordMap.get("malware") || 0) + 1);
    }
  }

  const mapToValues = (source: Map<string, number>): NamedValue[] =>
    Array.from(source.entries()).map(([name, value]) => ({ name, value }));

  const totalCases = payload.total_count ?? payload.count ?? events.length;

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
    word_cloud: Array.from(wordMap.entries()).map(([text, value]) => ({ text, value })),
    close_reason_bar: mapToValues(closeReasonMap),
  };
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<SocDashboardResponse | null>(null);
  const [liveEventsCount, setLiveEventsCount] = useState(0);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [error, setError] = useState("");

  const loadDashboard = async (active = true) => {
    try {
      const data = await apiGet<SocDashboardResponse>("/soc/dashboard");

      if (!active) {
        return;
      }

      setDashboard(data);
      setError("");
    } catch (err) {
      if (!active) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    }
  };

  useEffect(() => {
    let active = true;

    loadDashboard(active);

    const socket = new WebSocket(`${getWsBase()}/soc/ws/live`);
    socket.onopen = () => {
      if (active) {
        setSocketStatus("open");
      }
    };
    socket.onclose = () => {
      if (active) {
        setSocketStatus("closed");
      }
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SocSocketPayload;
        if (active) {
          setLiveEventsCount(data.total_count ?? data.count ?? 0);
          setDashboard((previous) => {
            const liveDashboard = buildDashboardFromSocket(data);
            if (!previous) {
              return liveDashboard;
            }

            return {
              ...previous,
              ...liveDashboard,
            };
          });
        }
      } catch {
        if (active) {
          setSocketStatus("closed");
        }
      }
    };

    return () => {
      active = false;
      socket.close();
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card title="Real-Time SOC Feed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Real-Time SOC Feed</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">Live Alerts: {liveEventsCount}</p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge label={socketStatus} />
            <Button variant="outline" size="sm" onClick={() => void loadDashboard(true)}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {dashboard ? <DashboardCharts data={dashboard} /> : <p className="text-sm text-muted-foreground">Loading dashboard...</p>}
    </div>
  );
}
