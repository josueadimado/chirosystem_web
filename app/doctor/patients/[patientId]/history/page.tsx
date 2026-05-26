"use client";

import { useParams } from "next/navigation";
import { PatientHistoryPage } from "@/components/patient-history-page";

export default function DoctorPatientHistoryRoute() {
  const params = useParams<{ patientId: string }>();
  const id = Number(params.patientId);
  if (!Number.isFinite(id) || id <= 0) {
    return <div className="p-6 text-sm text-rose-700">Invalid patient id.</div>;
  }

  return (
    <PatientHistoryPage
      patientId={id}
      detailPath="/doctor/patient_detail"
      handoffSavePath="/doctor/appointment_handoff/"
      backHref="/doctor/patients"
      chartHref={`/doctor/patients/${id}/record`}
      scheduleHrefPrefix="/doctor/schedule"
      invoiceBillPath="/doctor/invoice_bill"
    />
  );
}
