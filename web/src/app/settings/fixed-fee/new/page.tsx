"use client";

import { AppLayout } from "@/components/app-layout";
import { FixedFeeForm } from "@/components/fixed-fee-form";

export default function NewFixedFeePage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Revenue Entry</h1>
          <p className="text-gray-500">
            Create a new monthly revenue entry for a fixed-fee project
          </p>
        </div>

        <FixedFeeForm mode="create" />
      </div>
    </AppLayout>
  );
}
