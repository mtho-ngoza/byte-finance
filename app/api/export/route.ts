import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/export?format=json|csv
 * Export all user data
 * - JSON: Complete data dump (all collections)
 * - CSV: Flattened cycle items for spreadsheet use
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  const db = getAdminDb();

  // Fetch all user data
  const [
    profileDoc,
    cyclesSnap,
    cycleItemsSnap,
    commitmentsSnap,
    goalsSnap,
    snapshotsSnap,
    insightsSnap,
  ] = await Promise.all([
    db.doc(`users/${userId}`).get(),
    db.collection(`users/${userId}/cycles`).orderBy('startDate', 'desc').get(),
    db.collection(`users/${userId}/cycleItems`).get(),
    db.collection(`users/${userId}/commitments`).orderBy('sortOrder').get(),
    db.collection(`users/${userId}/goals`).get(),
    db.collection(`users/${userId}/snapshots`).orderBy('year', 'desc').get(),
    db.collection(`users/${userId}/insights`).orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  // Convert Firestore data to plain objects
  const convertDoc = (doc: FirebaseFirestore.DocumentSnapshot) => {
    const data = doc.data();
    if (!data) return null;
    return {
      id: doc.id,
      ...convertTimestamps(data),
    };
  };

  const convertTimestamps = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && 'toDate' in value) {
        result[key] = (value as { toDate: () => Date }).toDate().toISOString();
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' ? convertTimestamps(item as Record<string, unknown>) : item
        );
      } else if (value && typeof value === 'object') {
        result[key] = convertTimestamps(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  const profile = profileDoc.exists ? convertDoc(profileDoc) : null;
  const cycles = cyclesSnap.docs.map(convertDoc);
  const cycleItems = cycleItemsSnap.docs.map(convertDoc);
  const commitments = commitmentsSnap.docs.map(convertDoc);
  const goals = goalsSnap.docs.map(convertDoc);
  const snapshots = snapshotsSnap.docs.map(convertDoc);
  const insights = insightsSnap.docs.map(convertDoc);

  if (format === 'csv') {
    // CSV format: flattened cycle items
    const csvRows: string[] = [];

    // Header
    csvRows.push([
      'Cycle',
      'Label',
      'Amount (R)',
      'Category',
      'Account Type',
      'Status',
      'Due Date',
      'Paid Date',
      'Is Commitment',
      'Notes',
    ].join(','));

    // Data rows
    for (const item of cycleItems) {
      if (!item) continue;
      const i = item as Record<string, unknown>;
      csvRows.push([
        escapeCsv(String(i.cycleId || '')),
        escapeCsv(String(i.label || '')),
        ((Number(i.amount) || 0) / 100).toFixed(2),
        escapeCsv(String(i.category || '')),
        escapeCsv(String(i.accountType || '')),
        escapeCsv(String(i.status || '')),
        escapeCsv(i.dueDate ? String(i.dueDate) : ''),
        escapeCsv(i.paidDate ? String(i.paidDate) : ''),
        i.commitmentId ? 'Yes' : 'No',
        escapeCsv(String(i.notes || '')),
      ].join(','));
    }

    const csv = csvRows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="byte-finance-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  // JSON format: complete export
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    profile,
    cycles,
    cycleItems,
    commitments,
    goals,
    snapshots,
    insights,
    stats: {
      totalCycles: cycles.length,
      totalCycleItems: cycleItems.length,
      totalCommitments: commitments.length,
      totalGoals: goals.length,
    },
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="byte-finance-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
