"use client";

import { useEffect, useState } from "react";
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

interface Benefit {
  BENEFIT_ID: number;
  CODE: string;
  DESCRIPTION: string;
}

interface StaffFormData {
  staff_name: string;
  start_date: string;
  salary: string;
  utilization_bonus_target: string;
  other_bonus_target: string;
  medical_plan_code: string;
  dental_plan_code: string;
  vision_plan_code: string;
  std_code: string;
  ltd_code: string;
  life_code: string;
  addl_life_code: string;
  phone_allowance: string;
  staff_type: string;
  notes: string;
  is_active: boolean;
}

interface StaffFormProps {
  initialData?: StaffFormData;
  staffId?: number;
  mode: "create" | "edit";
}

const STAFF_TYPES = ["FTE", "International", "Contractor"];

export function StaffForm({ initialData, staffId, mode }: StaffFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [formData, setFormData] = useState<StaffFormData>(
    initialData || {
      staff_name: "",
      start_date: "",
      salary: "",
      utilization_bonus_target: "",
      other_bonus_target: "",
      medical_plan_code: "",
      dental_plan_code: "",
      vision_plan_code: "",
      std_code: "",
      ltd_code: "",
      life_code: "",
      addl_life_code: "",
      phone_allowance: "",
      staff_type: "",
      notes: "",
      is_active: true,
    }
  );

  useEffect(() => {
    const fetchBenefits = async () => {
      try {
        const response = await fetch("/api/benefits");
        if (!response.ok) throw new Error("Failed to fetch benefits");
        const data = await response.json();
        setBenefits(data);
      } catch (error) {
        console.error("Error fetching benefits:", error);
        toast.error("Failed to load benefit options");
      }
    };
    fetchBenefits();
  }, []);

  const filterBenefitsByPrefix = (prefix: string) => {
    return benefits.filter((b) => b.CODE.startsWith(prefix));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        staff_name: formData.staff_name,
        start_date: formData.start_date || null,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        utilization_bonus_target: formData.utilization_bonus_target
          ? parseFloat(formData.utilization_bonus_target)
          : null,
        other_bonus_target: formData.other_bonus_target
          ? parseFloat(formData.other_bonus_target)
          : null,
        medical_plan_code: formData.medical_plan_code || null,
        dental_plan_code: formData.dental_plan_code || null,
        vision_plan_code: formData.vision_plan_code || null,
        std_code: formData.std_code || null,
        ltd_code: formData.ltd_code || null,
        life_code: formData.life_code || null,
        addl_life_code: formData.addl_life_code || null,
        phone_allowance: formData.phone_allowance
          ? parseFloat(formData.phone_allowance)
          : null,
        staff_type: formData.staff_type || null,
        notes: formData.notes || null,
        is_active: formData.is_active,
      };

      const url = mode === "create" ? "/api/staff" : `/api/staff/${staffId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save staff member");
      }

      toast.success(
        mode === "create"
          ? "Staff member created successfully"
          : "Staff member updated successfully"
      );
      router.push("/settings/staff");
    } catch (error) {
      console.error("Error saving staff:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save staff member"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof StaffFormData, value: string | boolean) => {
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
            <Label htmlFor="staff_name">Staff Name *</Label>
            <Input
              id="staff_name"
              value={formData.staff_name}
              onChange={(e) => handleChange("staff_name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff_type">Staff Type</Label>
            <Select
              value={formData.staff_type}
              onValueChange={(value) => handleChange("staff_type", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {STAFF_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <Label htmlFor="salary">Salary</Label>
            <Input
              id="salary"
              type="number"
              step="0.01"
              value={formData.salary}
              onChange={(e) => handleChange("salary", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="utilization_bonus_target">
              Utilization Bonus Target
            </Label>
            <Input
              id="utilization_bonus_target"
              type="number"
              step="0.01"
              value={formData.utilization_bonus_target}
              onChange={(e) =>
                handleChange("utilization_bonus_target", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="other_bonus_target">Other Bonus Target</Label>
            <Input
              id="other_bonus_target"
              type="number"
              step="0.01"
              value={formData.other_bonus_target}
              onChange={(e) =>
                handleChange("other_bonus_target", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_allowance">Phone Allowance</Label>
            <Input
              id="phone_allowance"
              type="number"
              step="0.01"
              value={formData.phone_allowance}
              onChange={(e) => handleChange("phone_allowance", e.target.value)}
            />
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
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="medical_plan_code">Medical Plan</Label>
            <Select
              value={formData.medical_plan_code}
              onValueChange={(value) =>
                handleChange("medical_plan_code", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("M").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dental_plan_code">Dental Plan</Label>
            <Select
              value={formData.dental_plan_code}
              onValueChange={(value) =>
                handleChange("dental_plan_code", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("D").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vision_plan_code">Vision Plan</Label>
            <Select
              value={formData.vision_plan_code}
              onValueChange={(value) =>
                handleChange("vision_plan_code", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("V").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="std_code">Short-Term Disability</Label>
            <Select
              value={formData.std_code}
              onValueChange={(value) => handleChange("std_code", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("S").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ltd_code">Long-Term Disability</Label>
            <Select
              value={formData.ltd_code}
              onValueChange={(value) => handleChange("ltd_code", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("L").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="life_code">Life Insurance</Label>
            <Select
              value={formData.life_code}
              onValueChange={(value) => handleChange("life_code", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {filterBenefitsByPrefix("T").map((benefit) => (
                  <SelectItem key={benefit.CODE} value={benefit.CODE}>
                    {benefit.CODE} - {benefit.DESCRIPTION}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="addl_life_code">Additional Life Insurance</Label>
            <Input
              id="addl_life_code"
              value={formData.addl_life_code}
              onChange={(e) => handleChange("addl_life_code", e.target.value)}
              placeholder="Enter code if applicable"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="w-full rounded-md border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={4}
            placeholder="Additional notes..."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/staff")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Staff Member"
            : "Update Staff Member"}
        </Button>
      </div>
    </form>
  );
}
