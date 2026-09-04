"use client";

import { StaffMergePatients } from "@/components/staff-merge-patients";

export default function AdminMergePatientsPage() {
  return <StaffMergePatients apiBase="/admin" backHref="/admin/patients" variant="admin" />;
}
