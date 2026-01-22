"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface CommissionRuleFormData {
  rule_scope: string;
  client_or_resource: string;
  salesperson: string;
  category: string;
  rate: string;
  start_date: string;
  end_date: string;
  note: string;
  is_active: boolean;
}

interface CommissionRuleFormProps {
  initialData?: CommissionRuleFormData;
  ruleId?: number;
  mode: "create" | "edit";
}

const RULE_SCOPES = [
  { value: "client", label: "Client" },
  { value: "resource", label: "Resource" },
];

const CATEGORIES = [
  { value: "Client Commission", label: "Client Commission" },
  { value: "Referral Commission", label: "Referral Commission" },
  { value: "Delivery Commission", label: "Delivery Commission" },
];


export function CommissionRuleForm({
  initialData,
  ruleId,
  mode,
}: CommissionRuleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CommissionRuleFormData>(
    initialData || {
      rule_scope: "client",
      client_or_resource: "",
      salesperson: "",
      category: "Client Commission",
      rate: "",
      start_date: "",
      end_date: "",
      note: "",
      is_active: true,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert rate from percentage to decimal
      const rateValue = formData.rate ? parseFloat(formData.rate) / 100 : 0;

      const payload = {
        rule_scope: formData.rule_scope,
        client_or_resource: formData.client_or_resource,
        salesperson: formData.salesperson,
        category: formData.category,
        rate: rateValue,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        note: formData.note || null,
        is_active: formData.is_active,
      };

      const url =
        mode === "create"
          ? "/api/commission-rules"
          : `/api/commission-rules/${ruleId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save commission rule");
      }

      toast.success(
        mode === "create"
          ? "Commission rule created successfully"
          : "Commission rule updated successfully"
      );
      router.push("/settings/rules");
    } catch (error) {
      console.error("Error saving commission rule:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save commission rule"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    field: keyof CommissionRuleFormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Rule Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rule_scope">Scope *</Label>
            <Select
              value={formData.rule_scope}
              onValueChange={(value) => handleChange("rule_scope", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {RULE_SCOPES.map((scope) => (
                  <SelectItem key={scope.value} value={scope.value}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => handleChange("category", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_or_resource">
              {formData.rule_scope === "client" ? "Client Name" : "Resource Name"} *
            </Label>
            <Input
              id="client_or_resource"
              value={formData.client_or_resource}
              onChange={(e) =>
                handleChange("client_or_resource", e.target.value)
              }
              placeholder={
                formData.rule_scope === "client"
                  ? "e.g., Acme Corporation"
                  : "e.g., John Smith"
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salesperson">Salesperson *</Label>
            <Input
              id="salesperson"
              value={formData.salesperson}
              onChange={(e) => handleChange("salesperson", e.target.value)}
              placeholder="e.g., David Woods, Bryan Hayden, or referral partner"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate">Commission Rate (%) *</Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.rate}
              onChange={(e) => handleChange("rate", e.target.value)}
              placeholder="e.g., 6.00"
              required
            />
            <p className="text-xs text-gray-500">
              Enter as percentage (e.g., 6 for 6%, 12 for 12%)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="is_active">Status</Label>
            <Select
              value={formData.is_active ? "true" : "false"}
              onValueChange={(value) =>
                handleChange("is_active", value === "true")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange("start_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">End Date</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => handleChange("end_date", e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Leave empty for ongoing rules
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            id="note"
            value={formData.note}
            onChange={(e) => handleChange("note", e.target.value)}
            className="w-full rounded-md border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
            placeholder="e.g., Year 1 commission (12%), $175-$250/hr"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/rules")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Rule"
            : "Update Rule"}
        </Button>
      </div>
    </form>
  );
}
