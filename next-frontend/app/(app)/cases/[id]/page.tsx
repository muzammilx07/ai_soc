import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
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
import { apiGet, type CaseDetailResponse } from "@/lib/api";

function tagClass(tag: string): string {
  const key = tag.toLowerCase();
  if (key === "lateral-movement") return "border-[var(--status-info-fg)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
  if (key === "exfiltration") return "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]";
  if (key === "malware") return "border-[var(--status-high-fg)] bg-[var(--status-high-bg)] text-[var(--status-high-fg)]";
  if (key === "iam") return "border-[var(--status-medium-fg)] bg-[var(--status-medium-bg)] text-[var(--status-medium-fg)]";
  return "border-border bg-muted text-foreground";
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  let detail: CaseDetailResponse;
  try {
    detail = await apiGet<CaseDetailResponse>(`/soc/cases/${params.id}`);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Button asChild variant="outline" size="sm">
          <Link href="/cases">
            <ArrowLeft size={14} className="mr-1" />
            Back to Cases
          </Link>
        </Button>
      </div>

      <Card title={`Case ${detail.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{detail.title}</h1>
          <StatusBadge label={detail.status} />
          <StatusBadge label={detail.severity} />
          <Badge variant="low">Score: {detail.severity_score}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">AI Summary: {detail.ai_summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {detail.tags.map((tag) => (
            <Badge key={tag} className={tagClass(tag)}>{tag}</Badge>
          ))}
        </div>
      </Card>

      <Tabs.Root defaultValue="overview" className="rounded-xl border border-border bg-card p-4">
        <Tabs.List className="mb-4 flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["alerts", "Alerts"],
            ["ai", "AI Analysis"],
            ["report", "Threat Report"],
            ["playbook", "Playbook Execution"],
          ].map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-foreground"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="space-y-2 text-sm text-foreground">
          <p>Attack Type: {detail.overview.attack_type}</p>
          <p>Source IP: {detail.overview.source_ip || "-"}</p>
          <p>Destination IP: {detail.overview.destination_ip || "-"}</p>
          <p>Confidence: {typeof detail.overview.confidence === "number" ? detail.overview.confidence.toFixed(3) : "-"}</p>
          <p>Description: {detail.overview.description || "No description provided"}</p>
        </Tabs.Content>

        <Tabs.Content value="alerts">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alert ID</TableHead>
                  <TableHead>Attack Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.id}</TableCell>
                    <TableCell>{alert.attack_type}</TableCell>
                    <TableCell>
                      <StatusBadge label={alert.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={alert.status} />
                    </TableCell>
                    <TableCell>{alert.source_ip || "-"}</TableCell>
                    <TableCell>{alert.destination_ip || "-"}</TableCell>
                    <TableCell>
                      {typeof alert.confidence === "number" ? alert.confidence.toFixed(3) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {!detail.alerts.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      No linked alerts for this case.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <p className="mb-2 mt-4 text-sm text-muted-foreground">Timeline of events</p>
          <ul className="space-y-2">
            {detail.timeline.map((item, index) => (
              <li key={`${item.time}-${index}`} className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <span className="font-medium text-foreground">{new Date(item.time).toLocaleString()}</span>
                <span className="ml-2">{item.event}</span>
              </li>
            ))}
          </ul>
        </Tabs.Content>

        <Tabs.Content value="ai">
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">{detail.ai_summary}</p>
        </Tabs.Content>

        <Tabs.Content value="report" className="space-y-3 text-sm">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Executive Summary</h3>
            <p>{detail.threat_report.executive_summary}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Findings</h3>
            <ul className="list-disc space-y-1 pl-6">
              {detail.threat_report.findings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Recommendations</h3>
            <ul className="list-disc space-y-1 pl-6">
              {detail.threat_report.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Tabs.Content>

        <Tabs.Content value="playbook">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">Playbook status for this case is available on the Playbooks board.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/playbooks">Open Playbooks</Link>
            </Button>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
