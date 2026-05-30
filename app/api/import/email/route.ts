import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/import/email
 * Body: { host, port, user, password, cycleId, maxMessages? }
 *
 * Connects to an IMAP mailbox, fetches recent emails with PDF attachments,
 * extracts invoice data via Gemini, and returns a preview list.
 * Does NOT import — call /api/import/email/confirm to commit.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { host, port, user, password, cycleId, maxMessages = 20 } = body;

  if (!host || !user || !password || !cycleId) {
    return NextResponse.json({ error: 'host, user, password, and cycleId are required' }, { status: 400 });
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

  const invoices: Array<{
    messageId: string;
    subject: string;
    from: string;
    date: string;
    attachments: Array<{ filename: string; size: number; contentType: string }>;
  }> = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Fetch recent messages
    const statusResult = await client.status('INBOX', { messages: true });
    const totalMessages = statusResult.messages ?? 0;
    const startSeq = Math.max(1, totalMessages - maxMessages + 1);

    const messages = client.fetch(`${startSeq}:*`, {
      envelope: true,
      bodyStructure: true,
      source: true,
    });

    for await (const msg of messages) {
      try {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const pdfAttachments = (parsed.attachments ?? []).filter(
          (a) => a.contentType === 'application/pdf' || a.filename?.endsWith('.pdf')
        );

        if (pdfAttachments.length === 0) continue;

        invoices.push({
          messageId: parsed.messageId ?? msg.uid.toString(),
          subject: parsed.subject ?? '(no subject)',
          from: parsed.from?.text ?? '',
          date: parsed.date?.toISOString() ?? new Date().toISOString(),
          attachments: pdfAttachments.map((a) => ({
            filename: a.filename ?? 'attachment.pdf',
            size: a.size ?? 0,
            contentType: a.contentType,
          })),
        });
      } catch {
        // Skip malformed messages
      }
    }

    await client.logout();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'IMAP connection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ invoices, count: invoices.length });
}
