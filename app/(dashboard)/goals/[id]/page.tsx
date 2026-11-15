'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGoals } from '@/hooks/use-goals';
import { useCommitments } from '@/hooks/use-commitments';
import { GoalDetail } from './components/goals-components';

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = params.id as string;
  const { goals, loading } = useGoals();
  const { allCommitments } = useCommitments();

  const goal = goals.find((g) => g.id === goalId);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-64 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary mb-4">Goal not found</p>
        <Link href="/goals" className="text-primary hover:underline">
          Back to Goals
        </Link>
      </div>
    );
  }

  return <GoalDetail goal={goal} allCommitments={allCommitments} />;
}
