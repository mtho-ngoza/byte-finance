import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project } from '@/types';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

/**
 * Format amount in cents to Rands string
 */
function formatAmount(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format date to readable string
 */
function formatDate(dateValue: unknown): string {
  if (!dateValue) return '-';

  let date: Date;
  if (typeof dateValue === 'string') {
    date = new Date(dateValue);
  } else if (dateValue instanceof Date) {
    date = dateValue;
  } else if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
    date = new Date((dateValue as { _seconds: number })._seconds * 1000);
  } else if (typeof dateValue === 'object' && 'toDate' in (dateValue as object)) {
    date = (dateValue as { toDate: () => Date }).toDate();
  } else {
    return '-';
  }

  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Generate PDF for a project
 */
export function generateProjectPDF(project: Project): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Colors
  const primaryColor: [number, number, number] = [16, 185, 129]; // emerald-500
  const textColor: [number, number, number] = [31, 41, 55]; // gray-800
  const mutedColor: [number, number, number] = [107, 114, 128]; // gray-500

  let yPos = 20;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(...textColor);
  doc.text(project.name, 14, yPos);

  yPos += 8;

  if (project.description) {
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text(project.description, 14, yPos);
    yPos += 6;
  }

  // Status badge
  doc.setFontSize(9);
  const statusColors: Record<string, [number, number, number]> = {
    active: [16, 185, 129],
    paused: [245, 158, 11],
    completed: [107, 114, 128],
  };
  doc.setTextColor(...(statusColors[project.status] || mutedColor));
  doc.text(project.status.toUpperCase(), 14, yPos);

  yPos += 12;

  // Summary box
  const transactions = project.transactions || [];
  const totalContributions = transactions
    .filter(t => t.type === 'contribution')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPayments = transactions
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = totalContributions - totalPayments;

  // Draw summary box
  doc.setFillColor(249, 250, 251); // gray-50
  doc.roundedRect(14, yPos, pageWidth - 28, 45, 3, 3, 'F');

  yPos += 10;

  // Balance
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text('Current Balance', 20, yPos);

  yPos += 8;
  doc.setFontSize(20);
  doc.setTextColor(...primaryColor);
  doc.text(formatAmount(balance), 20, yPos);

  // Target progress (if set)
  if (project.targetAmount && project.targetAmount > 0) {
    const progress = Math.min(100, Math.round((balance / project.targetAmount) * 100));
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text(`${progress}% of ${formatAmount(project.targetAmount)} target`, 20, yPos + 8);
  }

  // Totals on the right
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text('Total In:', pageWidth - 70, yPos - 10);
  doc.text('Total Out:', pageWidth - 70, yPos);

  doc.setTextColor(16, 185, 129); // green
  doc.text(formatAmount(totalContributions), pageWidth - 40, yPos - 10);
  doc.setTextColor(239, 68, 68); // red
  doc.text(formatAmount(totalPayments), pageWidth - 40, yPos);

  yPos += 30;

  // Transaction history heading
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  doc.text('Transaction History', 14, yPos);

  yPos += 6;

  // Helper to parse date for sorting
  const parseTransactionDate = (dateValue: unknown): Date => {
    if (!dateValue) return new Date(0);
    if (typeof dateValue === 'string') return new Date(dateValue);
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
      return new Date((dateValue as { _seconds: number })._seconds * 1000);
    }
    return new Date(0);
  };

  // Sort transactions by date (newest first)
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = parseTransactionDate(a.date);
    const dateB = parseTransactionDate(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  if (sortedTransactions.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text('No transactions recorded yet.', 14, yPos + 10);
  } else {
    // Transaction table
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Description', 'Type', 'Amount']],
      body: sortedTransactions.map(txn => [
        formatDate(txn.date),
        txn.description + (txn.contributorName ? ` (${txn.contributorName})` : ''),
        txn.type === 'contribution' ? 'IN' : 'OUT',
        (txn.type === 'contribution' ? '+' : '-') + formatAmount(txn.amount),
      ]),
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 35, halign: 'right' },
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      didParseCell: (data) => {
        // Color amount based on type
        if (data.column.index === 3 && data.section === 'body') {
          const rawRow = data.row.raw as string[] | undefined;
          const isContribution = rawRow?.[2] === 'IN';
          data.cell.styles.textColor = isContribution ? [16, 185, 129] : [239, 68, 68];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // Footer
  const finalY = doc.lastAutoTable?.finalY || yPos + 20;
  const footerY = Math.max(finalY + 20, doc.internal.pageSize.getHeight() - 20);

  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  doc.text(
    `Generated by Byte Finance on ${new Date().toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    14,
    footerY
  );

  // Save the PDF
  const fileName = `${project.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
