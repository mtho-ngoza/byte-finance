import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

/**
 * POST /api/import/email/confirm
 * Body: { host, port, user, password, messageIds: string[] }
 *
 * Downloads PDF attachments from selected emails and creates receipt documents.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { host, port, user, password, messageIds } = body;

  if (!host || !user || !password || !messageIds || messageIds.length === 0) {
    return NextResponse.json(
      { error: 'host, user, password, and messageIds are required' },
      { status: 400 }
    );
  }

  // Dynamic import to avoid bundling issues
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');

  const client = new ImapFlow({
    host,
    port: port ?? 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  const db = getAdminDb();
  const storage = getAdminStorage();
  const bucket = storage.bucket();

  const createdReceipts: Array<{ id: string; filename: string; vendor: string }> = [];
  const errors: string[] = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Fetch all messages to find the ones we need
    const messages = client.fetch('1:*', {
      envelope: true,
      source: true,
    });

    for await (const msg of messages) {
      try {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const msgId = parsed.messageId ?? msg.uid.toString();

        // Skip if not in our selection
        if (!messageIds.includes(msgId)) continue;

        // Get PDF attachments
        const pdfAttachments = (parsed.attachments ?? []).filter(
          (a) => a.contentType === 'application/pdf' || a.filename?.endsWith('.pdf')
        );

        if (pdfAttachments.length === 0) continue;

        // Extract vendor from sender
        const fromText = parsed.from?.text ?? '';
        const vendor = extractVendorFromEmail(fromText, parsed.subject ?? '');
        const emailDate = parsed.date ?? new Date();

        // Process each PDF attachment
        for (const attachment of pdfAttachments) {
          try {
            const filename = attachment.filename ?? 'invoice.pdf';
            const pdfBuffer = attachment.content;

            // Generate hash for duplicate detection
            const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

            // Check for duplicate
            const existingSnap = await db
              .collection(`users/${userId}/receipts`)
              .where('imageHash', '==', pdfHash)
              .limit(1)
              .get();

            if (!existingSnap.empty) {
              errors.push(`Skipped duplicate: ${filename}`);
              continue;
            }

            // Generate unique receipt ID
            const receiptId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const basePath = `users/${userId}/receipts/${receiptId}`;

            // Upload PDF to storage
            const pdfStorageFile = bucket.file(`${basePath}/document.pdf`);
            await pdfStorageFile.save(pdfBuffer, {
              metadata: { contentType: 'application/pdf' },
            });
            await pdfStorageFile.makePublic();
            const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/document.pdf`;

            // Create receipt document
            const now = FieldValue.serverTimestamp();
            const receiptData = {
              imageUrl: pdfUrl, // Using imageUrl field for consistency
              originalImageUrl: pdfUrl,
              thumbnailUrl: null, // PDFs don't have thumbnails
              imageHash: pdfHash,
              amountInCents: null, // Will be extracted later
              vendor: vendor || null,
              note: `Imported from email: ${parsed.subject ?? ''}`,
              capturedAt: emailDate,
              needsAttention: true, // Needs manual review
              source: 'email',
              sourceFilename: filename,
              sourceMessageId: msgId,
              createdAt: now,
              updatedAt: now,
            };

            const docRef = await db.collection(`users/${userId}/receipts`).add(receiptData);

            createdReceipts.push({
              id: docRef.id,
              filename,
              vendor: vendor || 'Unknown',
            });
          } catch (attachErr) {
            errors.push(`Failed to process ${attachment.filename}: ${attachErr instanceof Error ? attachErr.message : 'Unknown error'}`);
          }
        }
      } catch {
        // Skip malformed messages
      }
    }

    await client.logout();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'IMAP connection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    created: createdReceipts,
    count: createdReceipts.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * Try to extract a vendor name from the email sender or subject
 */
function extractVendorFromEmail(from: string, subject: string): string {
  // Common patterns in sender addresses
  // e.g., "Takealot <noreply@takealot.com>" -> "Takealot"
  // e.g., "invoices@vodacom.co.za" -> "Vodacom"

  // Try to get display name first
  const displayNameMatch = from.match(/^([^<]+)</);
  if (displayNameMatch) {
    const name = displayNameMatch[1].trim();
    if (name && !name.includes('@')) {
      return cleanVendorName(name);
    }
  }

  // Extract domain from email
  const emailMatch = from.match(/@([^.]+)\./);
  if (emailMatch) {
    const domain = emailMatch[1];
    // Capitalize first letter
    return cleanVendorName(domain.charAt(0).toUpperCase() + domain.slice(1));
  }

  // Try subject line for common invoice patterns
  const subjectMatch = subject.match(/invoice\s+(?:from\s+)?([A-Za-z0-9\s&]+)/i);
  if (subjectMatch) {
    return cleanVendorName(subjectMatch[1].trim());
  }

  return '';
}

function cleanVendorName(name: string): string {
  // Remove common suffixes and clean up
  return name
    .replace(/\s*(Pty|Ltd|Inc|LLC|Limited|Corporation|Corp|Co)\s*\.?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
