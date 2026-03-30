"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Button,
  Card,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  WebSocketStatusBadge,
} from "@/components/ui";
import { type AlertItem, type LiveEvent } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

function getSeverityCount(events: LiveEvent[], severity: string): number {
  return events.filter((event) => String(event.severity || "").toLowerCase() === severity).length;
}

export default function LiveEventsPage() {
  const events = useSocStore((state) => state.events);
  const totalEventsCount = useSocStore((state) => state.totalEventsCount);
  const alerts = useSocStore((state) => state.alerts);
  const incidents = useSocStore((state) => state.incidents);
  const queueBackend = useSocStore((state) => state.queueBackend);
  const socketStatus = useSocStore((state) => state.socketStatus);
  const streamError = useSocStore((state) => state.error);
  const reconnectWebSocket = useSocStore((state) => state.reconnectWebSocket);
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);
  const enforceLiveLimitNow = useSocStore((state) => state.enforceLiveLimitNow);

  const logUiSnapshot = (label: string) => {
    console.log("[SOC][ui] live-events snapshot", {
      label,
      socketStatus,
      alerts: alerts.length,
      incidents: incidents.length,
      bufferedEvents: events.length,
      sessionEvents: totalEventsCount,
      queueBackend,
    });
  };

  const [maxLimitEnabled, setMaxLimitEnabled] = useState(true);
  const [maxEvents, setMaxEvents] = useState(300);
  const effectiveMaxEvents = useMemo(
    () => Math.max(20, Math.min(5000, Math.floor(maxEvents))),
    [maxEvents],
  );
  const isCapped = maxLimitEnabled && totalEventsCount >= effectiveMaxEvents;

  useEffect(() => {
    const syncSettings = () => {
      const savedLimitEnabled =
        window.localStorage.getItem("soc.live.max.enabled") ??
        window.localStorage.getItem("soc.live.rate.enabled");
      const savedLimitCount =
        window.localStorage.getItem("soc.live.max.count") ??
        window.localStorage.getItem("soc.live.rate.limitPerMin");

      const enabled = savedLimitEnabled !== "false";
      setMaxLimitEnabled(enabled);

      let normalized = effectiveMaxEvents;
      if (savedLimitCount) {
        const parsed = Number(savedLimitCount);
        if (Number.isFinite(parsed) && parsed > 0) {
          normalized = Math.max(20, Math.min(5000, Math.floor(parsed)));
        }
      }

      setMaxEvents(normalized);
      enforceLiveLimitNow();
    };

    syncSettings();
    window.addEventListener("soc-live-settings-updated", syncSettings);
    return () => {
      window.removeEventListener("soc-live-settings-updated", syncSettings);
    };
  }, [effectiveMaxEvents, enforceLiveLimitNow]);

  useEffect(() => {
    logUiSnapshot("state-change");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    socketStatus,
    alerts.length,
    incidents.length,
    events.length,
    totalEventsCount,
    queueBackend,
  ]);

  const eventSource = useMemo<LiveEvent[]>(() => {
    if (events.length) {
      return events;
    }

    return alerts.map((item: AlertItem) => ({
      timestamp: item.created_at,
      source_ip: item.source_ip || undefined,
      destination_ip: item.destination_ip || undefined,
      attack_type: item.attack_type || "Unknown",
      severity: item.severity,
      confidence:
        typeof item.confidence === "number" ? item.confidence : undefined,
    }));
  }, [alerts, events]);

  const visibleEvents = useMemo(() => {
    if (!maxLimitEnabled) {
      return eventSource;
    }
    return eventSource.slice(0, effectiveMaxEvents);
  }, [eventSource, maxLimitEnabled, effectiveMaxEvents]);

  const critical = useMemo(
    () => getSeverityCount(eventSource, "critical"),
    [eventSource],
  );
  const high = useMemo(
    () => getSeverityCount(eventSource, "high"),
    [eventSource],
  );
  const medium = useMemo(
    () => getSeverityCount(eventSource, "medium"),
    [eventSource],
  );

  return (
    <div className="space-y-4">
      <Card title="Live Event Stream">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Alerts (Synced)
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {alerts.length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Incidents (Synced)
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {incidents.length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              High
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {high}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Medium
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {medium}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WebSocketStatusBadge status={socketStatus} />
          <Button
            variant="outline"
            size="sm"
            disabled={socketStatus === "open" || socketStatus === "connecting"}
            onClick={async () => {
              logUiSnapshot("before-reconnect-click");
              console.log("[SOC][ui] reconnect click start", {
                page: "live-events",
              });

              reconnectWebSocket();

              try {
                await refreshScopedData();
                console.log("[SOC][ui] refreshScopedData completed", {
                  page: "live-events",
                });
              } catch (error) {
                console.log("[SOC][ui] refreshScopedData failed", {
                  page: "live-events",
                  error:
                    error instanceof Error ? error.message : "unknown error",
                });
              }

              window.setTimeout(() => {
                logUiSnapshot("after-reconnect-click");
              }, 1200);
            }}
          >
            Reconnect
          </Button>
          <p className="text-sm text-muted-foreground">
            Queue backend: {queueBackend}
          </p>
          <p className="text-sm text-muted-foreground">
            Session events: {totalEventsCount}
          </p>
          <p className="text-sm text-muted-foreground">
            Display source: {events.length ? "websocket" : "persisted alerts"}
          </p>
          <p className="text-sm text-muted-foreground">
            Window size: {visibleEvents.length}
          </p>
          <p className="text-sm text-muted-foreground">
            Max Limit: {maxLimitEnabled ? `ON (${effectiveMaxEvents})` : "OFF"}
          </p>
          <p className="text-sm text-muted-foreground">
            Capped: {isCapped ? "YES" : "NO"}
          </p>
        </div>
        {socketStatus === "connecting" ? (
          <p className="text-sm text-muted-foreground">
            Loading live events...
          </p>
        ) : null}
        {streamError ? (
          <p className="text-sm text-destructive">{streamError}</p>
        ) : null}
      </Card>

      <Card title="Recent Events (up to 500)">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Destination IP</TableHead>
                <TableHead>Attack Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEvents.length ? (
                visibleEvents.slice(0, 100).map((event, index) => (
                  <TableRow key={`${event.timestamp || "ts"}-${index}`}>
                    <TableCell>{String(event.timestamp || "-")}</TableCell>
                    <TableCell>
                      {String(event.source_ip || event.ip || "-")}
                    </TableCell>
                    <TableCell>{String(event.destination_ip || "-")}</TableCell>
                    <TableCell>
                      {String(
                        event.attack_type || event.event_type || "Unknown",
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={String(event.severity || "unknown")}
                      />
                    </TableCell>
                    <TableCell>
                      {typeof event.confidence === "number"
                        ? event.confidence.toFixed(2)
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No live events found yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
