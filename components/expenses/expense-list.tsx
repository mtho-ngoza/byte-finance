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
import { ExpenseItem } from './expense-item';
import { Skeleton } from '@/components/shared/skeleton';
import type { Expense } from '@/types';

// ─── Sortable wrapper ────────────────────────────────────────────────────────

interface SortableExpenseItemProps {
  expense: Expense;
  onToggle: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

function SortableExpenseItem({ expense, onToggle, onEdit, onDelete }: SortableExpenseItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: expense.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle (desktop) */}
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
          <ExpenseItem
            expense={expense}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Expense list ────────────────────────────────────────────────────────────

interface ExpenseListProps {
  expenses: Expense[];
  loading: boolean;
  onToggle: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onReorder: (reordered: Expense[]) => void;
}

export function ExpenseList({
  expenses,
  loading,
  onToggle,
  onEdit,
  onDelete,
  onReorder,
}: ExpenseListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = expenses.findIndex((e) => e.id === active.id);
    const newIndex = expenses.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(expenses, oldIndex, newIndex).map((e, i) => ({
      ...e,
      sortOrder: i,
    }));
    onReorder(reordered);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary text-sm">
        No expenses yet. Tap + to add one.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={expenses.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {expenses.map((expense) => (
            <SortableExpenseItem
              key={expense.id}
              expense={expense}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
