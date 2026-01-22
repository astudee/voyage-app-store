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

const CATEGORY_LABELS: Record<string, string> = {
  "Client Commission": "Client",
  "Referral Commission": "Referral",
  "Delivery Commission": "Delivery",
};

export default function CommissionRulesListPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    rule: CommissionRule | null;
  }>({ open: false, rule: null });
  const [deactivating, setDeactivating] = useState(false);
  const [filterSalesperson, setFilterSalesperson] = useState<string>("all");

  const fetchRules = async () => {
    try {
      const response = await fetch("/api/commission-rules");
      if (!response.ok) throw new Error("Failed to fetch commission rules");
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error("Error fetching commission rules:", error);
      toast.error("Failed to load commission rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleDeactivate = async () => {
    if (!deactivateDialog.rule) return;

    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/commission-rules/${deactivateDialog.rule.RULE_ID}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to deactivate rule");

      toast.success("Commission rule has been deactivated");
      setDeactivateDialog({ open: false, rule: null });
      fetchRules();
    } catch (error) {
      console.error("Error deactivating rule:", error);
      toast.error("Failed to deactivate commission rule");
    } finally {
      setDeactivating(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatRate = (rate: number) => {
    return `${(rate * 100).toFixed(2)}%`;
  };

  const salespeople = [...new Set(rules.map((r) => r.SALESPERSON))].sort();

  const filteredRules =
    filterSalesperson === "all"
      ? rules
      : rules.filter((r) => r.SALESPERSON === filterSalesperson);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Commission Rules</h1>
            <p className="text-gray-500">
              Manage commission rates for clients and resources
            </p>
          </div>
          <Link href="/settings/rules/new">
            <Button>Add Rule</Button>
          </Link>
        </div>

        <div className="flex gap-2">
          <Button
            variant={filterSalesperson === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterSalesperson("all")}
          >
            All ({rules.length})
          </Button>
          {salespeople.map((person) => (
            <Button
              key={person}
              variant={filterSalesperson === person ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterSalesperson(person)}
            >
              {person} ({rules.filter((r) => r.SALESPERSON === person).length})
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {filterSalesperson === "all"
                ? "All Commission Rules"
                : `${filterSalesperson}'s Rules`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filteredRules.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No commission rules found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Client/Resource</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules.map((rule) => (
                    <TableRow key={rule.RULE_ID}>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            rule.RULE_SCOPE === "client"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {rule.RULE_SCOPE}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {rule.CLIENT_OR_RESOURCE}
                      </TableCell>
                      <TableCell>{rule.SALESPERSON}</TableCell>
                      <TableCell>
                        {CATEGORY_LABELS[rule.CATEGORY] || rule.CATEGORY}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatRate(rule.RATE)}
                      </TableCell>
                      <TableCell>{formatDate(rule.START_DATE)}</TableCell>
                      <TableCell>{formatDate(rule.END_DATE)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            rule.IS_ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {rule.IS_ACTIVE ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/settings/rules/${rule.RULE_ID}/edit`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          {rule.IS_ACTIVE && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setDeactivateDialog({
                                  open: true,
                                  rule: rule,
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
            rule: open ? deactivateDialog.rule : null,
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Commission Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate the rule for{" "}
              <strong>{deactivateDialog.rule?.CLIENT_OR_RESOURCE}</strong> (
              {deactivateDialog.rule?.SALESPERSON} -{" "}
              {formatRate(deactivateDialog.rule?.RATE || 0)})? This action can
              be undone by editing the rule.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateDialog({ open: false, rule: null })}
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
