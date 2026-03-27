export type CaseSeverity = "Critical" | "High" | "Medium" | "Low";
export type CaseStatus = "New" | "In Progress" | "Closed";

export interface CaseItem {
  id: string;
  title: string;
  type: string;
  status: CaseStatus;
  severity: CaseSeverity;
  tags: string[];
  assignee: string;
  sourceIp: string;
  destinationIp: string;
  description: string;
}

export const cases: CaseItem[] = [
  {
    id: "CASE-000001",
    title: "Host-to-host lateral movement attempt",
    type: "NDR",
    status: "New",
    severity: "High",
    tags: ["lateral-movement", "internal-scan", "botnet"],
    assignee: "SOC Analyst",
    sourceIp: "10.10.1.5",
    destinationIp: "10.10.1.50",
    description: "Multiple east-west authentication attempts with suspicious process lineage.",
  },
  {
    id: "CASE-000002",
    title: "Suspicious process spawned by Office",
    type: "EDR",
    status: "In Progress",
    severity: "Critical",
    tags: ["phishing", "office", "credential-access"],
    assignee: "Threat Hunter",
    sourceIp: "10.10.2.7",
    destinationIp: "185.25.1.11",
    description: "Office macro launched a command-line process and suspicious outbound traffic.",
  },
  {
    id: "CASE-000003",
    title: "Unauthorized PLC config change",
    type: "OT",
    status: "New",
    severity: "Critical",
    tags: ["ics", "unauthorized-change", "firmware"],
    assignee: "OT Analyst",
    sourceIp: "10.50.20.10",
    destinationIp: "10.50.20.2",
    description: "Control system device received unplanned configuration write operation.",
  },
  {
    id: "CASE-000004",
    title: "Potential data exfiltration via web",
    type: "Proxy",
    status: "Closed",
    severity: "High",
    tags: ["exfiltration", "data-transfer", "unusual-port"],
    assignee: "IR Lead",
    sourceIp: "10.8.3.15",
    destinationIp: "103.20.5.4",
    description: "Large outbound upload to newly observed domain over uncommon destination port.",
  },
];

export interface PlaybookTask {
  id: string;
  name: string;
  status: "Pending" | "Running" | "Success" | "Failed";
  type: "CASE" | "ALERT" | "ARTIFACT";
  remark: string;
  createdAt: string;
}

export const playbookTasks: PlaybookTask[] = [
  {
    id: "P-001",
    name: "L3 SOC Analyst Agent",
    status: "Running",
    type: "CASE",
    remark: "AI triage in progress.",
    createdAt: "2026-03-25 15:10",
  },
  {
    id: "P-002",
    name: "TI Enrichment Update",
    status: "Success",
    type: "ARTIFACT",
    remark: "Threat intelligence enrichment completed.",
    createdAt: "2026-03-25 15:12",
  },
  {
    id: "P-003",
    name: "Alert Suggestion by LLM",
    status: "Success",
    type: "ALERT",
    remark: "AI-generated analyst summary completed.",
    createdAt: "2026-03-25 15:14",
  },
  {
    id: "P-004",
    name: "Automated host isolation",
    status: "Failed",
    type: "CASE",
    remark: "Isolation command rejected by endpoint policy.",
    createdAt: "2026-03-25 15:16",
  },
];
