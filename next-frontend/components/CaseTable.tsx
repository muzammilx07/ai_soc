"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CaseItem } from "@/lib/api";
import {
  Badge,
  Button,
  Input,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { useSocStore } from "@/lib/soc-store";

function tagClass(tag: string): string {
  const key = tag.toLowerCase();
  if (key === "lateral-movement")
    return "border-[var(--status-info-fg)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
  if (key === "exfiltration")
    return "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]";
  if (key === "malware")
    return "border-[var(--status-high-fg)] bg-[var(--status-high-bg)] text-[var(--status-high-fg)]";
  if (key === "iam")
    return "border-[var(--status-medium-fg)] bg-[var(--status-medium-bg)] text-[var(--status-medium-fg)]";
  return "border-border bg-muted text-foreground";
}

export function CaseTable({ items }: { items: CaseItem[] }) {
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [sortBy, setSortBy] = useState<keyof CaseItem | "created_at">(
    "created_at",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const types = useMemo(() => {
    const values = new Set(items.map((item) => item.type));
    return ["all", ...Array.from(values)];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const rows = items.filter((item) => {
      const severityPass =
        severity === "all" || item.severity.toLowerCase() === severity;
      const typePass = type === "all" || item.type === type;
      const createdAt = new Date(item.created_at).getTime();
      const ageDays = Number.isFinite(createdAt)
        ? (now - createdAt) / (1000 * 60 * 60 * 24)
        : Number.POSITIVE_INFINITY;
      const datePass =
        dateRange === "all" ||
        (dateRange === "24h" && ageDays <= 1) ||
        (dateRange === "7d" && ageDays <= 7) ||
        (dateRange === "30d" && ageDays <= 30);
      const searchPass =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.assignee.toLowerCase().includes(q);
      return severityPass && typePass && datePass && searchPass;
    });

    rows.sort((a, b) => {
      const left = String(a[sortBy] ?? "").toLowerCase();
      const right = String(b[sortBy] ?? "").toLowerCase();
      if (left < right) {
        return sortOrder === "asc" ? -1 : 1;
      }
      if (left > right) {
        return sortOrder === "asc" ? 1 : -1;
      }
      return 0;
    });

    return rows;
  }, [items, search, severity, type, dateRange, sortBy, sortOrder]);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 lg:grid-cols-5">
        <Input
          placeholder="Search case, title, assignee"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <Select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        >
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>

        <Select value={type} onChange={(event) => setType(event.target.value)}>
          {types.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "All Types" : item}
            </option>
          ))}
        </Select>

        <Select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value)}
        >
          <option value="all">All Dates</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </Select>

        <Select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as keyof CaseItem)}
        >
          <option value="created_at">Created Date</option>
          <option value="id">Case ID</option>
          <option value="title">Title</option>
          <option value="severity">Severity</option>
          <option value="status">Status</option>
          <option value="type">Type</option>
          <option value="assignee">Assignee</option>
        </Select>

        <Button
          variant="outline"
          onClick={() =>
            setSortOrder((value) => (value === "asc" ? "desc" : "asc"))
          }
          type="button"
        >
          Sort: {sortOrder.toUpperCase()}
        </Button>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-semibold text-primary">
                  {item.id}
                </TableCell>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>
                  <StatusBadge label={item.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge label={item.severity} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <Badge
                        key={`${item.id}-${tag}`}
                        className={tagClass(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{item.assignee}</TableCell>
                <TableCell>
                  {new Date(item.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={
                        selectedInstanceId
                          ? `/cases/${item.incident_id}?instance_id=${encodeURIComponent(selectedInstanceId)}`
                          : `/cases/${item.incident_id}`
                      }
                    >
                      Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No cases match current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
