"use client";

import { AppLayout } from "@/components/app-layout";
import { CommissionRuleForm } from "@/components/commission-rules-form";

export default function NewCommissionRulePage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Commission Rule</h1>
          <p className="text-gray-500">Create a new commission rule</p>
        </div>

        <CommissionRuleForm mode="create" />
      </div>
    </AppLayout>
  );
}
