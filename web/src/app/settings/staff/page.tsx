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
  BIGTIME_STAFF_ID: number | null;
}

// Eye icons for show/hide toggle
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export default function StaffListPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showSalaries, setShowSalaries] = useState(false);
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    staff: Staff | null;
  }>({ open: false, staff: null });
  const [deactivating, setDeactivating] = useState(false);

  // Filter staff based on showInactive toggle
  const filteredStaff = showInactive
    ? staff
    : staff.filter((s) => s.IS_ACTIVE);

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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Staff Members</CardTitle>
            <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Include inactive staff
            </label>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filteredStaff.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {showInactive ? "No staff members found" : "No active staff members found"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>
                      <button
                        onClick={() => setShowSalaries(!showSalaries)}
                        className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                        title={showSalaries ? "Hide salaries" : "Show salaries"}
                      >
                        Salary
                        {showSalaries ? (
                          <EyeIcon className="h-4 w-4" />
                        ) : (
                          <EyeSlashIcon className="h-4 w-4" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>BigTime</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.map((member) => (
                    <TableRow key={member.STAFF_ID}>
                      <TableCell className="font-medium">
                        {member.STAFF_NAME}
                      </TableCell>
                      <TableCell>{member.STAFF_TYPE || "-"}</TableCell>
                      <TableCell>{formatDate(member.START_DATE)}</TableCell>
                      <TableCell>
                        {showSalaries ? formatCurrency(member.SALARY) : (member.SALARY ? "••••••" : "-")}
                      </TableCell>
                      <TableCell>
                        {member.BIGTIME_STAFF_ID ? (
                          <a
                            href={`https://iq.bigtime.net/Bigtime/Staff2#/detail/${member.BIGTIME_STAFF_ID}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {member.BIGTIME_STAFF_ID}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
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
