"use client";

import { useEffect, useState } from "react";

import { CaseTable } from "@/components/CaseTable";
import { apiGet, type CasesResponse, withInstanceQuery } from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

export default function CasesPage() {
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const [data, setData] = useState<CasesResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiGet<CasesResponse>(
          withInstanceQuery("/soc/cases", selectedInstanceId),
        );
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load cases");
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [selectedInstanceId]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Case Management
        </h2>
        <p className="text-sm text-muted-foreground">
          Search, filter, and triage incidents with SOC-ready context.
        </p>
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data ? (
        <CaseTable items={data.items} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading cases...</p>
      )}
    </div>
  );
}
