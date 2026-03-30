"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button, Card, Input } from "@/components/ui";
import { apiPost, apiUpload, getApiBase } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

type Props = {
  instanceId: string;
  apiKey: string;
  mode: string;
};

type SimulateResponse = {
  generated_count: number;
  queued_count: number;
  instance_id?: string;
};

type UploadResponse = {
  filename: string;
  ingested_records: number;
};

export function IngestionControlPanel({ instanceId, apiKey, mode }: Props) {
  const panelStorageKey = "soc.ingestion.panel.open";
  const normalizedMode = String(mode || "hybrid").toLowerCase();
  const canUpload = normalizedMode === "upload" || normalizedMode === "hybrid";
  const canApi = normalizedMode === "api" || normalizedMode === "hybrid";
  const canSimulation = normalizedMode === "simulation" || normalizedMode === "hybrid";

  const [file, setFile] = useState<File | null>(null);
  const [simulateCount, setSimulateCount] = useState(25);
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const saved = window.localStorage.getItem(panelStorageKey);
    if (saved === "false") {
      return false;
    }
    return true;
  });
  const [uploading, setUploading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);
  const refreshLiveEvents = useSocStore((state) => state.refreshLiveEvents);

  useEffect(() => {
    window.localStorage.setItem(panelStorageKey, String(isOpen));
  }, [isOpen]);

  const ingestUrl = useMemo(() => `${getApiBase()}/ingest`, []);

  const headers = {
    "x-instance-id": instanceId,
    "x-api-key": apiKey,
  };

  const scheduleSync = () => {
    void refreshScopedData();
    void refreshLiveEvents(200);
    window.setTimeout(() => {
      void refreshScopedData();
      void refreshLiveEvents(200);
    }, 1500);
  };

  const triggerUpload = async () => {
    if (!file || uploading || simulating) {
      return;
    }

    setUploading(true);
    setMessage("");
    setError("");
    try {
      const result = await apiUpload<UploadResponse>("/logs/upload", file, { headers });
      setMessage(`Upload accepted: ${result.filename} (${result.ingested_records} records).`);
      scheduleSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const triggerSimulation = async () => {
    if (simulating || uploading) {
      return;
    }

    setSimulating(true);
    setMessage("");
    setError("");
    try {
      const result = await apiPost<SimulateResponse>("/logs/simulate", { count: simulateCount }, { headers });
      setMessage(`Simulation queued: ${result.generated_count} events for ${result.instance_id || instanceId}.`);
      scheduleSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Card title="Ingestion Control Plane">
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen((previous) => !previous)}
            aria-label={isOpen ? "Close ingestion panel" : "Open ingestion panel"}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="ml-1">{isOpen ? "Close" : "Open"}</span>
          </Button>
        </div>

        {isOpen ? (
          <>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Instance:</span>
          <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-foreground">{instanceId}</span>
          <span>Mode:</span>
          <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-foreground">{normalizedMode}</span>
        </div>

        {canUpload ? (
          <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <h4 className="text-sm font-semibold text-foreground">CSV/JSON Upload</h4>
            <input
              type="file"
              accept=".csv,.json"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <Button size="sm" onClick={() => void triggerUpload()} disabled={!file || uploading || simulating}>
              {uploading ? "Uploading..." : "Upload Logs"}
            </Button>
          </section>
        ) : null}

        {canApi ? (
          <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <h4 className="text-sm font-semibold text-foreground">API Ingestion Endpoint</h4>
            <Input readOnly value={ingestUrl} />
            <Input readOnly value={apiKey} />
            <p className="text-xs text-muted-foreground">
              Send events to this endpoint with headers x-instance-id and x-api-key.
            </p>
          </section>
        ) : null}

        {canSimulation ? (
          <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <h4 className="text-sm font-semibold text-foreground">Simulation</h4>
            <label htmlFor="simulate-count" className="text-sm text-foreground">
              Event count: {simulateCount}
            </label>
            <input
              id="simulate-count"
              type="range"
              min={1}
              max={200}
              value={simulateCount}
              onChange={(event) => setSimulateCount(Number(event.target.value))}
              className="w-full accent-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void triggerSimulation()}
              disabled={simulating || uploading}
            >
              {simulating ? "Starting..." : "Start Simulation"}
            </Button>
          </section>
        ) : null}

        {!canUpload && !canApi && !canSimulation ? (
          <p className="text-sm text-muted-foreground">No ingestion controls are available for this mode.</p>
        ) : null}

        {message ? <p className="text-sm text-(--status-ok-fg)">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
