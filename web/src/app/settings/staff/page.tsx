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

interface Staff {
  STAFF_ID: number;
  STAFF_NAME: string;
  START_DATE: string | null;
  SALARY: number | null;
  STAFF_TYPE: string | null;
  IS_ACTIVE: boolean;
}

export default function StaffListPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    staff: Staff | null;
  }>({ open: false, staff: null });
  const [deactivating, setDeactivating] = useState(false);

  const fetchStaff = async () => {
    try {
      const response = await fetch("/api/staff");
      if (!response.ok) throw new Error("Failed to fetch staff");
      const data = await response.json();
      setStaff(data);
    } catch (error) {
      console.error("Error fetching staff:", error);
      toast.error("Failed to load staff members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleDeactivate = async () => {
    if (!deactivateDialog.staff) return;

    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/staff/${deactivateDialog.staff.STAFF_ID}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to deactivate staff");

      toast.success(`${deactivateDialog.staff.STAFF_NAME} has been deactivated`);
      setDeactivateDialog({ open: false, staff: null });
      fetchStaff();
    } catch (error) {
      console.error("Error deactivating staff:", error);
      toast.error("Failed to deactivate staff member");
    } finally {
      setDeactivating(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Staff</h1>
            <p className="text-gray-500">Manage staff members</p>
          </div>
          <Link href="/settings/staff/new">
            <Button>Add Staff Member</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Staff Members</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : staff.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No staff members found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.STAFF_ID}>
                      <TableCell className="font-medium">
                        {member.STAFF_NAME}
                      </TableCell>
                      <TableCell>{member.STAFF_TYPE || "-"}</TableCell>
                      <TableCell>{formatDate(member.START_DATE)}</TableCell>
                      <TableCell>{formatCurrency(member.SALARY)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            member.IS_ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {member.IS_ACTIVE ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/settings/staff/${member.STAFF_ID}/edit`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          {member.IS_ACTIVE && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setDeactivateDialog({ open: true, staff: member })
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
          setDeactivateDialog({ open, staff: open ? deactivateDialog.staff : null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Staff Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <strong>{deactivateDialog.staff?.STAFF_NAME}</strong>? This action
              can be undone by editing the staff member.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateDialog({ open: false, staff: null })}
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
