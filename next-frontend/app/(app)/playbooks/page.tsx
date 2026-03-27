"use client";

import { useCallback, useEffect, useState } from "react";

import { PlaybookBoard } from "@/components/PlaybookBoard";
import { Button, Card, Input, Select } from "@/components/ui";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type PlaybookTask,
  type PlaybooksResponse,
} from "@/lib/api";

export default function PlaybooksPage() {
  const [tasks, setTasks] = useState<PlaybookTask[]>([]);
  const [newName, setNewName] = useState("");
  const [newCaseId, setNewCaseId] = useState("SOC-001");
  const [newStatus, setNewStatus] = useState<PlaybookTask["status"]>("pending");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await apiGet<PlaybooksResponse>("/soc/playbooks");
      setTasks(result.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playbooks");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTask = async () => {
    const name = newName.trim();
    const caseId = newCaseId.trim();

    if (!name || !caseId) {
      setError("Task name and case ID are required");
      return;
    }

    try {
      await apiPost("/soc/playbooks", {
        case_id: caseId,
        name,
        status: newStatus,
      });
      setNewName("");
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create playbook task");
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Playbook Kanban Board">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Drag flow: Pending -> Running -> Success/Failed.</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh Board
          </Button>
        </div>
      </Card>
      <Card title="Add Playbook Card">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Task name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Input
            placeholder="Case ID"
            value={newCaseId}
            onChange={(event) => setNewCaseId(event.target.value)}
          />
          <Select value={newStatus} onChange={(event) => setNewStatus(event.target.value as PlaybookTask["status"])}>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
          </Select>
          <Button onClick={() => void createTask()}>Add Card</Button>
        </div>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <PlaybookBoard
        tasks={tasks}
        onTransition={async (taskId, nextState) => {
          try {
            await apiPost(`/soc/playbooks/${taskId}/transition`, { next_state: nextState });
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Playbook transition failed");
          }
        }}
        onEdit={async (taskId, payload) => {
          try {
            await apiPatch(`/soc/playbooks/${taskId}`, payload);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Playbook update failed");
          }
        }}
        onDelete={async (taskId) => {
          try {
            await apiDelete(`/soc/playbooks/${taskId}`);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Playbook delete failed");
          }
        }}
      />
    </div>
  );
}
