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

interface Offset {
  OFFSET_ID: number;
  EFFECTIVE_DATE: string;
  SALESPERSON: string;
  CATEGORY: string;
  AMOUNT: number;
  NOTE: string | null;
}

export default function OffsetsListPage() {
  const [offsets, setOffsets] = useState<Offset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    offset: Offset | null;
  }>({ open: false, offset: null });
  const [deleting, setDeleting] = useState(false);
  const [filterSalesperson, setFilterSalesperson] = useState<string>("all");

  const fetchOffsets = async () => {
    try {
      const response = await fetch("/api/offsets");
      if (!response.ok) throw new Error("Failed to fetch offsets");
      const data = await response.json();
      setOffsets(data);
    } catch (error) {
      console.error("Error fetching offsets:", error);
      toast.error("Failed to load offsets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffsets();
  }, []);

  const handleDelete = async () => {
    if (!deleteDialog.offset) return;

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/offsets/${deleteDialog.offset.OFFSET_ID}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete offset");

      toast.success("Offset has been deleted");
      setDeleteDialog({ open: false, offset: null });
      fetchOffsets();
    } catch (error) {
      console.error("Error deleting offset:", error);
      toast.error("Failed to delete offset");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const salespeople = [...new Set(offsets.map((o) => o.SALESPERSON))].sort();

  const filteredOffsets =
    filterSalesperson === "all"
      ? offsets
      : offsets.filter((o) => o.SALESPERSON === filterSalesperson);

  // Calculate totals
  const totalAmount = filteredOffsets.reduce((sum, o) => sum + o.AMOUNT, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Commission Offsets</h1>
            <p className="text-gray-500">
              One-time adjustments to commission calculations
            </p>
          </div>
          <Link href="/settings/offsets/new">
            <Button>Add Offset</Button>
          </Link>
        </div>

        <div className="flex gap-2">
          <Button
            variant={filterSalesperson === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterSalesperson("all")}
          >
            All ({offsets.length})
          </Button>
          {salespeople.map((person) => (
            <Button
              key={person}
              variant={filterSalesperson === person ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterSalesperson(person)}
            >
              {person} ({offsets.filter((o) => o.SALESPERSON === person).length})
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {filterSalesperson === "all"
                  ? "All Offsets"
                  : `${filterSalesperson}'s Offsets`}
              </CardTitle>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total</p>
                <p
                  className={`text-lg font-semibold ${
                    totalAmount < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filteredOffsets.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No offsets found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOffsets.map((offset) => (
                    <TableRow key={offset.OFFSET_ID}>
                      <TableCell>{formatDate(offset.EFFECTIVE_DATE)}</TableCell>
                      <TableCell className="font-medium">
                        {offset.SALESPERSON}
                      </TableCell>
                      <TableCell>{offset.CATEGORY}</TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          offset.AMOUNT < 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {formatCurrency(offset.AMOUNT)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-gray-500">
                        {offset.NOTE || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/settings/offsets/${offset.OFFSET_ID}/edit`}
                          >
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setDeleteDialog({
                                open: true,
                                offset: offset,
                              })
                            }
                          >
                            Delete
                          </Button>
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
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({
            open,
            offset: open ? deleteDialog.offset : null,
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Offset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this offset for{" "}
              <strong>{deleteDialog.offset?.SALESPERSON}</strong> (
              {deleteDialog.offset?.CATEGORY} -{" "}
              {formatCurrency(deleteDialog.offset?.AMOUNT || 0)})? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, offset: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
