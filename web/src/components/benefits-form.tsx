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

interface BenefitFormData {
  description: string;
  code: string;
  benefit_type: string;
  is_formula_based: boolean;
  total_monthly_cost: string;
  ee_monthly_cost: string;
  firm_monthly_cost: string;
  coverage_percentage: string;
  max_weekly_benefit: string;
  max_monthly_benefit: string;
  rate_per_unit: string;
  is_active: boolean;
}

interface BenefitFormProps {
  initialData?: BenefitFormData;
  benefitId?: number;
  mode: "create" | "edit";
}

const BENEFIT_TYPES = [
  { value: "Medical", label: "Medical" },
  { value: "Dental", label: "Dental" },
  { value: "Vision", label: "Vision" },
  { value: "STD", label: "Short-Term Disability" },
  { value: "LTD", label: "Long-Term Disability" },
  { value: "Life", label: "Life Insurance" },
];

export function BenefitForm({ initialData, benefitId, mode }: BenefitFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BenefitFormData>(
    initialData || {
      description: "",
      code: "",
      benefit_type: "",
      is_formula_based: false,
      total_monthly_cost: "",
      ee_monthly_cost: "",
      firm_monthly_cost: "",
      coverage_percentage: "",
      max_weekly_benefit: "",
      max_monthly_benefit: "",
      rate_per_unit: "",
      is_active: true,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        description: formData.description,
        code: formData.code,
        benefit_type: formData.benefit_type,
        is_formula_based: formData.is_formula_based,
        total_monthly_cost: formData.total_monthly_cost
          ? parseFloat(formData.total_monthly_cost)
          : null,
        ee_monthly_cost: formData.ee_monthly_cost
          ? parseFloat(formData.ee_monthly_cost)
          : null,
        firm_monthly_cost: formData.firm_monthly_cost
          ? parseFloat(formData.firm_monthly_cost)
          : null,
        coverage_percentage: formData.coverage_percentage
          ? parseFloat(formData.coverage_percentage)
          : null,
        max_weekly_benefit: formData.max_weekly_benefit
          ? parseFloat(formData.max_weekly_benefit)
          : null,
        max_monthly_benefit: formData.max_monthly_benefit
          ? parseFloat(formData.max_monthly_benefit)
          : null,
        rate_per_unit: formData.rate_per_unit
          ? parseFloat(formData.rate_per_unit)
          : null,
        is_active: formData.is_active,
      };

      const url =
        mode === "create" ? "/api/benefits" : `/api/benefits/${benefitId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save benefit");
      }

      toast.success(
        mode === "create"
          ? "Benefit created successfully"
          : "Benefit updated successfully"
      );
      router.push("/settings/benefits");
    } catch (error) {
      console.error("Error saving benefit:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save benefit"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof BenefitFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
              placeholder="e.g., ME1, D1, V1"
              maxLength={10}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="benefit_type">Type *</Label>
            <Select
              value={formData.benefit_type}
              onValueChange={(value) => handleChange("benefit_type", value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {BENEFIT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="e.g., Medical UHC HSA1 EE + Spouse"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="is_formula_based">Calculation Type</Label>
            <Select
              value={formData.is_formula_based ? "true" : "false"}
              onValueChange={(value) =>
                handleChange("is_formula_based", value === "true")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Fixed Amount</SelectItem>
                <SelectItem value="true">Formula Based</SelectItem>
              </SelectContent>
            </Select>
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
          <CardTitle>Monthly Costs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="total_monthly_cost">Total Monthly Cost</Label>
            <Input
              id="total_monthly_cost"
              type="number"
              step="0.01"
              value={formData.total_monthly_cost}
              onChange={(e) => handleChange("total_monthly_cost", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ee_monthly_cost">Employee Monthly Cost</Label>
            <Input
              id="ee_monthly_cost"
              type="number"
              step="0.01"
              value={formData.ee_monthly_cost}
              onChange={(e) => handleChange("ee_monthly_cost", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="firm_monthly_cost">Firm Monthly Cost</Label>
            <Input
              id="firm_monthly_cost"
              type="number"
              step="0.01"
              value={formData.firm_monthly_cost}
              onChange={(e) => handleChange("firm_monthly_cost", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </CardContent>
      </Card>

      {formData.is_formula_based && (
        <Card>
          <CardHeader>
            <CardTitle>Formula Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coverage_percentage">Coverage Percentage</Label>
              <Input
                id="coverage_percentage"
                type="number"
                step="0.01"
                value={formData.coverage_percentage}
                onChange={(e) =>
                  handleChange("coverage_percentage", e.target.value)
                }
                placeholder="e.g., 60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_per_unit">Rate Per Unit</Label>
              <Input
                id="rate_per_unit"
                type="number"
                step="0.0001"
                value={formData.rate_per_unit}
                onChange={(e) => handleChange("rate_per_unit", e.target.value)}
                placeholder="e.g., 0.0850"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_weekly_benefit">Max Weekly Benefit</Label>
              <Input
                id="max_weekly_benefit"
                type="number"
                step="0.01"
                value={formData.max_weekly_benefit}
                onChange={(e) =>
                  handleChange("max_weekly_benefit", e.target.value)
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_monthly_benefit">Max Monthly Benefit</Label>
              <Input
                id="max_monthly_benefit"
                type="number"
                step="0.01"
                value={formData.max_monthly_benefit}
                onChange={(e) =>
                  handleChange("max_monthly_benefit", e.target.value)
                }
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/benefits")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Benefit"
            : "Update Benefit"}
        </Button>
      </div>
    </form>
  );
}
