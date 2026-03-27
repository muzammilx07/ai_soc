"use client";

import { useEffect, useState } from "react";

import { Card, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { apiGet, type IncidentItem } from "@/lib/api";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await apiGet<IncidentItem[]>("/incidents");
        if (!active) {
          return;
        }
        setIncidents(data);
        setError("");
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to fetch incidents");
      }
    };

    load();
    const timer = window.setInterval(load, 8000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const openCount = incidents.filter((item) => item.status.toLowerCase() === "open").length;
  const criticalCount = incidents.filter((item) => item.severity.toLowerCase() === "critical").length;

  return (
    <div className="space-y-4">
      <Card title="Incidents">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Incidents</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{incidents.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{openCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{criticalCount}</p>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </Card>

      <Card title="Incident Table">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.length ? (
                incidents.map((item) => (
                  <TableRow key={item.id} id={`incident-${item.id}`}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>
                      <StatusBadge label={item.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={item.severity} />
                    </TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No incidents found yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
