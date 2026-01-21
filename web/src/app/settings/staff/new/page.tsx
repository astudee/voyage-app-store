"use client";

import { AppLayout } from "@/components/app-layout";
import { StaffForm } from "@/components/staff-form";

export default function NewStaffPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Staff Member</h1>
          <p className="text-gray-500">Create a new staff member record</p>
        </div>

        <StaffForm mode="create" />
      </div>
    </AppLayout>
  );
}
