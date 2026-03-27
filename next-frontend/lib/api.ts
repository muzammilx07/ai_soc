const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const WS_BASE = API_BASE.replace(/^http/, "ws");

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    return data.detail || `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

export function getApiBase(): string {
  return API_BASE;
}

export function getWsBase(): string {
  return WS_BASE;
}

export interface LiveEvent {
  timestamp?: string;
  source_ip?: string;
  destination_ip?: string;
  attack_type?: string;
  severity?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface LiveEventsResponse {
  queue_backend: string;
  count: number;
  total_count?: number;
  events: LiveEvent[];
}

export interface AlertItem {
  id: number;
  status: string;
  severity: string;
  attack_type?: string | null;
  source_ip?: string | null;
  destination_ip?: string | null;
  confidence?: number | null;
  created_at: string;
}

export interface IncidentItem {
  id: number;
  status: string;
  severity: string;
  title: string;
  description?: string | null;
  created_at: string;
}

export interface ResponseLogItem {
  id: number;
  action: string;
  target: string;
  status: string;
  created_at: string;
}

export interface ServiceHealthResponse {
  status: string;
  queue_backend: string;
}

export interface DashboardKpis {
  total_cases: number;
  high_severity: number;
  critical_alerts: number;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface TimePoint {
  time: string;
  count: number;
}

export interface WordCloudItem {
  text: string;
  value: number;
}

export interface SocDashboardResponse {
  kpis: DashboardKpis;
  status_pie: NamedValue[];
  severity_pie: NamedValue[];
  alert_types_bar: NamedValue[];
  alerts_over_time: TimePoint[];
  word_cloud: WordCloudItem[];
  close_reason_bar: NamedValue[];
}

export interface CaseItem {
  id: string;
  incident_id: number;
  title: string;
  type: string;
  status: string;
  severity: string;
  tags: string[];
  assignee: string;
  created_at: string;
}

export interface CasesResponse {
  count: number;
  items: CaseItem[];
}

export interface TimelineItem {
  time: string;
  event: string;
}

export interface CaseDetailResponse {
  id: string;
  title: string;
  status: string;
  severity: string;
  severity_score: number;
  ai_summary: string;
  tags: string[];
  overview: {
    attack_type: string;
    source_ip?: string | null;
    destination_ip?: string | null;
    confidence?: number | null;
    description?: string | null;
  };
  alerts: CaseAlertItem[];
  timeline: TimelineItem[];
  threat_report: ThreatReport;
}

export interface CaseAlertItem {
  id: number;
  attack_type: string;
  severity: string;
  status: string;
  source_ip?: string | null;
  destination_ip?: string | null;
  confidence?: number | null;
  created_at: string;
}

export interface ThreatReport {
  executive_summary: string;
  attack_type: string;
  affected_systems: string[];
  findings: string[];
  recommendations: string[];
}

export interface PlaybookTask {
  id: string;
  case_id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  timestamp: string;
}

export interface PlaybookCreatePayload {
  case_id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
}

export interface PlaybookUpdatePayload {
  case_id?: string;
  name?: string;
  status?: "pending" | "running" | "success" | "failed";
}

export interface PlaybooksResponse {
  count: number;
  items: PlaybookTask[];
}

export interface ConfusionMatrixCell {
  actual: string;
  predicted: string;
  value: number;
}

export interface RocPoint {
  threshold: number;
  fpr: number;
  tpr: number;
}

export interface MlMetricsResponse {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  confusion_matrix: ConfusionMatrixCell[];
  roc_curve: RocPoint[];
  roc_auc: number;
  models?: Record<
    string,
    {
      accuracy?: number;
      weighted_f1?: number;
      precision?: number;
      recall?: number;
      f1?: number;
      roc_auc?: number;
    }
  >;
  prediction_distribution: Record<string, number>;
}

export interface SocSocketPayload {
  timestamp: string;
  count: number;
  total_count?: number;
  queue_backend?: string;
  events: LiveEvent[];
}
