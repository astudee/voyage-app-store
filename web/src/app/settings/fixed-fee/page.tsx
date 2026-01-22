"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface FixedFeeRevenue {
  REVENUE_ID: number;
  PROJECT_ID: number;
  MONTH_DATE: string;
  REVENUE_AMOUNT: number;
  PROJECT_NAME?: string;
  CLIENT_NAME?: string;
}

export default function FixedFeeSettingsPage() {
  const [revenues, setRevenues] = useState<FixedFeeRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchRevenues = async () => {
    try {
      const response = await fetch("/api/fixed-fee");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setRevenues(data);
    } catch (error) {
      console.error("Error fetching fixed fee revenues:", error);
      toast.error("Failed to load fixed fee revenues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenues();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const response = await fetch(`/api/fixed-fee/${deleteId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      toast.success("Revenue entry deleted successfully");
      fetchRevenues();
    } catch (error) {
      console.error("Error deleting revenue:", error);
      toast.error("Failed to delete revenue entry");
    } finally {
      setDeleteId(null);
    }
  };

  // Get unique projects for filter dropdown
  const uniqueProjects = Array.from(
    new Map(
      revenues
        .filter((r) => r.PROJECT_NAME)
        .map((r) => [r.PROJECT_ID, { id: r.PROJECT_ID, name: r.PROJECT_NAME!, client: r.CLIENT_NAME }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Filter revenues
  const filteredRevenues =
    projectFilter === "all"
      ? revenues
      : revenues.filter((r) => r.PROJECT_ID.toString() === projectFilter);

  // Calculate total for filtered revenues
  const totalRevenue = filteredRevenues.reduce(
    (sum, r) => sum + (r.REVENUE_AMOUNT || 0),
    0
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatMonth = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Fixed Fee Projects</h1>
            <p className="text-gray-500">
              Manage monthly revenue entries for fixed-fee projects
            </p>
          </div>
          <Link href="/settings/fixed-fee/new">
            <Button>Add Revenue Entry</Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Project:</label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[350px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.client} | {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredRevenues.length} of {revenues.length} entries
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Revenue (Filtered)</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalRevenue)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Entry Count</p>
              <p className="text-2xl font-bold">{filteredRevenues.length}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRevenues.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-gray-500"
                  >
                    No revenue entries found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRevenues.map((revenue) => (
                  <TableRow key={revenue.REVENUE_ID}>
                    <TableCell>{revenue.CLIENT_NAME || "-"}</TableCell>
                    <TableCell>{revenue.PROJECT_NAME || "-"}</TableCell>
                    <TableCell>{formatMonth(revenue.MONTH_DATE)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(revenue.REVENUE_AMOUNT)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link href={`/settings/fixed-fee/${revenue.REVENUE_ID}/edit`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDeleteId(revenue.REVENUE_ID)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Revenue Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this revenue entry? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
