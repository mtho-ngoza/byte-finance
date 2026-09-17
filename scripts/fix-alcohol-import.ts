/**
 * Fix the alcohol import - nested categories, correct totals, no payments
 * Run with: npx tsx scripts/fix-alcohol-import.ts
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
    console.error('Missing Firebase credentials');
    process.exit(1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const USER_ID = '100814132640125436719';
const EVENT_ID = 'Va9w4jEWzrbEwr1iLeKZ';

// Items using EXACT UNIT PRICES from user's list (in cents)
// Total is calculated as unitPrice × quantity
const alcoholItems = {
  'Beer': [
    { name: 'Black label case', quantity: 4, unitPrice: 19200 },      // R192 × 4 = R768
    { name: 'Castle case', quantity: 2, unitPrice: 15200 },            // R152 × 2 = R304
    { name: 'Heineken box', quantity: 4, unitPrice: 25000 },           // R250 × 4 = R1000
    { name: 'Amstel case', quantity: 4, unitPrice: 18500 },            // R185 × 4 = R740
    { name: 'Flying Fish lemon case', quantity: 5, unitPrice: 24000 }, // R240 × 5 = R1200
    { name: 'Corona box', quantity: 6, unitPrice: 35000 },             // R350 × 6 = R2100
  ],
  'Cider': [
    { name: 'Brutal fruit box', quantity: 5, unitPrice: 22500 },       // R225 × 5 = R1125
    { name: 'Hunters Dry case', quantity: 2, unitPrice: 23500 },       // R235 × 2 = R470
    { name: 'Hunters Gold case', quantity: 2, unitPrice: 23500 },      // R235 × 2 = R470
    { name: 'Hunters Dry 24', quantity: 3, unitPrice: 32400 },         // R324 × 3 = R972
    { name: 'Savanna 24', quantity: 4, unitPrice: 37000 },             // R370 × 4 = R1480
    { name: 'Hooch 24', quantity: 4, unitPrice: 30000 },               // R300 × 4 = R1200
  ],
  'Wine': [
    { name: '4th street sweet rose 5l', quantity: 5, unitPrice: 14000 },  // R140 × 5 = R700
    { name: '4th street sweet white 5l', quantity: 5, unitPrice: 14000 }, // R140 × 5 = R700
    { name: 'Robertson sweet red 3l', quantity: 3, unitPrice: 11500 },    // R115 × 3 = R345
    { name: 'Robertson sweet rose 3l', quantity: 2, unitPrice: 11500 },   // R115 × 2 = R230
    { name: 'Raindance 3l', quantity: 10, unitPrice: 7500 },              // R75 × 10 = R750
  ],
  'Spirits': [
    { name: 'Smirnoff case', quantity: 1, unitPrice: 173000 },             // R1730
    { name: 'Smirnoff case 200ml', quantity: 1, unitPrice: 54000 },        // R540
    { name: 'Belgravia', quantity: 5, unitPrice: 13000 },                  // R130 × 5 = R650
    { name: 'Tanqueray', quantity: 6, unitPrice: 24500 },                  // R245 × 6 = R1470
    { name: 'Jameson Select', quantity: 12, unitPrice: 47000 },            // R470 × 12 = R5640
    { name: "Gordon's case (200ml)", quantity: 1, unitPrice: 55000 },      // R550
    { name: 'Jagermeister case (200ml)', quantity: 1, unitPrice: 120000 }, // R1200
    { name: 'Russian Bear', quantity: 1, unitPrice: 13500 },               // R135
    { name: 'Three Ships', quantity: 2, unitPrice: 11400 },                // R114 × 2 = R228
    { name: 'Red Label 1L', quantity: 1, unitPrice: 30000 },               // R300
    { name: 'First Watch', quantity: 1, unitPrice: 14500 },                // R145
    { name: 'Champagne', quantity: 12, unitPrice: 8000 },                  // R80 × 12 = R960
  ],
};

// Delivery is separate (not under Alcohol)
const deliveryItems = [
  { name: 'Delivery', quantity: 1, total: 70000 },  // R700
];

async function fixImport() {
  console.log('Fixing alcohol import with nested categories...\n');

  const eventRef = db.collection(`users/${USER_ID}/events`).doc(EVENT_ID);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    console.error('Event not found!');
    return;
  }

  const eventData = eventDoc.data()!;
  console.log(`Event: ${eventData.name}\n`);

  // Get existing data
  const existingCategories = eventData.categories || [];
  const existingItems = eventData.items || [];

  // Remove old categories we created (Beer, Cider, Wine, Spirits, Delivery)
  const oldCategoryNames = ['Beer', 'Cider', 'Wine', 'Spirits', 'Delivery'];
  const oldCategoryIds = existingCategories
    .filter((c: any) => oldCategoryNames.includes(c.name))
    .map((c: any) => c.id);

  const categoriesToKeep = existingCategories.filter((c: any) => !oldCategoryNames.includes(c.name));
  const itemsToKeep = existingItems.filter((i: any) => !oldCategoryIds.includes(i.categoryId));

  console.log(`Removing ${existingCategories.length - categoriesToKeep.length} old categories`);
  console.log(`Removing ${existingItems.length - itemsToKeep.length} old items\n`);

  // Create new nested category structure
  const now = new Date();
  const newCategories: any[] = [];
  const newItems: any[] = [];

  // 1. Create parent "Alcohol" category
  const alcoholCatId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  newCategories.push({
    id: alcoholCatId,
    name: 'Alcohol',
    sortOrder: categoriesToKeep.length,
  });
  console.log(`+ Alcohol (parent)`);

  // 2. Create subcategories under Alcohol
  const subcategoryIds: Record<string, string> = {};
  let subOrder = 0;
  for (const subName of Object.keys(alcoholItems)) {
    const subCatId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    subcategoryIds[subName] = subCatId;
    newCategories.push({
      id: subCatId,
      name: subName,
      parentId: alcoholCatId,  // Nested under Alcohol
      sortOrder: subOrder++,
    });
    console.log(`  └─ ${subName}`);
  }

  // 3. Create Delivery category (not nested)
  const deliveryCatId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  newCategories.push({
    id: deliveryCatId,
    name: 'Delivery',
    sortOrder: categoriesToKeep.length + 1,
  });
  console.log(`+ Delivery\n`);

  // 4. Create items under each subcategory
  console.log('Adding items:');
  for (const [subName, items] of Object.entries(alcoholItems)) {
    const categoryId = subcategoryIds[subName];
    console.log(`\n  ${subName}:`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const total = item.unitPrice * item.quantity;

      newItems.push({
        id: itemId,
        categoryId,
        name: item.name,
        vendor: null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        status: 'quoted',
        payments: [],
        sortOrder: i,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`    ${item.name}: ${item.quantity} × R${(item.unitPrice / 100).toFixed(2)} = R${(total / 100).toFixed(2)}`);
    }
  }

  // 5. Add delivery item
  console.log(`\n  Delivery:`);
  for (let i = 0; i < deliveryItems.length; i++) {
    const item = deliveryItems[i];
    const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    newItems.push({
      id: itemId,
      categoryId: deliveryCatId,
      name: item.name,
      vendor: null,
      unitPrice: item.total,
      quantity: item.quantity,
      status: 'quoted',
      payments: [],
      sortOrder: i,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    console.log(`    ${item.name}: R${(item.total / 100).toFixed(2)}`);
  }

  // Update event
  const allCategories = [...categoriesToKeep, ...newCategories];
  const allItems = [...itemsToKeep, ...newItems];

  await eventRef.update({
    categories: allCategories,
    items: allItems,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Calculate totals
  const totalQuoted = newItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  console.log('\n=== Summary ===');
  console.log(`Categories: 1 parent (Alcohol) + 4 subcategories + 1 standalone (Delivery)`);
  console.log(`Items: ${newItems.length}`);
  console.log(`Total quoted: R${(totalQuoted / 100).toFixed(2)}`);
  console.log(`Total paid: R0.00`);
}

fixImport().then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
