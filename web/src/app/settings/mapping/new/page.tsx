"use client";

import { AppLayout } from "@/components/app-layout";
import { MappingForm } from "@/components/mapping-form";

export default function NewMappingPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Mapping</h1>
          <p className="text-gray-500">Create a new client name mapping</p>
        </div>

        <MappingForm mode="create" />
      </div>
    </AppLayout>
  );
}
