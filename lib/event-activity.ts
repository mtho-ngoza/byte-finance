import { FieldValue } from 'firebase-admin/firestore';
import type { EventActivity } from '@/types';

type ActivityType = EventActivity['type'];

interface LogActivityParams {
  type: ActivityType;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
}

/**
 * Creates an activity log entry object.
 * Use with FieldValue.arrayUnion() to add to event's activities array.
 * Uses Date which Firestore serializes as Timestamp.
 * Filters out undefined values since Firestore doesn't accept them.
 */
export function createActivityEntry(params: LogActivityParams) {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const entry: Record<string, unknown> = {
    id,
    type: params.type,
    createdAt: new Date(),
  };

  // Only add defined values (Firestore rejects undefined)
  if (params.actorId !== undefined) entry.actorId = params.actorId;
  if (params.actorName !== undefined) entry.actorName = params.actorName;
  if (params.targetId !== undefined) entry.targetId = params.targetId;
  if (params.targetName !== undefined) entry.targetName = params.targetName;
  if (params.details !== undefined) entry.details = params.details;

  return entry;
}

/**
 * Helper to add activity to event document.
 * Returns the update object to merge with other updates.
 */
export function activityUpdate(params: LogActivityParams) {
  const entry = createActivityEntry(params);
  return {
    activities: FieldValue.arrayUnion(entry),
  };
}

/**
 * Activity type descriptions for future UI
 */
export const activityDescriptions: Record<ActivityType, string> = {
  payment_added: 'added a payment',
  payment_deleted: 'deleted a payment',
  item_added: 'added an item',
  item_updated: 'updated an item',
  item_deleted: 'deleted an item',
  category_added: 'added a category',
  category_updated: 'updated a category',
  category_deleted: 'deleted a category',
  member_joined: 'joined the event',
  member_left: 'left the event',
  notes_updated: 'updated notes',
  event_updated: 'updated the event',
  event_created: 'created the event',
};
