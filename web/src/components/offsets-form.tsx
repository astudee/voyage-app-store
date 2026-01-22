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

interface OffsetFormData {
  effective_date: string;
  salesperson: string;
  category: string;
  amount: string;
  note: string;
}

interface OffsetFormProps {
  initialData?: OffsetFormData;
  offsetId?: number;
  mode: "create" | "edit";
}

const CATEGORIES = [
  "Salary",
  "Payroll Taxes",
  "Benefits",
  "Referrals",
  "Commission Adjustment",
  "Other",
];

export function OffsetForm({ initialData, offsetId, mode }: OffsetFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OffsetFormData>(
    initialData || {
      effective_date: new Date().toISOString().split("T")[0],
      salesperson: "",
      category: "Commission Adjustment",
      amount: "",
      note: "",
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        effective_date: formData.effective_date,
        salesperson: formData.salesperson,
        category: formData.category,
        amount: parseFloat(formData.amount),
        note: formData.note || null,
      };

      const url =
        mode === "create" ? "/api/offsets" : `/api/offsets/${offsetId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save offset");
      }

      toast.success(
        mode === "create"
          ? "Offset created successfully"
          : "Offset updated successfully"
      );
      router.push("/settings/offsets");
    } catch (error) {
      console.error("Error saving offset:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save offset"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof OffsetFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Offset Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="effective_date">Effective Date *</Label>
            <Input
              id="effective_date"
              type="date"
              value={formData.effective_date}
              onChange={(e) => handleChange("effective_date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salesperson">Salesperson *</Label>
            <Input
              id="salesperson"
              value={formData.salesperson}
              onChange={(e) => handleChange("salesperson", e.target.value)}
              placeholder="e.g., David Woods"
              required
            />
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
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              placeholder="e.g., -5000.00"
              required
            />
            <p className="text-xs text-gray-500">
              Use negative values for deductions (e.g., -5000 for expenses paid)
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
            placeholder="e.g., Salaries Paid YTD, including 12/15/25 payroll"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/offsets")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Create Offset"
            : "Update Offset"}
        </Button>
      </div>
    </form>
  );
}
