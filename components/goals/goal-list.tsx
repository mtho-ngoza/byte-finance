'use client';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GoalItem } from './goal-item';
import { Skeleton } from '@/components/shared/skeleton';
import type { Goal } from '@/types';

// ─── Sortable wrapper ────────────────────────────────────────────────────────

interface SortableGoalItemProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
}

function SortableGoalItem({ goal, onEdit, onDelete }: SortableGoalItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: goal.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="hidden sm:flex p-1 text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing touch-none"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <circle cx="5" cy="4" r="1" fill="currentColor" />
            <circle cx="5" cy="8" r="1" fill="currentColor" />
            <circle cx="5" cy="12" r="1" fill="currentColor" />
            <circle cx="11" cy="4" r="1" fill="currentColor" />
            <circle cx="11" cy="8" r="1" fill="currentColor" />
            <circle cx="11" cy="12" r="1" fill="currentColor" />
          </svg>
        </button>
        <div className="flex-1">
          <GoalItem goal={goal} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

// ─── Goal list ────────────────────────────────────────────────────────────────

interface GoalListProps {
  goals: Goal[];
  loading: boolean;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onReorder?: (reordered: Goal[]) => void;
}

export function GoalList({
  goals,
  loading,
  onEdit,
  onDelete,
  onReorder,
}: GoalListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = goals.findIndex((g) => g.id === active.id);
    const newIndex = goals.findIndex((g) => g.id === over.id);
    const reordered = arrayMove(goals, oldIndex, newIndex);
    onReorder(reordered);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary text-sm">
        No goals yet. Tap + to add your first goal.
      </div>
    );
  }

  if (!onReorder) {
    return (
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalItem key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {goals.map((goal) => (
            <SortableGoalItem
              key={goal.id}
              goal={goal}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
