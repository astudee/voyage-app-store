"use client";

import { AppLayout } from "@/components/app-layout";
import { BenefitForm } from "@/components/benefits-form";

export default function NewBenefitPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add New Benefit</h1>
          <p className="text-gray-500">Create a new benefit plan</p>
        </div>

        <BenefitForm mode="create" />
      </div>
    </AppLayout>
  );
}
