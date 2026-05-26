"use client";

import { useParams } from "next/navigation";
import { PatientHistoryPage } from "@/components/patient-history-page";

export default function AdminPatientHistoryRoute() {
  const params = useParams<{ patientId: string }>();
  const id = Number(params.patientId);
  if (!Number.isFinite(id) || id <= 0) {
    return <div className="p-6 text-sm text-rose-700">Invalid patient id.</div>;
  }

  return (
    <PatientHistoryPage
      patientId={id}
      detailPath="/admin/patient_detail"
      handoffSavePath="/admin/appointment_handoff/"
      backHref="/admin/patients"
      scheduleHrefPrefix="/admin/schedule"
      invoiceBillPath="/admin/invoice_bill"
    />
  );
}
