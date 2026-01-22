"use client";

import { AppLayout } from "@/components/app-layout";
import { OffsetForm } from "@/components/offsets-form";

export default function NewOffsetPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Offset</h1>
          <p className="text-gray-500">Create a new commission offset</p>
        </div>

        <OffsetForm mode="create" />
      </div>
    </AppLayout>
  );
}
