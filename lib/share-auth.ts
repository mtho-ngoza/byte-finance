import { getAdminDb } from './firebase-admin';

/**
 * Find an event by its share token
 * Returns { userId, eventId, eventRef, eventData } or null if not found
 */
export async function findEventByShareToken(token: string) {
  if (!token || token.length < 16) {
    return null;
  }

  try {
    const db = getAdminDb();

    // Query across all users for events with this share token
    // This uses a collection group query
    // NOTE: Requires a composite index on 'events' collection group for 'shareToken' field
    const snapshot = await db.collectionGroup('events')
      .where('shareToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const pathParts = doc.ref.path.split('/');
    // Path format: users/{userId}/events/{eventId}
    const userId = pathParts[1];
    const eventId = doc.id;

    return {
      userId,
      eventId,
      eventRef: doc.ref,
      eventData: doc.data(),
    };
  } catch (error) {
    console.error('Error finding event by share token:', error);
    throw error;
  }
}
