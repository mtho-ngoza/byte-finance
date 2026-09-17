/**
 * Script to import alcohol items into an event
 * Run with: npx tsx scripts/import-alcohol-items.ts <eventId>
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
}

// Initialize Firebase Admin
if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in .env.local');
    console.error('Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    process.exit(1);
  }

  // Handle escaped newlines in private key
  privateKey = privateKey.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = getFirestore();

// Your user ID
const USER_ID = '100814132640125436719';

// Items to import - parsed from user's list
// All prices in cents, using totals provided divided by quantity
const itemsData = {
  'Beer': [
    { name: 'Black label case', quantity: 4, unitPrice: 28800, paid: true },      // R1152 / 4 = R288 each
    { name: 'Castle case', quantity: 2, unitPrice: 30400, paid: true },            // R608 / 2 = R304 each
    { name: 'Heineken box', quantity: 4, unitPrice: 37500, paid: true },           // R1500 / 4 = R375 each
    { name: 'Amstel case', quantity: 4, unitPrice: 18500, paid: true },            // R740 / 4 = R185 each
    { name: 'Flying Fish lemon case', quantity: 5, unitPrice: 28800, paid: true }, // R1440 / 5 = R288 each
    { name: 'Corona box', quantity: 6, unitPrice: 35000, paid: true },             // R2100 / 6 = R350 each
  ],
  'Cider': [
    { name: 'Brutal fruit box', quantity: 5, unitPrice: 31500, paid: true },      // R1575 / 5 = R315 each
    { name: 'Hunters Dry case', quantity: 2, unitPrice: 23500, paid: true },      // R470 / 2 = R235 each
    { name: 'Hunters Gold case', quantity: 2, unitPrice: 23500, paid: true },     // R470 / 2 = R235 each
    { name: 'Hunters Dry 24', quantity: 3, unitPrice: 54000, paid: true },        // R1620 / 3 = R540 each
    { name: 'Savanna 24', quantity: 4, unitPrice: 46250, paid: true },            // R1850 / 4 = R462.50 each
    { name: 'Hooch 24', quantity: 4, unitPrice: 30000, paid: true },              // R1200 / 4 = R300 each
  ],
  'Wine': [
    { name: '4th street sweet rose 5l', quantity: 5, unitPrice: 14000, paid: true },  // R700 / 5 = R140 each
    { name: '4th street sweet white 5l', quantity: 5, unitPrice: 14000, paid: true }, // R700 / 5 = R140 each
    { name: 'Robertson sweet red 3l', quantity: 3, unitPrice: 11500, paid: true },    // R345 / 3 = R115 each
    { name: 'Robertson sweet rose 3l', quantity: 2, unitPrice: 17250, paid: true },   // R345 / 2 = R172.50 each (user wrote R115 but total R345)
    { name: 'Raindance 3l', quantity: 10, unitPrice: 7500, paid: true },              // R750 / 10 = R75 each
  ],
  'Spirits': [
    { name: 'Smirnoff case', quantity: 1, unitPrice: 173000, paid: true },           // R1730
    { name: 'Smirnoff case 200ml', quantity: 1, unitPrice: 54000, paid: true },      // R540
    { name: 'Belgravia', quantity: 5, unitPrice: 13000, paid: true },                // R650 / 5 = R130 each
    { name: 'Tanqueray', quantity: 6, unitPrice: 24500, paid: true },                // R1470 / 6 = R245 each
    { name: 'Jameson Select', quantity: 12, unitPrice: 46242, paid: true },          // R5549 / 12 = R462.42 each
    { name: "Gordon's case (200ml)", quantity: 1, unitPrice: 55000, paid: true },    // R550
    { name: 'Jagermeister case (200ml)', quantity: 1, unitPrice: 120000, paid: true }, // R1200
    { name: 'Russian Bear', quantity: 1, unitPrice: 13500, paid: true },             // R135
    { name: 'Three Ships', quantity: 2, unitPrice: 11500, paid: true },              // R230 / 2 = R115 each
    { name: 'Red Label 1L', quantity: 1, unitPrice: 30000, paid: true },             // R300
    { name: 'First Watch', quantity: 1, unitPrice: 14500, paid: true },              // R145
    { name: 'Champagne', quantity: 12, unitPrice: 8000, paid: true },                // R960 / 12 = R80 each
  ],
  'Delivery': [
    { name: 'Delivery', quantity: 1, unitPrice: 70000, paid: false },                // R700
  ],
};

async function importItems(eventId: string) {
  console.log(`Importing items to event: ${eventId}`);

  const eventRef = db.collection(`users/${USER_ID}/events`).doc(eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    console.error('Event not found!');
    console.log('\nAvailable events:');
    const eventsSnapshot = await db.collection(`users/${USER_ID}/events`).get();
    eventsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.name}`);
    });
    return;
  }

  const eventData = eventDoc.data()!;
  console.log(`Found event: ${eventData.name}`);

  const existingCategories = eventData.categories || [];
  const existingItems = eventData.items || [];

  // Create categories if they don't exist
  const categoryMap: Record<string, string> = {};
  const newCategories: any[] = [];

  for (const categoryName of Object.keys(itemsData)) {
    const existing = existingCategories.find((c: any) => c.name === categoryName);
    if (existing) {
      categoryMap[categoryName] = existing.id;
      console.log(`Category exists: ${categoryName} (${existing.id})`);
    } else {
      const catId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      categoryMap[categoryName] = catId;
      newCategories.push({
        id: catId,
        name: categoryName,
        sortOrder: existingCategories.length + newCategories.length,
      });
      console.log(`Creating category: ${categoryName} (${catId})`);
    }
  }

  // Create items
  const newItems: any[] = [];
  const now = new Date();

  for (const [categoryName, items] of Object.entries(itemsData)) {
    const categoryId = categoryMap[categoryName];
    const categoryItemCount = existingItems.filter((i: any) => i.categoryId === categoryId).length;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const subtotal = item.unitPrice * item.quantity;

      const newItem: any = {
        id: itemId,
        categoryId,
        name: item.name,
        vendor: null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        status: item.paid ? 'paid' : 'quoted',
        payments: item.paid ? [{
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          amount: subtotal,
          date: now,
          note: 'Imported - paid',
        }] : [],
        sortOrder: categoryItemCount + i,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };

      newItems.push(newItem);
      console.log(`  + ${item.name} (${item.quantity} × R${(item.unitPrice / 100).toFixed(2)} = R${(subtotal / 100).toFixed(2)}) [${item.paid ? 'PAID' : 'UNPAID'}]`);
    }
  }

  // Update event
  const allCategories = [...existingCategories, ...newCategories];
  const allItems = [...existingItems, ...newItems];

  await eventRef.update({
    categories: allCategories,
    items: allItems,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Calculate totals
  const totalQuoted = newItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
  const totalPaid = newItems.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  console.log('\n=== Import Summary ===');
  console.log(`Categories added: ${newCategories.length}`);
  console.log(`Items added: ${newItems.length}`);
  console.log(`Total quoted: R${(totalQuoted / 100).toFixed(2)}`);
  console.log(`Total paid: R${(totalPaid / 100).toFixed(2)}`);
  console.log(`Remaining: R${((totalQuoted - totalPaid) / 100).toFixed(2)}`);
}

// Get event ID from command line
const eventId = process.argv[2];
if (!eventId) {
  console.log('Usage: npx tsx scripts/import-alcohol-items.ts <eventId>');
  console.log('\nFetching available events...');

  db.collection(`users/${USER_ID}/events`).get().then(snapshot => {
    console.log('\nAvailable events:');
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.name}`);
    });
    process.exit(0);
  });
} else {
  importItems(eventId).then(() => {
    console.log('\nDone!');
    process.exit(0);
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
