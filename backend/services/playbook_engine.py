from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


VALID_STATES = {"pending", "running", "success", "failed"}
ALLOWED_TRANSITIONS = {
    "pending": {"running"},
    "running": {"success", "failed"},
    "success": set(),
    "failed": set(),
}


@dataclass
class PlaybookTask:
    id: str
    case_id: str
    name: str
    status: str
    timestamp: str


class PlaybookEngine:
    def __init__(self) -> None:
        self._tasks: dict[str, PlaybookTask] = {}
        self._seed_default_tasks()

    def _seed_default_tasks(self) -> None:
        if self._tasks:
            return

        for name in [
            "Enrich IoCs",
            "Block source IP",
            "Disable suspicious account",
            "Collect endpoint artifacts",
            "Notify incident commander",
            "Finalize case closure",
        ]:
            status = "pending"
            if "Block" in name:
                status = "running"
            self.create_task(case_id="SOC-001", name=name, status=status)

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def create_task(self, case_id: str, name: str, status: str = "pending") -> dict[str, Any]:
        normalized = status.lower()
        if normalized not in VALID_STATES:
            raise ValueError(f"Invalid playbook state: {status}")

        task = PlaybookTask(
            id=str(uuid4()),
            case_id=case_id,
            name=name,
            status=normalized,
            timestamp=self._now_iso(),
        )
        self._tasks[task.id] = task
        return self._as_dict(task)

    def transition(self, task_id: str, next_state: str) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if task is None:
            raise KeyError("Task not found")

        normalized = next_state.lower()
        if normalized not in VALID_STATES:
            raise ValueError(f"Invalid playbook state: {next_state}")

        allowed = ALLOWED_TRANSITIONS.get(task.status, set())
        if normalized not in allowed:
            raise ValueError(f"Invalid transition from {task.status} to {normalized}")

        task.status = normalized
        task.timestamp = self._now_iso()
        return self._as_dict(task)

    def update_task(
        self,
        task_id: str,
        *,
        name: str | None = None,
        case_id: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if task is None:
            raise KeyError("Task not found")

        if name is not None:
            cleaned_name = name.strip()
            if not cleaned_name:
                raise ValueError("Task name cannot be empty")
            task.name = cleaned_name

        if case_id is not None:
            cleaned_case = case_id.strip()
            if not cleaned_case:
                raise ValueError("Case ID cannot be empty")
            task.case_id = cleaned_case

        if status is not None:
            normalized = status.lower()
            if normalized not in VALID_STATES:
                raise ValueError(f"Invalid playbook state: {status}")
            task.status = normalized

        task.timestamp = self._now_iso()
        return self._as_dict(task)

    def delete_task(self, task_id: str) -> dict[str, Any]:
        task = self._tasks.pop(task_id, None)
        if task is None:
            raise KeyError("Task not found")

        return {"deleted": True, "id": task_id}

    @staticmethod
    def _as_dict(task: PlaybookTask) -> dict[str, Any]:
        return {
            "id": task.id,
            "case_id": task.case_id,
            "name": task.name,
            "status": task.status,
            "timestamp": task.timestamp,
        }

    def list_tasks(self) -> list[dict[str, Any]]:
        return [self._as_dict(task) for task in self._tasks.values()]


_playbook_engine: PlaybookEngine | None = None


def get_playbook_engine() -> PlaybookEngine:
    global _playbook_engine
    if _playbook_engine is None:
        _playbook_engine = PlaybookEngine()
    return _playbook_engine
