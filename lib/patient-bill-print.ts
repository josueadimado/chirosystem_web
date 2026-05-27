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
  /** Clinic-wide or per-doctor billing provider ID (e.g. NPI) — shown on every bill. */
  provider_billing_id?: string;
  /** Printed next to provider block when set in Admin → Settings. */
  employer_tax_id?: string;
  email?: string;
  pos_default?: string;
  invoice_number: string;
  patient_id?: number;
  date_of_service: string;
  /** Display billing date on statement (from server). */
  billing_date_display?: string;
  /** “Statement” date top-right (from server, usually today). */
  statement_date_display?: string;
  patient_name: string;
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

function fitProfileForBill(b: PatientBillPayload) {
  const lineCount = b.lines.length;
  const totalDescriptionChars = b.lines.reduce((sum, line) => sum + (line.description || "").length, 0);
  const densityScore =
    lineCount * 1.4 +
    totalDescriptionChars / 180 +
    (b.diagnosis || "").length / 220 +
    (b.patient_address || "").length / 140 +
    (b.is_preview ? 2 : 0);

  if (densityScore >= 26) {
    return {
      profileName: "Extra compact",
      pageMarginMm: 5,
      bodyFontPx: 8.6,
      titlePx: 22,
      tealPx: 11,
      uiFontPx: 8.6,
      tableFontPx: 8,
      boxPaddingY: 8,
      boxPaddingX: 10,
      cellPadY: 4,
      cellPadX: 5,
      printZoom: 0.84,
      maxDescriptionChars: 52,
      maxDiagnosisChars: 220,
      maxAddressChars: 110,
    };
  }
  if (densityScore >= 20) {
    return {
      profileName: "Compact",
      pageMarginMm: 6,
      bodyFontPx: 9.2,
      titlePx: 24,
      tealPx: 12,
      uiFontPx: 9.2,
      tableFontPx: 8.6,
      boxPaddingY: 10,
      boxPaddingX: 12,
      cellPadY: 5,
      cellPadX: 6,
      printZoom: 0.88,
      maxDescriptionChars: 68,
      maxDiagnosisChars: 320,
      maxAddressChars: 140,
    };
  }
  return {
    profileName: "Standard",
    pageMarginMm: 7,
    bodyFontPx: 10,
    titlePx: 26,
    tealPx: 13,
    uiFontPx: 10,
    tableFontPx: 9.2,
    boxPaddingY: 12,
    boxPaddingX: 14,
    cellPadY: 6,
    cellPadX: 8,
    printZoom: 0.92,
    maxDescriptionChars: 88,
    maxDiagnosisChars: 520,
    maxAddressChars: 180,
  };
}

/** Full HTML document for the bill (no scripts). Safe for iframe srcDoc. */
export function getPatientBillDocumentHtml(b: PatientBillPayload): string {
  const fit = fitProfileForBill(b);
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

  /** Printed as Provider/Office Employer ID# (clinic or per-doctor provider billing id). */
  const providerOfficeEmployerId = (b.provider_billing_id || b.employer_tax_id || "").trim();
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
  const providerBlock =
    b.provider_name?.trim() !== ""
      ? `<section class="prov">
    <h2 class="sec-title">Provider</h2>
    <p class="prov-line"><strong>Provider:</strong> ${esc(b.provider_name!)}${providerCred} — ${esc(clinicStreetCity)}</p>
    <p class="prov-line"><strong>Provider/Office Employer ID#:</strong> ${providerOfficeEmployerId ? esc(providerOfficeEmployerId) : "—"}</p>
  </section>`
      : providerOfficeEmployerId
        ? `<section class="prov">
    <h2 class="sec-title">Provider</h2>
    <p class="prov-line"><strong>Provider/Office Employer ID#:</strong> ${esc(providerOfficeEmployerId)}</p>
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
  const showPaymentsReceived =
    parseFloat((b.payments_received_total ?? "0").replace(/,/g, "")) > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(b.bill_title || "Patient Bill")} — ${esc(b.invoice_number)}</title>
  <style>
    @page { margin: ${fit.pageMarginMm}mm; size: letter; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      font-size: ${fit.bodyFontPx}px;
      margin: 0;
      padding: 10px 12px 14px;
      line-height: 1.35;
    }
    .preview-banner {
      margin: 0 0 12px;
      padding: 8px 10px;
      background: #fffbeb;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      font-size: ${Math.max(8, fit.uiFontPx - 0.2)}px;
      color: #78350f;
      line-height: 1.25;
    }
    .preview-banner strong { display: block; font-size: ${Math.max(9, fit.uiFontPx)}px; margin-bottom: 3px; }
    .fit-chip {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid #f59e0b;
      background: #fff7ed;
      color: #9a3412;
      font-size: ${Math.max(8, fit.uiFontPx - 0.8)}px;
      font-weight: 600;
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
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
      margin: 0 auto 14px;
      max-width: 420px;
      font-size: ${fit.uiFontPx}px;
      line-height: 1.45;
    }
    .clinic-dash strong { font-size: ${Math.min(fit.uiFontPx + 1.2, fit.titlePx - 2)}px; color: #0f172a; }
    .meta-lines { margin: 12px 0 14px; font-size: ${fit.uiFontPx}px; }
    .meta-lines p { margin: 5px 0; }
    .lbl { font-weight: 600; color: #0f172a; }
    .sec-title {
      font-size: ${fit.tealPx}px;
      font-weight: 700;
      color: ${teal};
      margin: 16px 0 8px;
      letter-spacing: 0.01em;
    }
    .diag-body {
      white-space: pre-wrap;
      margin: 0 0 6px;
      font-size: ${fit.uiFontPx}px;
      color: #0f172a;
    }
    table.charges {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 18px;
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
      margin: 10px 0 18px auto;
      border-collapse: collapse;
      font-size: ${fit.uiFontPx}px;
    }
    table.totals thead th {
      background: ${theadBg};
      color: ${teal};
      font-weight: 700;
      padding: 6px 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    table.totals thead th.amt { text-align: right; }
    table.totals td {
      padding: 6px 10px;
      border-bottom: 1px solid #f1f5f9;
    }
    table.totals td.lab { color: ${teal}; font-weight: 600; }
    table.totals td.amt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    table.totals tr.balance td { border-bottom: none; padding-top: 10px; font-size: ${Math.max(fit.uiFontPx + 0.5, 11)}px; }
    .prov { margin-top: 16px; font-size: ${fit.uiFontPx}px; }
    .prov-line { margin: 6px 0; }
    .foot {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: ${Math.max(8, fit.uiFontPx - 0.6)}px;
      color: ${headerMuted};
      line-height: 1.35;
    }
    @media print { body { zoom: ${fit.printZoom}; } }
  </style>
</head>
<body>
  ${
    b.is_preview
      ? `<div class="preview-banner"><strong>Preview only</strong>This is how the bill will look before payment is recorded. After the invoice is paid, open &ldquo;Print patient bill&rdquo; for the official copy.<span class="fit-chip">Auto-fit: ${esc(fit.profileName)}</span></div>`
      : ""
  }
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
    <p><span class="lbl">Provider/Office Employer ID#:</span> ${providerOfficeEmployerId ? esc(providerOfficeEmployerId) : "—"}</p>
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
      ${
        showPaymentsReceived
          ? `<tr>
        <td class="lab">Payments received</td>
        <td class="amt">${paymentsReceived}</td>
      </tr>`
          : ""
      }
    </tbody>
  </table>

  ${providerBlock}

  <p class="foot">
    (*) Tax per clinic settings. Patient Payments = amount charged to the patient at the clinic. Remaining balance = insurance-only services on this bill (not charged to the patient).
    ${b.status ? ` Invoice status: ${esc(b.status)}.` : ""}
    Generated ${esc(formatNowMonthDayYearTime())}.
  </p>
</body>
</html>`;
}

/**
 * Opens a new browser window with the bill (popup blockers may block this). Prefer {@link PatientBillPortalModal} in the app UI.
 */
export function openPatientBillPrint(b: PatientBillPayload) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return false;

  let html = getPatientBillDocumentHtml(b);
  if (!b.is_preview) {
    html = html.replace("</body>", `<script>window.onload=function(){window.print();};</script></body>`);
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
