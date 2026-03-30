"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, Card, Input, StatusBadge } from "@/components/ui";
import { useSocStore } from "@/lib/soc-store";

type IngestionMode = "upload" | "api" | "simulation" | "hybrid";

const INGESTION_MODES: IngestionMode[] = ["upload", "api", "simulation", "hybrid"];

export default function InstancesPage() {
  const router = useRouter();
  const instances = useSocStore((state) => state.instances);
  const currentInstance = useSocStore((state) => state.currentInstance);
  const loading = useSocStore((state) => state.loading);
  const error = useSocStore((state) => state.error);
  const initialize = useSocStore((state) => state.initialize);
  const createInstance = useSocStore((state) => state.createInstance);
  const deleteInstance = useSocStore((state) => state.deleteInstance);
  const setInstanceSelection = useSocStore((state) => state.setInstanceSelection);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<IngestionMode>("hybrid");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const hasInstances = instances.length > 0;
  const sortedInstances = useMemo(
    () =>
      [...instances].sort((a, b) => {
        const left = String(a.name || a.instance_id || "");
        const right = String(b.name || b.instance_id || "");
        return left.localeCompare(right);
      }),
    [instances],
  );

  const handleCreate = async () => {
    const cleaned = name.trim();
    if (!cleaned || submitting) {
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const created = await createInstance({ name: cleaned, ingestion_mode: mode });
      await setInstanceSelection(created.instance_id, created.api_key);
      setName("");
      setMode("hybrid");
      router.push(`/dashboard?instance_id=${encodeURIComponent(created.instance_id)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create instance");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = async (instanceId: string, apiKey: string) => {
    setMessage("");
    try {
      await setInstanceSelection(instanceId, apiKey);
      router.push(`/dashboard?instance_id=${encodeURIComponent(instanceId)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to select instance");
    }
  };

  const handleDelete = async (instanceId: string) => {
    if (!window.confirm(`Delete instance '${instanceId}'?`)) {
      return;
    }

    setMessage("");
    try {
      await deleteInstance(instanceId);
      setMessage(`Instance '${instanceId}' deleted.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to delete instance");
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 lg:p-6">
      <Card title="Instance Control Plane">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select or create an instance before opening live SOC dashboards.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="instance-name" className="mb-1 block text-sm font-medium text-foreground">
                Instance Name
              </label>
              <Input
                id="instance-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: Branch SOC East"
              />
            </div>
            <div>
              <p className="mb-1 block text-sm font-medium text-foreground">Ingestion Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {INGESTION_MODES.map((item) => (
                  <label
                    key={item}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="ingestion-mode"
                      value={item}
                      checked={mode === item}
                      onChange={() => setMode(item)}
                    />
                    <span className="capitalize">{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Button onClick={() => void handleCreate()} disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : "Create Instance"}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Available Instances">
        {loading ? <p className="text-sm text-muted-foreground">Loading instances...</p> : null}
        {!loading && !hasInstances ? (
          <p className="text-sm text-muted-foreground">
            No instances found. Create your first instance to start live monitoring.
          </p>
        ) : null}

        <div className="space-y-3">
          {sortedInstances.map((item) => {
            const isCurrent = currentInstance?.instance_id === item.instance_id;
            return (
              <article key={item.instance_id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{item.name || item.instance_id}</p>
                    <p className="text-xs text-muted-foreground">ID: {item.instance_id}</p>
                    <p className="text-xs text-muted-foreground">API Key: {item.api_key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={item.ingestion_mode} />
                    {isCurrent ? <StatusBadge label="selected" /> : null}
                    <Button size="sm" variant="outline" onClick={() => void handleSelect(item.instance_id, item.api_key)}>
                      Select
                    </Button>
                    {item.instance_id !== "default" ? (
                      <Button size="sm" variant="danger" onClick={() => void handleDelete(item.instance_id)}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
