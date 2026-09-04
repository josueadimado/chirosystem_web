"use client";

import { StaffMergePatients } from "@/components/staff-merge-patients";

export default function DoctorMergePatientsPage() {
  return <StaffMergePatients apiBase="/doctor" backHref="/doctor/patients" variant="doctor" />;
}
