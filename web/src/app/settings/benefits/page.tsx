"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Benefit {
  BENEFIT_ID: number;
  DESCRIPTION: string;
  CODE: string;
  BENEFIT_TYPE: string;
  IS_FORMULA_BASED: boolean;
  TOTAL_MONTHLY_COST: number | null;
  EE_MONTHLY_COST: number | null;
  FIRM_MONTHLY_COST: number | null;
  IS_ACTIVE: boolean;
}

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  Medical: "Medical",
  Dental: "Dental",
  Vision: "Vision",
  STD: "Short-Term Disability",
  LTD: "Long-Term Disability",
  Life: "Life Insurance",
};

export default function BenefitsListPage() {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    benefit: Benefit | null;
  }>({ open: false, benefit: null });
  const [deactivating, setDeactivating] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  const fetchBenefits = async () => {
    try {
      const response = await fetch("/api/benefits");
      if (!response.ok) throw new Error("Failed to fetch benefits");
      const data = await response.json();
      setBenefits(data);
    } catch (error) {
      console.error("Error fetching benefits:", error);
      toast.error("Failed to load benefits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBenefits();
  }, []);

  const handleDeactivate = async () => {
    if (!deactivateDialog.benefit) return;

    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/benefits/${deactivateDialog.benefit.BENEFIT_ID}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to deactivate benefit");

      toast.success(`${deactivateDialog.benefit.CODE} has been deactivated`);
      setDeactivateDialog({ open: false, benefit: null });
      fetchBenefits();
    } catch (error) {
      console.error("Error deactivating benefit:", error);
      toast.error("Failed to deactivate benefit");
    } finally {
      setDeactivating(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const benefitTypes = [...new Set(benefits.map((b) => b.BENEFIT_TYPE))].sort();

  const filteredBenefits =
    filterType === "all"
      ? benefits
      : benefits.filter((b) => b.BENEFIT_TYPE === filterType);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Benefits</h1>
            <p className="text-gray-500">Manage benefit plans and costs</p>
          </div>
          <Link href="/settings/benefits/new">
            <Button>Add Benefit</Button>
          </Link>
        </div>

        <div className="flex gap-2">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
          >
            All ({benefits.length})
          </Button>
          {benefitTypes.map((type) => (
            <Button
              key={type}
              variant={filterType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(type)}
            >
              {BENEFIT_TYPE_LABELS[type] || type} (
              {benefits.filter((b) => b.BENEFIT_TYPE === type).length})
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {filterType === "all"
                ? "All Benefits"
                : BENEFIT_TYPE_LABELS[filterType] || filterType}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filteredBenefits.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No benefits found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Total Monthly</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Firm</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBenefits.map((benefit) => (
                    <TableRow key={benefit.BENEFIT_ID}>
                      <TableCell className="font-mono font-medium">
                        {benefit.CODE}
                      </TableCell>
                      <TableCell>{benefit.DESCRIPTION}</TableCell>
                      <TableCell>
                        {BENEFIT_TYPE_LABELS[benefit.BENEFIT_TYPE] ||
                          benefit.BENEFIT_TYPE}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(benefit.TOTAL_MONTHLY_COST)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(benefit.EE_MONTHLY_COST)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(benefit.FIRM_MONTHLY_COST)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            benefit.IS_ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {benefit.IS_ACTIVE ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/settings/benefits/${benefit.BENEFIT_ID}/edit`}
                          >
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          {benefit.IS_ACTIVE && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setDeactivateDialog({
                                  open: true,
                                  benefit: benefit,
                                })
                              }
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={deactivateDialog.open}
        onOpenChange={(open) =>
          setDeactivateDialog({
            open,
            benefit: open ? deactivateDialog.benefit : null,
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Benefit</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <strong>{deactivateDialog.benefit?.CODE}</strong> (
              {deactivateDialog.benefit?.DESCRIPTION})? This action can be
              undone by editing the benefit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateDialog({ open: false, benefit: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              {deactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
