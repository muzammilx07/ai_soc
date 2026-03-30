"use client";

import { useEffect, useState } from "react";

import { Card, Select, StatusBadge } from "@/components/ui";
import {
  apiGet,
  type CasesResponse,
  type ThreatReport,
  withInstanceQuery,
} from "@/lib/api";
import { useSocStore } from "@/lib/soc-store";

export default function ThreatReportPage() {
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const [report, setReport] = useState<ThreatReport | null>(null);
  const [caseIds, setCaseIds] = useState<number[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadCases = async () => {
      try {
        const cases = await apiGet<CasesResponse>(
          withInstanceQuery("/soc/cases", selectedInstanceId),
        );
        const ids = cases.items
          .map((item) => item.incident_id)
          .filter((id): id is number => typeof id === "number");

        if (!ids.length) {
          if (active) {
            setCaseIds([]);
            setCaseId(null);
            setReport(null);
            setError("");
          }
          return;
        }

        if (active) {
          setCaseIds(ids);
          setCaseId((current) =>
            current && ids.includes(current) ? current : ids[0],
          );
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load threat report",
          );
        }
      }
    };

    void loadCases();
    return () => {
      active = false;
    };
  }, [selectedInstanceId]);

  useEffect(() => {
    let active = true;

    const loadReport = async () => {
      if (!caseId) {
        return;
      }

      try {
        const data = await apiGet<ThreatReport>(
          withInstanceQuery(`/soc/threat-report/${caseId}`, selectedInstanceId),
        );
        if (active) {
          setReport(data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load threat report",
          );
        }
      }
    };

    void loadReport();

    return () => {
      active = false;
    };
  }, [caseId, selectedInstanceId]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!caseIds.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No cases found to generate threat reports.
      </p>
    );
  }

  if (!report) {
    return (
      <p className="text-sm text-muted-foreground">Loading threat report...</p>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Structured Threat Report">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Case {caseId}</h1>
            <StatusBadge label={report.attack_type} />
          </div>
          <div className="min-w-55">
            <Select
              value={String(caseId)}
              onChange={(event) => setCaseId(Number(event.target.value))}
            >
              {caseIds.map((id) => (
                <option key={id} value={String(id)}>
                  Case {id}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card title="Executive Summary">
        <p className="text-sm text-foreground">{report.executive_summary}</p>
      </Card>

      <Card title="Attack Type">
        <p>{report.attack_type}</p>
      </Card>

      <Card title="Affected Systems">
        <ul className="list-disc space-y-1 pl-6">
          {report.affected_systems.map((system) => (
            <li key={system}>{system}</li>
          ))}
        </ul>
      </Card>

      <Card title="Findings">
        <ul className="list-disc space-y-1 pl-6">
          {report.findings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="Recommendations">
        <ul className="list-disc space-y-1 pl-6">
          {report.recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
