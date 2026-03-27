"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { PlaybookTask } from "@/lib/api";

type BoardState = "pending" | "running" | "success" | "failed";

const STATES: BoardState[] = ["pending", "running", "success", "failed"];

const COLUMN_STYLE: Record<BoardState, string> = {
  pending: "border-[var(--status-info-fg)] bg-[var(--status-info-bg)]",
  running: "border-[var(--status-high-fg)] bg-[var(--status-high-bg)]",
  success: "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]",
  failed: "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]",
};

function TaskCard({
  task,
  onEdit,
  onDelete,
}: {
  task: PlaybookTask;
  onEdit?: (taskId: string, payload: { name?: string; case_id?: string; status?: BoardState }) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });

  const handleEdit = async () => {
    if (!onEdit) {
      return;
    }

    const name = window.prompt("Task name", task.name);
    if (name === null) {
      return;
    }

    const caseId = window.prompt("Case ID", task.case_id);
    if (caseId === null) {
      return;
    }

    await onEdit(task.id, {
      name,
      case_id: caseId,
    });
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const ok = window.confirm(`Delete task \"${task.name}\"?`);
    if (!ok) {
      return;
    }

    await onDelete(task.id);
  };

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-lg border border-border bg-card p-3 ${isDragging ? "opacity-60" : ""}`}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">{task.name}</h4>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Drag task"
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Case: {task.case_id}</p>
      <p className="mt-2 text-xs text-muted-foreground">{new Date(task.timestamp).toLocaleString()}</p>
      <div className="mt-3 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => void handleEdit()}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          aria-label="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function BoardColumn({
  state,
  tasks,
  onEdit,
  onDelete,
}: {
  state: BoardState;
  tasks: PlaybookTask[];
  onEdit?: (taskId: string, payload: { name?: string; case_id?: string; status?: BoardState }) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: state,
    data: { type: "column", status: state },
  });

  return (
    <section
      ref={setNodeRef}
      key={state}
      className={`rounded-xl border p-3 ${COLUMN_STYLE[state]} ${isOver ? "ring-2 ring-primary/45" : ""}`}
    >
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-foreground">{state}</h3>
      <SortableContext items={tasks.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {!tasks.length ? <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 text-xs text-muted-foreground">Drop task here</div> : null}
        </div>
      </SortableContext>
    </section>
  );
}

export function PlaybookBoard({
  tasks,
  onTransition,
  onEdit,
  onDelete,
}: {
  tasks: PlaybookTask[];
  onTransition: (taskId: string, nextState: BoardState) => Promise<void>;
  onEdit?: (taskId: string, payload: { name?: string; case_id?: string; status?: BoardState }) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }

    const draggedTask = tasks.find((item) => item.id === String(active.id));
    if (!draggedTask) {
      return;
    }

    const overId = String(over.id);
    const targetTask = tasks.find((item) => item.id === overId);
    const targetState = STATES.includes(overId as BoardState)
      ? (overId as BoardState)
      : targetTask?.status;

    if (!targetState || draggedTask.status === targetState) {
      return;
    }

    if (STATES.includes(targetState)) {
      await onTransition(draggedTask.id, targetState);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {STATES.map((state) => {
          const items = tasks.filter((task) => task.status === state);
          return <BoardColumn key={state} state={state} tasks={items} onEdit={onEdit} onDelete={onDelete} />;
        })}
      </div>
    </DndContext>
  );
}
