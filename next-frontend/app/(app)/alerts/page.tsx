"use client";

import { useState } from "react";

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
} from "@/components/ui";
import { apiPost } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

export default function AlertsPage() {
  const alerts = useSocStore((state) => state.alerts);
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const socketStatus = useSocStore((state) => state.socketStatus);
  const incidents = useSocStore((state) => state.incidents);
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);
  const refreshLiveEvents = useSocStore((state) => state.refreshLiveEvents);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const createDemoAlertIncident = async () => {
    setMessage("");
    setError("");
    try {
      const attackPool = [
        "BENIGN",
        "PortScan",
        "Phishing",
        "BruteForce",
        "DoS",
        "DDoS",
        "Botnet",
        "Infiltration",
      ];
      const randomAttack =
        attackPool[Math.floor(Math.random() * attackPool.length)];
      const severityByAttack: Record<string, string> = {
        BENIGN: "low",
        PortScan: "medium",
        Phishing: "medium",
        BruteForce: "high",
        DoS: "high",
        DDoS: "critical",
        Botnet: "critical",
        Infiltration: "critical",
      };
      const severity = severityByAttack[randomAttack] || "medium";
      const result = await apiPost<{ alert_id: number; incident_id: number }>(
        "/response/trigger",
        {
          instance_id: selectedInstanceId,
          detection_result: {
            prediction: {
              attack_type: randomAttack,
              severity,
              confidence:
                severity === "critical"
                  ? 0.98
                  : severity === "high"
                    ? 0.9
                    : 0.75,
            },
          },
          source_ip: "10.10.10.25",
          destination_ip: "172.16.10.5",
        },
      );
      if (result.incident_id) {
        setMessage(
          `Created ${severity.toUpperCase()} ${randomAttack} alert ${result.alert_id} and incident ${result.incident_id}.`,
        );
      } else {
        setMessage(
          `Created ${severity.toUpperCase()} ${randomAttack} alert ${result.alert_id}. No incident created for this severity.`,
        );
      }
      await refreshScopedData();
      await refreshLiveEvents(200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create demo alert",
      );
    }
  };

  const openAlerts = alerts.filter(
    (item) => item.status.toLowerCase() === "open",
  ).length;

  return (
    <div className="space-y-4">
      <Card title="Active Alerts">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Alerts
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {alerts.length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Open Alerts
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {openAlerts}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Critical Alerts
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {
                alerts.filter(
                  (item) => item.severity.toLowerCase() === "critical",
                ).length
              }
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label={socketStatus} />
          <p className="text-sm text-muted-foreground">
            Synced Alerts: {alerts.length}
          </p>
          <p className="text-sm text-muted-foreground">
            Synced Incidents: {incidents.length}
          </p>
        </div>

        <div className="mt-3">
          <Button onClick={createDemoAlertIncident}>
            Create Demo Detection
          </Button>
        </div>

        {message ? (
          <p className="mt-3 text-sm text-(--status-ok-fg)">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </Card>

      <Card title="Alert Table">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length ? (
                alerts.map((item) => (
                  <TableRow key={item.id} id={`alert-${item.id}`}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.attack_type || "Unknown"}</TableCell>
                    <TableCell>
                      <StatusBadge label={item.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={item.severity} />
                    </TableCell>
                    <TableCell>{item.source_ip || "-"}</TableCell>
                    <TableCell>{item.destination_ip || "-"}</TableCell>
                    <TableCell>
                      {typeof item.confidence === "number"
                        ? item.confidence.toFixed(2)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {new Date(item.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    No alerts found yet.
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
