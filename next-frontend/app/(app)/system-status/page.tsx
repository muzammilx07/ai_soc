"use client";

import { useEffect, useState } from "react";

import { Button, Card, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import {
  apiGet,
  apiPost,
  getApiBase,
  type ResponseLogItem,
  type ServiceHealthResponse,
} from "@/lib/api";

interface HealthResponse {
  status: string;
}

interface TriggerResponse {
  alert_id: number;
  incident_id: number;
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [services, setServices] = useState<ServiceHealthResponse | null>(null);
  const [responseLogs, setResponseLogs] = useState<ResponseLogItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [healthData, serviceData, logsData] = await Promise.all([
        apiGet<HealthResponse>("/health"),
        apiGet<ServiceHealthResponse>("/health/services"),
        apiGet<ResponseLogItem[]>("/response/logs"),
      ]);
      setHealth(healthData);
      setServices(serviceData);
      setResponseLogs(logsData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system status");
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const createDemoRecord = async () => {
    setError("");
    setMessage("");

    try {
      const result = await apiPost<TriggerResponse>("/response/trigger", {
        detection_result: {
          prediction: {
            attack_type: "DDoS",
            severity: "critical",
            confidence: 0.97,
          },
        },
        source_ip: "10.10.10.25",
        destination_ip: "172.16.10.5",
      });

      setMessage(`Created alert ${result.alert_id} and incident ${result.incident_id}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create demo alert/incident");
    }
  };

  return (
    <div className="space-y-4">
      <Card title="System Health">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Backend</p>
            <div className="mt-2"><StatusBadge label={health?.status || "unknown"} /></div>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Queue Backend</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{services?.queue_backend || "unknown"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">API Base</p>
            <p className="mt-2 break-all text-xs font-medium text-foreground">{getApiBase()}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Response Log Entries</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{responseLogs.length}</p>
          </div>
        </div>
      </Card>

      <Card title="Demo Data">
        <p className="mb-3 text-sm text-muted-foreground">Create one demo alert and incident, same as Streamlit helper.</p>
        <Button onClick={createDemoRecord}>
          Create Demo Alert + Incident
        </Button>
      </Card>

      <Card title="Recent Response Logs">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responseLogs.length ? (
                responseLogs.slice(0, 100).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.action}</TableCell>
                    <TableCell>{item.target}</TableCell>
                    <TableCell><StatusBadge label={item.status} /></TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No response logs found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {message ? <p className="text-sm text-(--status-ok-fg)">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
