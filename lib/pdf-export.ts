import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project } from '@/types';
import type { GoalWithComputed } from '@/hooks/use-goals';

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

/**
 * Generate PDF for a goal
 */
export function generateGoalPDF(goal: GoalWithComputed): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Colors
  const primaryColor: [number, number, number] = [16, 185, 129]; // emerald-500
  const textColor: [number, number, number] = [31, 41, 55]; // gray-800
  const mutedColor: [number, number, number] = [107, 114, 128]; // gray-500
  const warningColor: [number, number, number] = [245, 158, 11]; // amber-500

  let yPos = 20;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(...textColor);
  doc.text(goal.name, 14, yPos);

  yPos += 8;

  // Type and status
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  const typeLabel = goal.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  doc.text(typeLabel, 14, yPos);

  // Status badge
  const statusColors: Record<string, [number, number, number]> = {
    active: [16, 185, 129],
    paused: [245, 158, 11],
    completed: [107, 114, 128],
  };
  doc.setTextColor(...(statusColors[goal.status] || mutedColor));
  doc.text(` • ${goal.status.toUpperCase()}`, 14 + doc.getTextWidth(typeLabel), yPos);

  // On track indicator
  const calculatedBalance = (goal.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
  if (calculatedBalance >= goal.targetAmount) {
    doc.setTextColor(...primaryColor);
    doc.text(' • COMPLETE', 14 + doc.getTextWidth(typeLabel + ` • ${goal.status.toUpperCase()}`), yPos);
  } else if (goal.isOnTrack) {
    doc.setTextColor(...primaryColor);
    doc.text(' • On Track', 14 + doc.getTextWidth(typeLabel + ` • ${goal.status.toUpperCase()}`), yPos);
  } else {
    doc.setTextColor(...warningColor);
    doc.text(' • Behind', 14 + doc.getTextWidth(typeLabel + ` • ${goal.status.toUpperCase()}`), yPos);
  }

  yPos += 12;

  // Progress Summary Box
  const progressPercent = goal.targetAmount > 0
    ? Math.min(100, Math.round((calculatedBalance / goal.targetAmount) * 100))
    : 0;
  const remaining = Math.max(0, goal.targetAmount - calculatedBalance);

  // Draw summary box
  doc.setFillColor(249, 250, 251); // gray-50
  doc.roundedRect(14, yPos, pageWidth - 28, 55, 3, 3, 'F');

  yPos += 10;

  // Progress bar
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text('Progress', 20, yPos);
  doc.text(`${progressPercent}%`, pageWidth - 34, yPos);

  yPos += 5;

  // Draw progress bar background
  const barWidth = pageWidth - 48;
  const barHeight = 6;
  doc.setFillColor(229, 231, 235); // gray-200
  doc.roundedRect(20, yPos, barWidth, barHeight, 2, 2, 'F');

  // Draw progress bar fill
  if (progressPercent > 0) {
    doc.setFillColor(...primaryColor);
    doc.roundedRect(20, yPos, (barWidth * progressPercent) / 100, barHeight, 2, 2, 'F');
  }

  yPos += 14;

  // Stats row
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  doc.text('Current', 20, yPos);
  doc.text('Target', pageWidth / 2 - 10, yPos);
  doc.text('Remaining', pageWidth - 54, yPos);

  yPos += 6;

  doc.setFontSize(14);
  doc.setTextColor(...textColor);
  doc.text(formatAmount(calculatedBalance), 20, yPos);
  doc.text(formatAmount(goal.targetAmount), pageWidth / 2 - 10, yPos);
  doc.setTextColor(...(remaining > 0 ? warningColor : primaryColor));
  doc.text(formatAmount(remaining), pageWidth - 54, yPos);

  yPos += 20;

  // Monthly Contribution Section
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  doc.text('Monthly Contribution', 14, yPos);

  yPos += 8;

  doc.setFillColor(249, 250, 251);
  doc.roundedRect(14, yPos, pageWidth - 28, 25, 3, 3, 'F');

  yPos += 8;

  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  doc.text('Effective Monthly', 20, yPos);
  doc.text('Manual Target', pageWidth / 2, yPos);

  yPos += 6;

  doc.setFontSize(11);
  doc.setTextColor(...textColor);
  doc.text(formatAmount(goal.effectiveMonthlyTarget), 20, yPos);
  doc.text(formatAmount(goal.monthlyTarget ?? 0), pageWidth / 2, yPos);

  yPos += 18;

  // Timeline Section (if applicable)
  if (goal.estimatedCompletionDate || goal.daysUntilDeadline !== null) {
    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.text('Timeline', 14, yPos);

    yPos += 8;

    doc.setFillColor(249, 250, 251);
    doc.roundedRect(14, yPos, pageWidth - 28, 25, 3, 3, 'F');

    yPos += 8;

    if (goal.estimatedCompletionDate && calculatedBalance < goal.targetAmount) {
      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);
      doc.text('Estimated Completion', 20, yPos);

      yPos += 6;

      doc.setFontSize(10);
      doc.setTextColor(...textColor);
      doc.text(
        goal.estimatedCompletionDate.toLocaleDateString('en-ZA', {
          month: 'long',
          year: 'numeric',
        }),
        20,
        yPos
      );
    }

    if (goal.daysUntilDeadline !== null) {
      const deadlineX = goal.estimatedCompletionDate && calculatedBalance < goal.targetAmount ? pageWidth / 2 : 20;

      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);
      doc.text('Target Deadline', deadlineX, yPos - 6);

      doc.setFontSize(10);
      doc.setTextColor(...(goal.daysUntilDeadline < 30 ? warningColor : textColor));
      const deadlineText = goal.daysUntilDeadline > 0
        ? `${goal.daysUntilDeadline} days remaining`
        : goal.daysUntilDeadline === 0
        ? 'Today!'
        : `${Math.abs(goal.daysUntilDeadline)} days overdue`;
      doc.text(deadlineText, deadlineX, yPos);
    }

    yPos += 18;
  }

  // Contribution History Section
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  const contributions = goal.contributions ?? [];
  doc.text(`Contribution History (${contributions.length})`, 14, yPos);

  yPos += 6;

  // Helper to parse contribution date for sorting
  const parseContributionDate = (dateValue: unknown): Date => {
    if (!dateValue) return new Date(0);
    if (typeof dateValue === 'string') return new Date(dateValue);
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'object' && 'toDate' in (dateValue as object)) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
      return new Date((dateValue as { _seconds: number })._seconds * 1000);
    }
    return new Date(0);
  };

  // Sort contributions by date (newest first)
  const sortedContributions = [...contributions].sort((a, b) => {
    const dateA = parseContributionDate(a.date);
    const dateB = parseContributionDate(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  if (sortedContributions.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text('No contributions recorded yet.', 14, yPos + 10);
  } else {
    // Contribution table
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Note', 'Amount']],
      body: sortedContributions.map(contrib => [
        formatDate(contrib.date),
        contrib.note || '-',
        '+' + formatAmount(contrib.amount),
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
        2: { cellWidth: 35, halign: 'right' },
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      didParseCell: (data) => {
        // Color amount column green
        if (data.column.index === 2 && data.section === 'body') {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // Notes (if present)
  if (goal.notes) {
    const tableY = doc.lastAutoTable?.finalY || yPos + 20;
    const notesY = tableY + 15;

    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.text('Notes', 14, notesY);

    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    const splitNotes = doc.splitTextToSize(goal.notes, pageWidth - 28);
    doc.text(splitNotes, 14, notesY + 8);
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
  const fileName = `${goal.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
