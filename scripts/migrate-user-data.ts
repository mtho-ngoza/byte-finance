/**
 * Migration script to move all data from dev-user-local to a real user ID
 *
 * Prerequisites:
 *   1. Make sure you're logged into Firebase: firebase login
 *   2. Set your project: firebase use byte-finance-prod
 *
 * Usage:
 *   npx ts-node scripts/migrate-user-data.ts
 *
 * Or with custom user IDs:
 *   FROM_USER=dev-user-local TO_USER=100814132640125436719 npx ts-node scripts/migrate-user-data.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin with application default credentials
if (getApps().length === 0) {
  initializeApp({
    projectId: 'byte-finance-prod',
  });
}

const db = getFirestore();

const FROM_USER = process.env.FROM_USER || 'dev-user-local';
const TO_USER = process.env.TO_USER || '100814132640125436719';

// All subcollections to migrate
const COLLECTIONS = [
  'cycles',
  'cycleItems',
  'commitments',
  'goals',
  'insights',
  'receipts',
  'snapshots',
  'healthScores',
  'wishlist',
  'events',
  'projects',
  'vendorRules',
  'integrations',
];

async function migrateCollection(collectionName: string): Promise<number> {
  const sourceRef = db.collection(`users/${FROM_USER}/${collectionName}`);
  const targetRef = db.collection(`users/${TO_USER}/${collectionName}`);

  const snapshot = await sourceRef.get();

  if (snapshot.empty) {
    console.log(`  ${collectionName}: 0 documents (empty)`);
    return 0;
  }

  // Use batched writes (max 500 per batch)
  const batchSize = 500;
  const docs = snapshot.docs;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);

    for (const doc of chunk) {
      const targetDoc = targetRef.doc(doc.id);
      batch.set(targetDoc, doc.data());
      count++;
    }

    await batch.commit();
  }

  console.log(`  ${collectionName}: ${count} documents migrated`);
  return count;
}

async function migrateUserProfile(): Promise<boolean> {
  const sourceDoc = db.doc(`users/${FROM_USER}`);
  const targetDoc = db.doc(`users/${TO_USER}`);

  const snapshot = await sourceDoc.get();

  if (!snapshot.exists) {
    console.log('  User profile: not found (will be created on first use)');
    return false;
  }

  await targetDoc.set(snapshot.data()!);
  console.log('  User profile: migrated');
  return true;
}

async function verifyConnection(): Promise<boolean> {
  try {
    // Try to access Firestore to verify connection
    await db.collection('users').limit(1).get();
    return true;
  } catch (error: any) {
    if (error.code === 'permission-denied' || error.message?.includes('PERMISSION_DENIED')) {
      console.error('\nERROR: Permission denied. Make sure you have:');
      console.error('  1. Logged in: firebase login');
      console.error('  2. Set project: firebase use byte-finance-prod');
      console.error('  3. Have Firestore admin access\n');
    } else if (error.message?.includes('Could not load the default credentials')) {
      console.error('\nERROR: No credentials found. Please run:');
      console.error('  gcloud auth application-default login');
      console.error('  OR set GOOGLE_APPLICATION_CREDENTIALS to your service account key\n');
    } else {
      console.error('\nERROR connecting to Firestore:', error.message);
    }
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Firestore User Data Migration');
  console.log('='.repeat(50));
  console.log(`From: ${FROM_USER}`);
  console.log(`To:   ${TO_USER}`);
  console.log('='.repeat(50));
  console.log('');

  // Verify connection
  console.log('Verifying Firestore connection...');
  const connected = await verifyConnection();
  if (!connected) {
    process.exit(1);
  }
  console.log('Connected!\n');

  let totalDocs = 0;

  // Migrate user profile document
  console.log('Migrating user profile...');
  await migrateUserProfile();
  console.log('');

  // Migrate all subcollections
  console.log('Migrating subcollections...');
  for (const collection of COLLECTIONS) {
    try {
      const count = await migrateCollection(collection);
      totalDocs += count;
    } catch (error: any) {
      console.error(`  ${collection}: ERROR - ${error.message}`);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Migration complete! ${totalDocs} documents migrated.`);
  console.log('='.repeat(50));
  console.log('');
  console.log('NOTE: The original data in dev-user-local was NOT deleted.');
  console.log('After verifying the app works, you can delete the old data.');

  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
