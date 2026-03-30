"use client";

import { useState } from "react";

import { Button, Card } from "@/components/ui";
import { apiPost, apiUpload } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

interface SimulateResponse {
  generated_count: number;
}

interface UploadResponse {
  filename: string;
  ingested_records: number;
}

export default function LogToolsPage() {
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const selectedApiKey = useSocStore((state) => state.selectedApiKey);
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);
  const refreshLiveEvents = useSocStore((state) => state.refreshLiveEvents);
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(20);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onUpload = async () => {
    if (!file || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    if (!selectedInstanceId || !selectedApiKey) {
      setError("Select an instance before uploading logs");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await apiUpload<UploadResponse>("/logs/upload", file, {
        headers: {
          "x-instance-id": selectedInstanceId,
          "x-api-key": selectedApiKey,
        },
      });
      setMessage(
        `Uploaded ${result.filename}. Ingested ${result.ingested_records} records.`,
      );
      await refreshScopedData();
      await refreshLiveEvents(200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSimulate = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    if (!selectedInstanceId || !selectedApiKey) {
      setError("Select an instance before running simulation");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await apiPost<SimulateResponse>(
        "/logs/simulate",
        { count },
        {
          headers: {
            "x-instance-id": selectedInstanceId,
            "x-api-key": selectedApiKey,
          },
        },
      );
      setMessage(`Generated ${result.generated_count} events.`);
      await refreshScopedData();
      await refreshLiveEvents(200);
      window.setTimeout(() => {
        void refreshScopedData();
        void refreshLiveEvents(200);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Log Upload">
        <p className="mb-3 text-sm text-muted-foreground">
          Upload CSV or JSON logs for ingestion.
        </p>
        <input
          type="file"
          accept=".csv,.json"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <div className="mt-3">
          <Button disabled={!file || isSubmitting} onClick={onUpload}>
            Upload File
          </Button>
        </div>
      </Card>

      <Card title="Generate Simulated Events">
        <p className="mb-3 text-sm text-muted-foreground">
          Quickly generate events to fill the live dashboard.
        </p>
        <label htmlFor="event-count" className="text-sm text-foreground">
          Number of events: {count}
        </label>
        <input
          id="event-count"
          type="range"
          min={1}
          max={100}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
        />
        <div className="mt-3">
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={onSimulate}
          >
            Generate Events
          </Button>
        </div>
      </Card>

      <Card title="CSV Template">
        <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
          source_ip,destination_ip,attack_type,severity,confidence
          10.0.0.5,172.16.0.10,PortScan,medium,0.72
        </pre>
      </Card>

      {message ? (
        <p className="text-sm text-(--status-ok-fg)">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
