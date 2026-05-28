// src/lib/pdf-generator.ts
// Client-only utility — must only be called inside 'use client' components.
// jsPDF and jspdf-autotable are dynamically imported to prevent SSR build errors.

import {
  getFacilityComplianceData,
  getFacilitySettings,
  getPersonnelData,
  getLatestOperationalAcknowledgment,
} from 'src/app/actions/compliance';
import type { IdentifiedGap } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function fmt(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fmtLong(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

function statusLabel(status: IdentifiedGap['compliance_status']): string {
  switch (status) {
    case 'satisfied':     return 'Satisfied';
    case 'expiring_soon': return 'Expiring Soon';
    case 'expired':       return 'Expired';
    case 'missing':       return 'Missing';
    default:              return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// PDF color palette
// ---------------------------------------------------------------------------

const C = {
  navy:     [15,  23,  42]  as RGB,
  slate800: [30,  41,  59]  as RGB,
  slate700: [51,  65,  85]  as RGB,
  slate500: [100, 116, 139] as RGB,
  slate300: [203, 213, 225] as RGB,
  slate100: [241, 245, 249] as RGB,
  slate50:  [248, 250, 252] as RGB,
  white:    [255, 255, 255] as RGB,
  green:    [22,  163, 74]  as RGB,
  greenBg:  [236, 253, 245] as RGB,
  greenBd:  [167, 243, 208] as RGB,
  amber:    [217, 119, 6]   as RGB,
  amberBg:  [255, 251, 235] as RGB,
  red:      [220, 38,  38]  as RGB,
  redBg:    [254, 242, 242] as RGB,
  redBd:    [254, 202, 202] as RGB,
  indigo:   [67,  56,  202] as RGB,
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateAuditReport(facilityId: string): Promise<void> {
  // Dynamic imports keep jsPDF out of the SSR/Node bundle
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // Fetch all required data in parallel
  const [settingsResult, complianceData, personnel, acknowledgment] = await Promise.all([
    getFacilitySettings(facilityId),
    getFacilityComplianceData(facilityId),
    getPersonnelData(facilityId),
    getLatestOperationalAcknowledgment(facilityId),
  ]);

  // Safe facility field access (Supabase returns untyped Record)
  const fac = settingsResult.facility as Record<string, unknown> | null;
  const facilityName   = typeof fac?.name            === 'string' ? fac.name            : 'Unknown Facility';
  const licenseNumber  = typeof fac?.license_number  === 'string' ? fac.license_number  : 'N/A';
  const facilityType   = typeof fac?.facility_type   === 'string' ? fac.facility_type   : '';
  const facilityTypeLabel = facilityType === 'childcare_center' ? 'Childcare Center' : 'Nursing Home';
  const capacity       = typeof fac?.capacity        === 'number' ? String(fac.capacity) : 'N/A';
  const enrollment     = complianceData.activeEnrollment != null  ? String(complianceData.activeEnrollment) : 'Not Set';

  const today     = new Date();
  const todayLong = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fileDate  = today.toISOString().split('T')[0];

  // ---------------------------------------------------------------------------
  // Document setup
  // ---------------------------------------------------------------------------

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const MARGIN = 18;
  const COL_W  = pageW - MARGIN * 2;

  // Shorthand color setters (avoids spread-arg TS overload ambiguity)
  const fill  = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const draw  = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const tint  = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  let y = 0;

  // ---------------------------------------------------------------------------
  // HEADER BANNER
  // ---------------------------------------------------------------------------

  fill(C.navy);
  doc.rect(0, 0, pageW, 40, 'F');

  tint(C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('AR COMPLIANCE GUARD', MARGIN, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  tint([148, 163, 184]); // slate-400
  doc.text('OFFICIAL AUDIT REPORT  —  CONFIDENTIAL', MARGIN, 22);

  tint([148, 163, 184]);
  doc.setFontSize(7.5);
  doc.text(`Generated: ${todayLong}`, pageW - MARGIN, 15, { align: 'right' });
  doc.text('For official use only', pageW - MARGIN, 22, { align: 'right' });

  y = 50;

  // ---------------------------------------------------------------------------
  // FACILITY DETAILS  (2-column grid)
  // ---------------------------------------------------------------------------

  tint(C.slate500);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('FACILITY DETAILS', MARGIN, y);
  y += 3;

  draw(C.slate100);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 5;

  const halfW = COL_W / 2;
  const detailPair = (
    lLabel: string, lVal: string,
    rLabel: string, rVal: string,
    rowY: number
  ) => {
    tint(C.slate500);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(lLabel, MARGIN, rowY);
    doc.text(rLabel, MARGIN + halfW + 4, rowY);

    tint(C.slate800);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(lVal, MARGIN, rowY + 5);
    doc.text(rVal, MARGIN + halfW + 4, rowY + 5);
  };

  detailPair('FACILITY NAME', facilityName, 'FACILITY TYPE', facilityTypeLabel, y);
  y += 14;
  detailPair('LICENSE NUMBER', licenseNumber, 'LICENSED CAPACITY', capacity, y);
  y += 14;
  detailPair('ACTIVE ENROLLMENT', enrollment, 'ACTIVE STAFF COUNT', String(complianceData.totalPersonnel), y);
  y += 18;

  // ---------------------------------------------------------------------------
  // OPERATIONAL ACKNOWLEDGMENT STAMP
  // ---------------------------------------------------------------------------

  const ackBg: RGB = acknowledgment ? C.greenBg : C.redBg;
  const ackBd: RGB = acknowledgment ? C.greenBd : C.redBd;
  const ackTxt: RGB = acknowledgment ? C.green : C.red;

  fill(ackBg);
  draw(ackBd);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN, y, COL_W, acknowledgment ? 17 : 12, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  tint(ackTxt);

  if (acknowledgment) {
    doc.text(
      `OPERATIONAL STANDARDS ACKNOWLEDGED BY: ${acknowledgment.user_name.toUpperCase()}`,
      MARGIN + 5, y + 7
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    tint(C.slate500);
    doc.text(`Signed on: ${fmtLong(acknowledgment.created_at)}`, MARGIN + 5, y + 13);
  } else {
    doc.text('⚠  OPERATIONAL ACKNOWLEDGMENT: MISSING / PENDING', MARGIN + 5, y + 7.5);
  }

  y += (acknowledgment ? 17 : 12) + 10;

  // ---------------------------------------------------------------------------
  // COMPLIANCE SCORES
  // ---------------------------------------------------------------------------

  tint(C.slate500);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('COMPLIANCE SCORES', MARGIN, y);
  y += 3;

  draw(C.slate100);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 4;

  const scoreBox = (label: string, score: number, x: number, bY: number) => {
    const boxW = halfW - 2;
    const color: RGB = score >= 80 ? C.green : score >= 50 ? C.amber : C.red;

    fill(C.slate50);
    draw(C.slate100);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, bY, boxW, 20, 2, 2, 'FD');

    tint(C.slate500);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(label, x + 4, bY + 7);

    tint(color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(`${score}%`, x + 4, bY + 17);
  };

  scoreBox('Facility Readiness Score',   complianceData.facilityReadinessScore,   MARGIN, y);
  scoreBox('Personnel Readiness Score', complianceData.personnelReadinessScore, MARGIN + halfW + 4, y);
  y += 28;

  // ---------------------------------------------------------------------------
  // Helper: section header + divider
  // ---------------------------------------------------------------------------

  const sectionHeader = (title: string, curY: number): number => {
    tint(C.slate500);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(title, MARGIN, curY);
    curY += 2.5;
    draw(C.slate100);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, curY, pageW - MARGIN, curY);
    return curY + 2;
  };

  // ---------------------------------------------------------------------------
  // FACILITY COMPLIANCE REQUIREMENTS TABLE
  // ---------------------------------------------------------------------------

  const facilityGaps = complianceData.gaps.filter(
    (g) => g.score_category === 'facility'
  );

  y = sectionHeader(
    `FACILITY COMPLIANCE REQUIREMENTS  (${facilityGaps.filter(g => g.compliance_status !== 'missing').length} / ${facilityGaps.length} satisfied)`,
    y
  );

  const facilityBody = facilityGaps.map((g) => [
    g.name,
    g.severity.toUpperCase(),
    statusLabel(g.compliance_status),
    g.document_created_at ? fmt(g.document_created_at) : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Requirement', 'Severity', 'Status', 'Document Date']],
    body: facilityBody.length > 0 ? facilityBody : [['No facility requirements configured.', '', '', '']],
    margin: { left: MARGIN, right: MARGIN },
    styles:      { fontSize: 8, cellPadding: 2.8, textColor: C.slate800, lineColor: C.slate100, lineWidth: 0.2 },
    headStyles:  { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.slate50 },
    columnStyles: {
      0: { cellWidth: COL_W * 0.50 },
      1: { cellWidth: COL_W * 0.14, halign: 'center' },
      2: { cellWidth: COL_W * 0.20, halign: 'center' },
      3: { cellWidth: COL_W * 0.16, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 1) {
        if (String(data.cell.raw) === 'CRITICAL') data.cell.styles.textColor = C.red;
      }
      if (data.column.index === 2) {
        const v = String(data.cell.raw);
        if (v === 'Satisfied')     data.cell.styles.textColor = C.green;
        else if (v === 'Expiring Soon') data.cell.styles.textColor = C.amber;
        else if (v === 'Expired')  data.cell.styles.textColor = C.red;
        else if (v === 'Missing')  data.cell.styles.textColor = C.red;
      }
    },
  });

  const docRef = doc as unknown as { lastAutoTable?: { finalY?: number } };
  y = (docRef.lastAutoTable?.finalY ?? y + 30) + 10;

  // ---------------------------------------------------------------------------
  // PERSONNEL LICENSING REQUIREMENTS TABLE
  // ---------------------------------------------------------------------------

  const personnelGaps = complianceData.gaps.filter(
    (g) => g.score_category === 'personnel'
  );

  if (personnelGaps.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = 20; }

    y = sectionHeader(
      `PERSONNEL LICENSING REQUIREMENTS  (${personnelGaps.filter(g => g.compliance_status !== 'missing').length} / ${personnelGaps.length} satisfied)`,
      y
    );

    const personnelLicBody = personnelGaps.map((g) => [
      g.name,
      g.severity.toUpperCase(),
      statusLabel(g.compliance_status),
      g.document_created_at ? fmt(g.document_created_at) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Requirement', 'Severity', 'Status', 'Document Date']],
      body: personnelLicBody,
      margin: { left: MARGIN, right: MARGIN },
      styles:      { fontSize: 8, cellPadding: 2.8, textColor: C.slate800, lineColor: C.slate100, lineWidth: 0.2 },
      headStyles:  { fillColor: C.indigo, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.slate50 },
      columnStyles: {
        0: { cellWidth: COL_W * 0.50 },
        1: { cellWidth: COL_W * 0.14, halign: 'center' },
        2: { cellWidth: COL_W * 0.20, halign: 'center' },
        3: { cellWidth: COL_W * 0.16, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index === 1) {
          if (String(data.cell.raw) === 'CRITICAL') data.cell.styles.textColor = C.red;
        }
        if (data.column.index === 2) {
          const v = String(data.cell.raw);
          if (v === 'Satisfied')          data.cell.styles.textColor = C.green;
          else if (v === 'Expiring Soon') data.cell.styles.textColor = C.amber;
          else if (v === 'Expired')       data.cell.styles.textColor = C.red;
          else if (v === 'Missing')       data.cell.styles.textColor = C.red;
        }
      },
    });

    y = (docRef.lastAutoTable?.finalY ?? y + 30) + 10;
  }

  // ---------------------------------------------------------------------------
  // ACTIVE PERSONNEL ROSTER TABLE
  // ---------------------------------------------------------------------------

  if (y > pageH - 60) { doc.addPage(); y = 20; }

  y = sectionHeader(
    `ACTIVE PERSONNEL ROSTER  (${(personnel as unknown[]).length} employees)`,
    y
  );

  type PersonnelRow = {
    name: string;
    role: string;
    clearance_status: string;
    hire_date: string | null;
  };

  const rosterBody = (personnel as PersonnelRow[]).map((p) => [
    p.name  ?? 'Unknown',
    p.role  ?? 'Unassigned',
    (p.clearance_status ?? 'pending').toUpperCase(),
    fmt(p.hire_date),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Employee Name', 'Role', 'Clearance Status', 'Hire Date']],
    body: rosterBody.length > 0 ? rosterBody : [['No active personnel on record.', '', '', '']],
    margin: { left: MARGIN, right: MARGIN },
    styles:      { fontSize: 8, cellPadding: 2.8, textColor: C.slate800, lineColor: C.slate100, lineWidth: 0.2 },
    headStyles:  { fillColor: C.slate700, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.slate50 },
    columnStyles: {
      0: { cellWidth: COL_W * 0.28 },
      1: { cellWidth: COL_W * 0.32 },
      2: { cellWidth: COL_W * 0.22, halign: 'center' },
      3: { cellWidth: COL_W * 0.18, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 2) return;
      const v = String(data.cell.raw);
      if (v === 'CLEARED')  data.cell.styles.textColor = C.green;
      else if (v === 'PENDING') data.cell.styles.textColor = C.amber;
      else if (v === 'FLAGGED') data.cell.styles.textColor = C.red;
    },
  });

  // ---------------------------------------------------------------------------
  // FOOTER (every page)
  // ---------------------------------------------------------------------------

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Thin rule
    draw(C.slate300);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageH - 12, pageW - MARGIN, pageH - 12);

    tint(C.slate500);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      `Compliance Guard Pro  •  ${facilityName}  •  Page ${i} of ${totalPages}`,
      pageW / 2, pageH - 7.5, { align: 'center' }
    );
    doc.text('CONFIDENTIAL — FOR OFFICIAL USE ONLY', pageW / 2, pageH - 4, { align: 'center' });
  }

  // ---------------------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------------------

  const safeName = facilityName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  doc.save(`${safeName}_Audit_Report_${fileDate}.pdf`);
}
