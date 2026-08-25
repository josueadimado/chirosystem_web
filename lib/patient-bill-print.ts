/**
 * Patient Bill HTML — Relief Chiropractic–style statement layout for preview + print.
 */

import { formatMonthDayYear, formatNowMonthDayYearTime, parseApiDateOnly } from "@/lib/format-date";

export type PatientBillLine = {
  service_offered: string;
  cpt_code: string;
  description: string;
  fees: string;
  units: string;
  pos: string;
  /** Full line amount (for insurance / documentation). */
  line_total: string;
  /** Patient-portion amount when insurance-only line — kept for API parity; charge table uses fees/units. */
  patient_due?: string;
  charges_patient?: boolean;
};

export type PatientBillPayload = {
  bill_title?: string;
  /** True when opened via ?preview=1 while invoice is unpaid — not the final paid bill. */
  is_preview?: boolean;
  clinic_name: string;
  address_line1: string;
  city_state_zip: string;
  phone: string;
  /** Clinic-wide or per-doctor NPI — shown on every bill. */
  provider_billing_id?: string;
  /** Explicit NPI field (same as provider_billing_id when present). */
  provider_npi?: string;
  /** Provider/Office Employer ID# from clinic settings (separate from NPI). */
  office_employer_id?: string;
  /** Legacy alias for office employer ID (Admin → Settings). */
  employer_tax_id?: string;
  email?: string;
  pos_default?: string;
  invoice_number: string;
  invoice_id?: number;
  patient_id?: number;
  date_of_service: string;
  /** Display billing date on statement (from server). */
  billing_date_display?: string;
  /** “Statement” date top-right (from server, usually today). */
  statement_date_display?: string;
  patient_name: string;
  patient_payment_profile?: string;
  patient_address: string;
  diagnosis: string;
  provider_name?: string;
  provider_credential?: string;
  lines: PatientBillLine[];
  /** Sum of all documented line amounts (Bill charges row). */
  subtotal: string;
  patient_subtotal?: string;
  discount?: string;
  credit_applied_total?: string;
  tax: string;
  total_amount: string;
  status?: string;
  /** All documented charges (patient + insurance-only lines). */
  bill_charges_total?: string;
  /** Amount the client pays at Relief Chiropractic (after discount). */
  patient_charge_total?: string;
  /** Insurance-only line totals (not charged to the patient). */
  insurance_remaining_total?: string;
  /** Card/cash/online + wallet credit actually received. */
  payments_received_total?: string;
  /** Patient Payments minus payments received (0 when paid in full). */
  remaining_client_responsibility_total?: string;
  /** @deprecated Use insurance_remaining_total — kept for older API responses. */
  insurance_payments_total?: string;
  /** @deprecated On print = patient_charge_total (clinic charge, not payments received). */
  patient_payments_total?: string;
  payments_card_cash_total?: string;
};

export function patientBillContentSignature(bill: PatientBillPayload): string {
  const lineSig = (bill.lines ?? [])
    .map((l) => `${l.cpt_code}:${l.units}:${l.fees}:${l.line_total}:${l.charges_patient ? 1 : 0}`)
    .join("|");
  return [
    bill.subtotal,
    bill.patient_subtotal ?? "",
    bill.tax,
    bill.total_amount,
    bill.diagnosis ?? "",
    bill.patient_payments_total ?? "",
    lineSig,
  ].join("#");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function trimTextForPrint(input: string, maxChars: number): string {
  const v = (input || "").trim();
  if (!v || v.length <= maxChars) return v;
  return `${v.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** US numeric date for Date range column, e.g. 8/14/2025 */
function formatSlashDate(isoDate: string): string {
  const d = parseApiDateOnly(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function dateRangeCell(dateOfService: string): string {
  const s = formatSlashDate(dateOfService);
  return `${s}-${s}`;
}

function moneyLabel(s: string | undefined): string {
  const v = (s ?? "").trim();
  if (!v) return "$0.00";
  return v.startsWith("$") ? esc(v) : `$${esc(v)}`;
}

type BillPrintFit = {
  profileName: string;
  pageMarginMm: number;
  bodyFontPx: number;
  titlePx: number;
  tealPx: number;
  uiFontPx: number;
  tableFontPx: number;
  lineHeight: number;
  boxPaddingY: number;
  boxPaddingX: number;
  cellPadY: number;
  cellPadX: number;
  bodyPadPx: string;
  topRowMb: number;
  clinicMb: number;
  metaMy: number;
  metaPMb: number;
  secTitleMy: number;
  tableMy: number;
  totalsMy: number;
  provMt: number;
  footMt: number;
  totalsPadY: number;
  basePrintZoom: number;
  maxDescriptionChars: number;
  maxDiagnosisChars: number;
  maxAddressChars: number;
};

/** Rough content score — higher means we tighten fonts, spacing, and print zoom. */
function billDensityScore(b: PatientBillPayload): number {
  const lineCount = b.lines.length;
  const totalDescriptionChars = b.lines.reduce((sum, line) => sum + (line.description || "").length, 0);
  const diagnosisLines = (b.diagnosis || "").split(/\n/).filter((s) => s.trim()).length;
  const hasProviderBlock =
    Boolean(b.provider_name?.trim()) ||
    Boolean(b.provider_npi || b.provider_billing_id || b.office_employer_id || b.employer_tax_id);
  return (
    lineCount * 1.65 +
    totalDescriptionChars / 150 +
    (b.diagnosis || "").length / 200 +
    diagnosisLines * 0.85 +
    (b.patient_address || "").length / 120 +
    (hasProviderBlock ? 1.2 : 0) +
    (b.is_preview ? 1.5 : 0)
  );
}

function fitProfileForBill(b: PatientBillPayload): BillPrintFit {
  const score = billDensityScore(b);

  if (score >= 22) {
    return {
      profileName: "Ultra compact (1 page)",
      pageMarginMm: 4,
      bodyFontPx: 7.6,
      titlePx: 17,
      tealPx: 9.5,
      uiFontPx: 7.6,
      tableFontPx: 7.2,
      lineHeight: 1.12,
      boxPaddingY: 5,
      boxPaddingX: 8,
      cellPadY: 2,
      cellPadX: 4,
      bodyPadPx: "4px 8px 6px",
      topRowMb: 6,
      clinicMb: 6,
      metaMy: 4,
      metaPMb: 2,
      secTitleMy: 4,
      tableMy: 4,
      totalsMy: 4,
      provMt: 6,
      footMt: 6,
      totalsPadY: 3,
      basePrintZoom: 0.72,
      maxDescriptionChars: 42,
      maxDiagnosisChars: 180,
      maxAddressChars: 95,
    };
  }
  if (score >= 16) {
    return {
      profileName: "Extra compact (1 page)",
      pageMarginMm: 5,
      bodyFontPx: 8.2,
      titlePx: 20,
      tealPx: 10.5,
      uiFontPx: 8.2,
      tableFontPx: 7.8,
      lineHeight: 1.18,
      boxPaddingY: 6,
      boxPaddingX: 9,
      cellPadY: 3,
      cellPadX: 5,
      bodyPadPx: "6px 10px 8px",
      topRowMb: 8,
      clinicMb: 8,
      metaMy: 6,
      metaPMb: 3,
      secTitleMy: 6,
      tableMy: 6,
      totalsMy: 6,
      provMt: 8,
      footMt: 8,
      totalsPadY: 4,
      basePrintZoom: 0.78,
      maxDescriptionChars: 54,
      maxDiagnosisChars: 260,
      maxAddressChars: 110,
    };
  }
  if (score >= 10) {
    return {
      profileName: "Compact (1 page)",
      pageMarginMm: 6,
      bodyFontPx: 8.8,
      titlePx: 22,
      tealPx: 11.5,
      uiFontPx: 8.8,
      tableFontPx: 8.2,
      lineHeight: 1.22,
      boxPaddingY: 8,
      boxPaddingX: 10,
      cellPadY: 4,
      cellPadX: 5,
      bodyPadPx: "8px 10px 10px",
      topRowMb: 10,
      clinicMb: 10,
      metaMy: 8,
      metaPMb: 4,
      secTitleMy: 8,
      tableMy: 8,
      totalsMy: 8,
      provMt: 10,
      footMt: 10,
      totalsPadY: 5,
      basePrintZoom: 0.84,
      maxDescriptionChars: 64,
      maxDiagnosisChars: 360,
      maxAddressChars: 130,
    };
  }
  return {
    profileName: "Standard",
    pageMarginMm: 7,
    bodyFontPx: 9.5,
    titlePx: 24,
    tealPx: 12.5,
    uiFontPx: 9.5,
    tableFontPx: 8.8,
    lineHeight: 1.28,
    boxPaddingY: 10,
    boxPaddingX: 12,
    cellPadY: 5,
    cellPadX: 7,
    bodyPadPx: "10px 12px 12px",
    topRowMb: 12,
    clinicMb: 12,
    metaMy: 10,
    metaPMb: 5,
    secTitleMy: 10,
    tableMy: 10,
    totalsMy: 10,
    provMt: 12,
    footMt: 12,
    totalsPadY: 5,
    basePrintZoom: 0.9,
    maxDescriptionChars: 80,
    maxDiagnosisChars: 480,
    maxAddressChars: 170,
  };
}

/** Extra shrink for print when many service lines or long diagnosis (targets one letter page). */
function printZoomForBill(b: PatientBillPayload, fit: BillPrintFit): number {
  const lineCount = b.lines.length;
  const diagnosisLines = (b.diagnosis || "").split(/\n/).filter((s) => s.trim()).length;
  const linePenalty = Math.max(0, lineCount - 3) * 0.022;
  const diagPenalty = Math.max(0, diagnosisLines - 1) * 0.014;
  const descPenalty =
    b.lines.reduce((sum, line) => sum + (line.description || "").length, 0) > 400 ? 0.03 : 0;
  return Math.max(0.62, fit.basePrintZoom - linePenalty - diagPenalty - descPenalty);
}

/** Full HTML document for the bill (no scripts). Safe for iframe srcDoc. */
export function getPatientBillDocumentHtml(b: PatientBillPayload): string {
  const fit = fitProfileForBill(b);
  const printZoom = printZoomForBill(b, fit);
  const diagnosisForPrint = trimTextForPrint(b.diagnosis || "", fit.maxDiagnosisChars);
  const patientAddressForPrint = trimTextForPrint(b.patient_address || "", fit.maxAddressChars);

  const teal = "#0f766e";
  const headerMuted = "#64748b";
  const theadBg = "#f1f5f9";

  const clinicStreetCity = [b.address_line1, b.city_state_zip].filter(Boolean).join(" ").trim();

  const billingDate =
    (b.billing_date_display || "").trim() || formatMonthDayYear(b.date_of_service);
  const stmtDate =
    (b.statement_date_display || "").trim() ||
    formatMonthDayYear(new Date().toISOString().slice(0, 10));

  const patientLine =
    b.patient_id != null
      ? `${esc(b.patient_name)} #${b.patient_id}`
      : esc(b.patient_name);

  /** Printed as Provider/Office Employer ID# (clinic settings). */
  const officeEmployerId = (b.office_employer_id || b.employer_tax_id || "").trim();
  /** Printed as NPI (per-doctor override, else clinic NPI). */
  const providerNpi = (b.provider_npi || b.provider_billing_id || "").trim();
  const discountAmt = parseFloat((b.discount || "0").replace(/,/g, "")) || 0;

  const rows = b.lines
    .map((l) => {
      const descriptionForPrint = trimTextForPrint(l.description || "", fit.maxDescriptionChars);
      return `
    <tr>
      <td>${esc(dateRangeCell(b.date_of_service))}</td>
      <td>${esc(l.cpt_code)}</td>
      <td>${esc(descriptionForPrint)}</td>
      <td class="num">${moneyLabel(l.fees)}</td>
      <td class="num">${esc(l.units)}</td>
      <td class="num">${esc(l.pos)}</td>
    </tr>`;
    })
    .join("");

  const providerCred = b.provider_credential ? `, ${esc(b.provider_credential)}` : "";
  const providerIdLines = `
    <p class="prov-line"><strong>Provider/Office Employer ID#:</strong> ${officeEmployerId ? esc(officeEmployerId) : "—"}</p>
    <p class="prov-line"><strong>NPI:</strong> ${providerNpi ? esc(providerNpi) : "—"}</p>`;
  const providerBlock =
    b.provider_name?.trim() !== ""
      ? `<section class="prov">
    <h2 class="sec-title">Provider</h2>
    <p class="prov-line"><strong>Provider:</strong> ${esc(b.provider_name!)}${providerCred}</p>
    <p class="prov-line"><strong>Office address:</strong> ${clinicStreetCity ? esc(clinicStreetCity) : "—"}</p>
    ${providerIdLines}
  </section>`
      : officeEmployerId || providerNpi || clinicStreetCity
        ? `<section class="prov">
    <h2 class="sec-title">Provider</h2>
    <p class="prov-line"><strong>Office address:</strong> ${clinicStreetCity ? esc(clinicStreetCity) : "—"}</p>
    ${providerIdLines}
  </section>`
        : "";

  const chargesTitle = esc(`Charges for Bill #${b.invoice_number}`);
  const totalsTitle = esc(`Bill #${b.invoice_number} Totals`);

  const billCharges = moneyLabel(b.bill_charges_total ?? b.subtotal);
  const patientCharge = moneyLabel(
    b.patient_charge_total ?? b.patient_payments_total ?? b.total_amount,
  );
  const insuranceRemaining = moneyLabel(
    b.insurance_remaining_total ?? b.insurance_payments_total ?? "0.00",
  );
  const paymentsReceived = moneyLabel(b.payments_received_total ?? "0.00");
  const adjustments = moneyLabel(b.discount ?? "0.00");
  const patientChargeNum = parseFloat(
    (b.patient_charge_total ?? b.patient_payments_total ?? b.total_amount ?? "0").replace(/,/g, ""),
  );
  const paymentsReceivedNum = parseFloat((b.payments_received_total ?? "0").replace(/,/g, ""));
  const remainingClientNum = Math.max(
    0,
    Number.isFinite(patientChargeNum) && Number.isFinite(paymentsReceivedNum)
      ? patientChargeNum - paymentsReceivedNum
      : parseFloat((b.remaining_client_responsibility_total ?? "0").replace(/,/g, "")) || 0,
  );
  const remainingClientResp = moneyLabel(
    b.remaining_client_responsibility_total ?? remainingClientNum.toFixed(2),
  );

  const footNote =
    printZoom < 0.8
      ? `(*) Tax per clinic settings. Patient Payments = clinic charge; Remaining balance = insurance-only lines; Client Responsibility = due after payments.${b.status ? ` Status: ${esc(b.status)}.` : ""} ${esc(formatNowMonthDayYearTime())}.`
      : `(*) Tax per clinic settings. Patient Payments = amount charged to the patient at the clinic. Remaining balance = insurance-only services. Remaining Client Responsibility = Patient Payments minus payments received (0 when paid in full).${b.status ? ` Invoice status: ${esc(b.status)}.` : ""} Generated ${esc(formatNowMonthDayYearTime())}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(b.bill_title || "Patient Bill")} — ${esc(b.invoice_number)}</title>
  <style>
    @page { margin: ${fit.pageMarginMm}mm; size: letter portrait; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      font-size: ${fit.bodyFontPx}px;
      margin: 0;
      padding: ${fit.bodyPadPx};
      line-height: ${fit.lineHeight};
    }
    .preview-banner {
      margin: 0 0 10px;
      padding: 6px 8px;
      background: #fffbeb;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      font-size: ${Math.max(7.5, fit.uiFontPx - 0.2)}px;
      color: #78350f;
      line-height: 1.2;
    }
    .preview-banner strong { display: block; font-size: ${Math.max(8, fit.uiFontPx)}px; margin-bottom: 2px; }
    .fit-chip {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid #f59e0b;
      background: #fff7ed;
      color: #9a3412;
      font-size: ${Math.max(7, fit.uiFontPx - 0.8)}px;
      font-weight: 600;
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: ${fit.topRowMb}px;
    }
    .doc-title {
      font-size: ${fit.titlePx}px;
      font-weight: 800;
      color: ${teal};
      letter-spacing: 0.02em;
      margin: 0;
      line-height: 1.05;
    }
    .stmt-date {
      font-size: ${fit.uiFontPx}px;
      color: #0f172a;
      white-space: nowrap;
      margin-top: 4px;
    }
    .clinic-dash {
      border: 2px dashed #cbd5e1;
      border-radius: 4px;
      text-align: center;
      padding: ${fit.boxPaddingY}px ${fit.boxPaddingX}px;
      margin: 0 auto ${fit.clinicMb}px;
      max-width: 420px;
      font-size: ${fit.uiFontPx}px;
      line-height: ${fit.lineHeight + 0.08};
    }
    .clinic-dash strong { font-size: ${Math.min(fit.uiFontPx + 1, fit.titlePx - 2)}px; color: #0f172a; }
    .meta-lines { margin: ${fit.metaMy}px 0 ${fit.metaMy + 2}px; font-size: ${fit.uiFontPx}px; }
    .meta-lines p { margin: ${fit.metaPMb}px 0; }
    .lbl { font-weight: 600; color: #0f172a; }
    .sec-title {
      font-size: ${fit.tealPx}px;
      font-weight: 700;
      color: ${teal};
      margin: ${fit.secTitleMy}px 0 ${Math.max(3, fit.secTitleMy - 2)}px;
      letter-spacing: 0.01em;
      line-height: 1.15;
    }
    .diag-body {
      white-space: pre-wrap;
      margin: 0 0 ${Math.max(2, fit.secTitleMy - 2)}px;
      font-size: ${fit.uiFontPx}px;
      color: #0f172a;
      line-height: ${fit.lineHeight};
    }
    table.charges {
      width: 100%;
      border-collapse: collapse;
      margin: ${fit.tableMy}px 0 ${fit.tableMy + 4}px;
      font-size: ${fit.tableFontPx}px;
    }
    table.charges thead th {
      background: ${theadBg};
      color: ${teal};
      font-weight: 700;
      text-align: left;
      padding: ${fit.cellPadY}px ${fit.cellPadX}px;
      border-bottom: 2px solid #e2e8f0;
    }
    table.charges tbody td {
      padding: ${fit.cellPadY}px ${fit.cellPadX}px;
      vertical-align: top;
      border-bottom: 1px solid #f1f5f9;
    }
    table.charges tbody tr:last-child td { border-bottom: none; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.totals {
      width: 100%;
      max-width: 380px;
      margin: ${fit.totalsMy}px 0 ${fit.totalsMy + 4}px auto;
      border-collapse: collapse;
      font-size: ${fit.uiFontPx}px;
    }
    table.totals thead th {
      background: ${theadBg};
      color: ${teal};
      font-weight: 700;
      padding: ${fit.totalsPadY}px 8px;
      border-bottom: 2px solid #e2e8f0;
    }
    table.totals thead th.amt { text-align: right; }
    table.totals td {
      padding: ${fit.totalsPadY}px 8px;
      border-bottom: 1px solid #f1f5f9;
    }
    table.totals td.lab { color: ${teal}; font-weight: 600; }
    table.totals td.amt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    table.totals tr.balance td {
      border-bottom: none;
      padding-top: ${Math.max(4, fit.totalsPadY + 2)}px;
      font-size: ${Math.max(fit.uiFontPx, 9)}px;
    }
    .prov { margin-top: ${fit.provMt}px; font-size: ${fit.uiFontPx}px; }
    .prov-line { margin: ${Math.max(2, fit.metaPMb)}px 0; }
    .foot {
      margin-top: ${fit.footMt}px;
      padding-top: ${Math.max(4, fit.totalsPadY)}px;
      border-top: 1px solid #e2e8f0;
      font-size: ${Math.max(7, fit.uiFontPx - 0.8)}px;
      color: ${headerMuted};
      line-height: 1.2;
    }
    @media print {
      .preview-banner { display: none !important; }
      body {
        zoom: ${printZoom};
        padding: ${fit.bodyPadPx};
      }
      .top-row, .clinic-dash, .meta-lines, .sec-title, table.charges, table.totals, .prov, .foot {
        page-break-inside: avoid;
      }
      table.charges tr { page-break-inside: avoid; }
    }
    @media screen {
      .print-fit-hint {
        margin: 0 0 8px;
        font-size: ${Math.max(7, fit.uiFontPx - 0.6)}px;
        color: ${headerMuted};
      }
    }
    @media print {
      .print-fit-hint { display: none !important; }
    }
  </style>
</head>
<body>
  ${
    b.is_preview
      ? `<div class="preview-banner"><strong>Preview only</strong>This is how the bill will look before payment is recorded. After the invoice is paid, open &ldquo;Print patient bill&rdquo; for the official copy.<span class="fit-chip">Auto-fit: ${esc(fit.profileName)} · ${Math.round(printZoom * 100)}%</span></div>`
      : ""
  }
  <p class="print-fit-hint" aria-hidden="true">
    Print layout: ${esc(fit.profileName)} · scale ${Math.round(printZoom * 100)}% (auto-adjusts to help fit one page)
  </p>
  <header class="top-row">
    <h1 class="doc-title">PATIENT BILL</h1>
    <div class="stmt-date">${esc(stmtDate)}</div>
  </header>

  <div class="clinic-dash">
    <strong>${esc(b.clinic_name)}</strong><br/>
    ${esc(clinicStreetCity)}<br/>
    ${esc(b.phone)}
  </div>

  <div class="meta-lines">
    <p><span class="lbl">Billing Date:</span> ${esc(billingDate)}</p>
    <p><span class="lbl">Provider/Office Employer ID#:</span> ${officeEmployerId ? esc(officeEmployerId) : "—"}</p>
    <p><span class="lbl">NPI:</span> ${providerNpi ? esc(providerNpi) : "—"}</p>
    <p><span class="lbl">Patient:</span> ${patientLine}</p>
    <p><span class="lbl">Address:</span> ${esc(patientAddressForPrint)}</p>
  </div>

  <h2 class="sec-title">Diagnosis</h2>
  <div class="diag-body">${esc(diagnosisForPrint)}</div>

  <h2 class="sec-title">${chargesTitle}</h2>
  <table class="charges">
    <thead>
      <tr>
        <th>Date Range</th>
        <th>CPT Code</th>
        <th>Description</th>
        <th class="num">Fees</th>
        <th class="num">Units</th>
        <th class="num">POS</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <h2 class="sec-title">${totalsTitle}</h2>
  <table class="totals">
    <thead>
      <tr>
        <th scope="col"></th>
        <th scope="col" class="amt">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="lab">Bill Charges (total documented)</td>
        <td class="amt">${billCharges}</td>
      </tr>
      <tr>
        <td class="lab">Sales Tax (*)</td>
        <td class="amt">${moneyLabel(b.tax)}</td>
      </tr>
      <tr>
        <td class="lab">Patient Payments</td>
        <td class="amt">${patientCharge}</td>
      </tr>
      <tr>
        <td class="lab">Adjustments${discountAmt > 0 ? " (discount)" : ""}</td>
        <td class="amt">${adjustments}</td>
      </tr>
      <tr class="balance">
        <td class="lab">Remaining balance</td>
        <td class="amt">${insuranceRemaining}</td>
      </tr>
      <tr>
        <td class="lab">Payments received</td>
        <td class="amt">${paymentsReceived}</td>
      </tr>
      <tr class="balance">
        <td class="lab">Remaining Client Responsibility</td>
        <td class="amt">${remainingClientResp}</td>
      </tr>
    </tbody>
  </table>

  ${providerBlock}

  <p class="foot">${footNote}</p>
</body>
</html>`;
}

/**
 * Opens a new browser window with the bill (popup blockers may block this). Prefer {@link PatientBillPortalModal} in the app UI.
 */
export function openPatientBillPrint(b: PatientBillPayload) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return false;

  const html = getPatientBillDocumentHtml(b);

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
