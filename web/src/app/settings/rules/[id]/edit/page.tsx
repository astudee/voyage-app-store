"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { CommissionRuleForm } from "@/components/commission-rules-form";
import { toast } from "sonner";

interface CommissionRule {
  RULE_ID: number;
  RULE_SCOPE: string;
  CLIENT_OR_RESOURCE: string;
  SALESPERSON: string;
  CATEGORY: string;
  RATE: number;
  START_DATE: string | null;
  END_DATE: string | null;
  NOTE: string | null;
  IS_ACTIVE: boolean;
}

export default function EditCommissionRulePage() {
  const params = useParams();
  const id = params.id as string;

  const [rule, setRule] = useState<CommissionRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRule = async () => {
      try {
        const response = await fetch(`/api/commission-rules/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Commission rule not found");
          } else {
            throw new Error("Failed to fetch commission rule");
          }
          return;
        }
        const data = await response.json();
        setRule(data);
      } catch (error) {
        console.error("Error fetching commission rule:", error);
        toast.error("Failed to load commission rule");
        setError("Failed to load commission rule");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchRule();
    }
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  if (error || !rule) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-red-500">
          {error || "Commission rule not found"}
        </div>
      </AppLayout>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  const initialData = {
    rule_scope: rule.RULE_SCOPE,
    client_or_resource: rule.CLIENT_OR_RESOURCE,
    salesperson: rule.SALESPERSON,
    category: rule.CATEGORY,
    rate: (rule.RATE * 100).toString(), // Convert decimal to percentage
    start_date: formatDate(rule.START_DATE),
    end_date: formatDate(rule.END_DATE),
    note: rule.NOTE || "",
    is_active: rule.IS_ACTIVE,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Commission Rule</h1>
          <p className="text-gray-500">
            Update rule for {rule.CLIENT_OR_RESOURCE}
          </p>
        </div>

        <CommissionRuleForm
          mode="edit"
          ruleId={rule.RULE_ID}
          initialData={initialData}
        />
      </div>
    </AppLayout>
  );
}
