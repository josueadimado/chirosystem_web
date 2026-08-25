/**
 * CMS-1500 insurance claim — printable HTML document.
 */

export type Cms1500ServiceLine = {
  date_from: string;
  date_to: string;
  place_of_service: string;
  cpt: string;
  modifiers: string[];
  diagnosis_pointer: string;
  charges_dollars: string;
  charges_cents: string;
  units: string;
  rendering_npi: string;
  description?: string;
};

export type Cms1500ClaimPayload = {
  form_title: string;
  invoice_id: number;
  invoice_number: string;
  patient_id: number;
  plan_checks: Record<string, boolean>;
  insured_id: string;
  payer_name: string;
  payer_email?: string;
  patient_name: string;
  patient_dob: string;
  patient_sex: string;
  patient_address: string;
  patient_city: string;
  patient_state: string;
  patient_zip: string;
  patient_phone_area: string;
  patient_phone: string;
  relationship: string;
  insured_name: string;
  insured_group_number: string;
  patient_signature: string;
  insured_signature: string;
  date_of_current_illness: string;
  referring_provider: string;
  referring_npi: string;
  diagnosis_codes: string[];
  service_lines: Cms1500ServiceLine[];
  federal_tax_id: string;
  tax_id_is_ein: boolean;
  patient_account_no: string;
  accept_assignment: boolean;
  total_charge_dollars: string;
  total_charge_cents: string;
  physician_signature: string;
  physician_signature_date: string;
  service_facility_name: string;
  service_facility_address: string;
  service_facility_city_state_zip: string;
  service_facility_npi: string;
  billing_provider_name: string;
  billing_provider_address: string;
  billing_provider_city_state_zip: string;
  billing_provider_phone_area: string;
  billing_provider_phone: string;
  billing_provider_npi: string;
  warnings?: string[];
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function check(on: boolean): string {
  return on ? "☑" : "☐";
}

export function cms1500ContentSignature(c: Cms1500ClaimPayload): string {
  return [
    c.invoice_id,
    c.insured_id,
    c.total_charge_dollars,
    c.total_charge_cents,
    (c.service_lines || []).map((l) => `${l.cpt}:${l.charges_dollars}`).join("|"),
    (c.diagnosis_codes || []).join(","),
  ].join("::");
}

export function getCms1500DocumentHtml(c: Cms1500ClaimPayload): string {
  const plans = c.plan_checks || {};
  const dx = c.diagnosis_codes || [];
  const dxCells = Array.from({ length: 12 }, (_, i) => {
    const letter = String.fromCharCode(65 + i);
    return `<div class="dx"><span class="dx-l">${letter}</span> ${esc(dx[i] || "")}</div>`;
  }).join("");

  const lineRows = (c.service_lines || [])
    .slice(0, 6)
    .map((line, idx) => {
      const mods = (line.modifiers || []).concat(["", "", "", ""]).slice(0, 4);
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(line.date_from)}</td>
        <td>${esc(line.date_to)}</td>
        <td class="c">${esc(line.place_of_service)}</td>
        <td>${esc(line.cpt)}</td>
        <td class="c">${esc(mods[0])}</td>
        <td class="c">${esc(mods[1])}</td>
        <td class="c">${esc(mods[2])}</td>
        <td class="c">${esc(mods[3])}</td>
        <td class="c">${esc(line.diagnosis_pointer)}</td>
        <td class="r">${esc(line.charges_dollars)} ${esc(line.charges_cents)}</td>
        <td class="c">${esc(line.units)}</td>
        <td>${esc(line.rendering_npi)}</td>
      </tr>`;
    })
    .join("");

  const warnings =
    (c.warnings || []).length > 0
      ? `<div class="warn"><strong>Before filing:</strong><ul>${(c.warnings || [])
          .map((w) => `<li>${esc(w)}</li>`)
          .join("")}</ul></div>`
      : "";

  const rel = (c.relationship || "self").toLowerCase();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>CMS-1500 — ${esc(c.patient_name)}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    color: #111;
    margin: 0;
    padding: 18px 20px 22px;
    background: #fff;
    line-height: 1.35;
  }
  h1 {
    font-family: Arial, sans-serif;
    font-size: 16px;
    margin: 0 0 6px;
    color: #0d5c2e;
    letter-spacing: 0.01em;
  }
  .meta {
    font-family: Arial, sans-serif;
    font-size: 11px;
    color: #475569;
    margin: 0 0 14px;
    line-height: 1.4;
  }
  .box {
    border: 1px solid #94a3b8;
    padding: 10px 12px 12px;
    margin: 0 0 10px;
    min-width: 0;
  }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 0 0 10px;
  }
  .row > .box {
    flex: 1 1 140px;
    margin-bottom: 0;
  }
  .grow { flex: 1 1 140px; }
  .label {
    font-family: Arial, sans-serif;
    font-size: 9px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.3;
    margin: 0 0 6px;
  }
  .val {
    font-size: 12px;
    font-weight: 700;
    margin: 0;
    min-height: 16px;
    line-height: 1.4;
    word-break: break-word;
  }
  .val + .val { margin-top: 4px; }
  .plans {
    font-family: Arial, sans-serif;
    font-size: 11px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    padding-top: 2px;
    line-height: 1.45;
  }
  .dx-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 8px;
  }
  .dx {
    border: 1px solid #cbd5e1;
    padding: 8px 10px;
    min-height: 32px;
    line-height: 1.35;
  }
  .dx-l {
    color: #64748b;
    font-family: Arial, sans-serif;
    font-size: 9px;
    margin-right: 6px;
  }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  table.lines th,
  table.lines td {
    border: 1px solid #94a3b8;
    padding: 8px 8px;
    font-size: 10px;
    line-height: 1.35;
    vertical-align: middle;
  }
  table.lines th {
    font-family: Arial, sans-serif;
    font-size: 8px;
    background: #f1f5f9;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 8px 6px;
  }
  .c { text-align: center; }
  .r { text-align: right; }
  .warn {
    font-family: Arial, sans-serif;
    background: #fff7ed;
    border: 1px solid #fdba74;
    color: #9a3412;
    padding: 12px 14px;
    margin: 0 0 14px;
    font-size: 11px;
    line-height: 1.45;
    border-radius: 4px;
  }
  .warn ul { margin: 8px 0 0 18px; padding: 0; }
  .warn li { margin: 4px 0; }
  @media print {
    body { padding: 0; }
    .warn { break-inside: avoid; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <h1>Health Insurance Claim Form (CMS-1500)</h1>
  <div class="meta">Invoice ${esc(c.invoice_number)} · Account ${esc(c.patient_account_no)} · Payer ${esc(c.payer_name || "—")}</div>
  ${warnings}

  <div class="box">
    <div class="label">1. Insurance type</div>
    <div class="plans">
      <span>${check(!!plans.medicare)} Medicare</span>
      <span>${check(!!plans.medicaid)} Medicaid</span>
      <span>${check(!!plans.tricare)} TRICARE</span>
      <span>${check(!!plans.champva)} CHAMPVA</span>
      <span>${check(!!plans.group)} Group health plan</span>
      <span>${check(!!plans.feca)} FECA</span>
      <span>${check(!!plans.other)} Other</span>
    </div>
  </div>

  <div class="row">
    <div class="box grow"><div class="label">1a. Insured's ID</div><div class="val">${esc(c.insured_id)}</div></div>
    <div class="box grow"><div class="label">4. Insured's name</div><div class="val">${esc(c.insured_name)}</div></div>
    <div class="box grow"><div class="label">11. Group number</div><div class="val">${esc(c.insured_group_number)}</div></div>
  </div>

  <div class="row">
    <div class="box grow"><div class="label">2. Patient's name</div><div class="val">${esc(c.patient_name)}</div></div>
    <div class="box grow"><div class="label">3. Birth date / sex</div><div class="val">${esc(c.patient_dob)} &nbsp; ${esc(c.patient_sex || "—")}</div></div>
    <div class="box grow"><div class="label">6. Relationship</div><div class="val">
      ${check(rel === "self")} Self
      ${check(rel === "spouse")} Spouse
      ${check(rel === "child")} Child
      ${check(rel === "other")} Other
    </div></div>
  </div>

  <div class="row">
    <div class="box grow"><div class="label">5. Patient address</div><div class="val">${esc(c.patient_address)}</div>
      <div class="val">${esc(c.patient_city)} ${esc(c.patient_state)} ${esc(c.patient_zip)}</div>
      <div class="val">(${esc(c.patient_phone_area)}) ${esc(c.patient_phone)}</div>
    </div>
    <div class="box grow"><div class="label">12 / 13. Signatures</div>
      <div class="val">Patient: ${esc(c.patient_signature)}</div>
      <div class="val">Insured: ${esc(c.insured_signature)}</div>
    </div>
  </div>

  <div class="row">
    <div class="box grow"><div class="label">14. Date of current illness</div><div class="val">${esc(c.date_of_current_illness)}</div></div>
    <div class="box grow"><div class="label">17. Referring / rendering provider</div><div class="val">${esc(c.referring_provider)}</div></div>
    <div class="box grow"><div class="label">17b. NPI</div><div class="val">${esc(c.referring_npi)}</div></div>
  </div>

  <div class="box">
    <div class="label">21. Diagnosis codes (ICD)</div>
    <div class="dx-grid">${dxCells}</div>
  </div>

  <div class="box">
    <div class="label">24. Service lines</div>
    <table class="lines">
      <thead>
        <tr>
          <th>#</th><th>From</th><th>To</th><th>POS</th><th>CPT</th>
          <th>M1</th><th>M2</th><th>M3</th><th>M4</th>
          <th>Dx</th><th>Charges</th><th>Units</th><th>NPI</th>
        </tr>
      </thead>
      <tbody>${lineRows || '<tr><td colspan="13">No service lines</td></tr>'}</tbody>
    </table>
  </div>

  <div class="row">
    <div class="box grow"><div class="label">25. Federal tax ID</div><div class="val">${esc(c.federal_tax_id)} ${c.tax_id_is_ein ? "(EIN)" : ""}</div></div>
    <div class="box grow"><div class="label">26. Patient account #</div><div class="val">${esc(c.patient_account_no)}</div></div>
    <div class="box grow"><div class="label">27. Accept assignment</div><div class="val">${c.accept_assignment ? "YES" : "NO"}</div></div>
    <div class="box grow"><div class="label">28. Total charge</div><div class="val">$${esc(c.total_charge_dollars)}.${esc(c.total_charge_cents)}</div></div>
  </div>

  <div class="row">
    <div class="box grow">
      <div class="label">31. Physician / supplier signature</div>
      <div class="val">${esc(c.physician_signature)}</div>
      <div class="val">Date: ${esc(c.physician_signature_date)}</div>
    </div>
    <div class="box grow">
      <div class="label">32. Service facility</div>
      <div class="val">${esc(c.service_facility_name)}</div>
      <div class="val">${esc(c.service_facility_address)}</div>
      <div class="val">${esc(c.service_facility_city_state_zip)}</div>
      <div class="val">NPI ${esc(c.service_facility_npi)}</div>
    </div>
    <div class="box grow">
      <div class="label">33. Billing provider</div>
      <div class="val">${esc(c.billing_provider_name)}</div>
      <div class="val">${esc(c.billing_provider_address)}</div>
      <div class="val">${esc(c.billing_provider_city_state_zip)}</div>
      <div class="val">(${esc(c.billing_provider_phone_area)}) ${esc(c.billing_provider_phone)}</div>
      <div class="val">NPI ${esc(c.billing_provider_npi)}</div>
    </div>
  </div>
</body>
</html>`;
}
