"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  status: string;
  is_contract: boolean | null;
  // Contract fields
  document_category: string | null;
  contract_type: string | null;
  counterparty: string | null;
  sub_entity: string | null;
  executed_date: string | null;
  // Document fields
  issuer_category: string | null;
  issuer_name: string | null;
  country: string | null;
  state: string | null;
  document_type: string | null;
  period_end_date: string | null;
  letter_date: string | null;
  account_last4: string | null;
  employee_name: string | null;
  // Invoice fields
  invoice_type: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  // AI fields
  description: string | null;
  ai_confidence_score: number | null;
  ai_model_used: string | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReviewPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [document, setDocument] = useState<Document | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Document>>({});

  useEffect(() => {
    fetchDocument();
    fetchPdfUrl();
  }, [id]);

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents-v2/${id}`);
      if (!res.ok) throw new Error("Failed to fetch document");
      const data = await res.json();
      setDocument(data);
      setFormData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchPdfUrl = async () => {
    try {
      const res = await fetch(`/api/documents-v2/${id}/view-url`);
      if (res.ok) {
        const data = await res.json();
        setPdfUrl(data.url);
      }
    } catch (err) {
      console.error("Failed to get PDF URL:", err);
    }
  };

  const handleFieldChange = (field: string, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents-v2/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setDocument(updated);
      setFormData(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents-v2/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, status: "archived" }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      router.push("/documents-v2/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents-v2/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/documents-v2/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center p-8">
          <p>Loading document...</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !document) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-red-500">{error || "Document not found"}</p>
              <div className="mt-4 flex justify-center">
                <Button onClick={() => router.push("/documents-v2/queue")}>
                  Back to Queue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const isContract = formData.is_contract;
  const confidencePercent = formData.ai_confidence_score
    ? Math.round(formData.ai_confidence_score * 100)
    : null;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
        {/* Left side - PDF Preview */}
        <div className="flex w-1/2 flex-col">
          <Card className="flex flex-1 flex-col">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="truncate" title={document.original_filename}>
                  {document.original_filename}
                </span>
                <div className="flex items-center gap-2">
                  {formData.ai_model_used && (
                    <Badge variant="outline">{formData.ai_model_used}</Badge>
                  )}
                  {confidencePercent !== null && (
                    <Badge
                      className={
                        confidencePercent >= 80
                          ? "bg-green-100 text-green-800"
                          : confidencePercent >= 60
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {confidencePercent}% confidence
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="h-full w-full border-0"
                  title="Document Preview"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500">
                  Loading PDF...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right side - Edit Form */}
        <div className="flex w-1/2 flex-col">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Document Attributes</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-4">
                {/* Document Type Toggle */}
                <div>
                  <Label>Document Type</Label>
                  <Select
                    value={isContract === true ? "contract" : isContract === false ? "document" : ""}
                    onValueChange={(v) =>
                      handleFieldChange("is_contract", v === "contract" ? true : v === "document" ? false : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isContract === true && (
                  <>
                    {/* Contract Fields */}
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={formData.document_category || ""}
                        onValueChange={(v) => handleFieldChange("document_category", v || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="COMPANY">Company</SelectItem>
                          <SelectItem value="EMPLOYEE">Employee</SelectItem>
                          <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Contract Type</Label>
                      <Input
                        value={formData.contract_type || ""}
                        onChange={(e) => handleFieldChange("contract_type", e.target.value || null)}
                        placeholder="e.g., MSA, SOW, NDA, Offer Letter"
                      />
                    </div>

                    <div>
                      <Label>
                        {formData.document_category === "CONTRACTOR"
                          ? "Contractor Company"
                          : formData.document_category === "EMPLOYEE"
                          ? "Employee Name"
                          : "Counterparty"}
                      </Label>
                      <Input
                        value={formData.counterparty || ""}
                        onChange={(e) => handleFieldChange("counterparty", e.target.value || null)}
                        placeholder={
                          formData.document_category === "CONTRACTOR"
                            ? "Company name (e.g., Acme Consulting LLC)"
                            : formData.document_category === "EMPLOYEE"
                            ? "Last, First"
                            : "Company name or Last, First"
                        }
                      />
                    </div>

                    <div>
                      <Label>
                        {formData.document_category === "CONTRACTOR"
                          ? "Individual Name"
                          : formData.document_category === "COMPANY"
                          ? "Sub-Entity (optional)"
                          : "Sub-Entity"}
                      </Label>
                      <Input
                        value={formData.sub_entity || ""}
                        onChange={(e) => handleFieldChange("sub_entity", e.target.value || null)}
                        placeholder={
                          formData.document_category === "CONTRACTOR"
                            ? "Last, First (e.g., Shah, Alam)"
                            : "Department or division"
                        }
                      />
                      {formData.document_category === "CONTRACTOR" && (
                        <p className="mt-1 text-xs text-gray-500">
                          Individual contractor name for searchability
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Executed Date</Label>
                      <Input
                        type="date"
                        value={formData.executed_date || ""}
                        onChange={(e) => handleFieldChange("executed_date", e.target.value || null)}
                      />
                    </div>

                    <div>
                      <Label>Description (optional)</Label>
                      <Input
                        value={formData.description || ""}
                        onChange={(e) => handleFieldChange("description", e.target.value || null)}
                        placeholder="Brief description"
                      />
                    </div>
                  </>
                )}

                {isContract === false && (
                  <>
                    {/* Document Fields */}
                    <div>
                      <Label>Issuer Category</Label>
                      <Select
                        value={formData.issuer_category || ""}
                        onValueChange={(v) => handleFieldChange("issuer_category", v || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BANK">Bank</SelectItem>
                          <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                          <SelectItem value="UTILITY">Utility</SelectItem>
                          <SelectItem value="INSURER">Insurance</SelectItem>
                          <SelectItem value="GOVERNMENT_STATE">Government (State)</SelectItem>
                          <SelectItem value="GOVERNMENT_FEDERAL">Government (Federal)</SelectItem>
                          <SelectItem value="INVOICE">Invoice</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Issuer Name</Label>
                      <Input
                        value={formData.issuer_name || ""}
                        onChange={(e) => handleFieldChange("issuer_name", e.target.value || null)}
                        placeholder={
                          formData.issuer_category === "GOVERNMENT_STATE"
                            ? "State of {StateName}"
                            : formData.issuer_category === "GOVERNMENT_FEDERAL"
                            ? "US Government"
                            : "Bank or company name"
                        }
                      />
                    </div>

                    <div>
                      <Label>Sub-Entity (optional)</Label>
                      <Input
                        value={formData.sub_entity || ""}
                        onChange={(e) => handleFieldChange("sub_entity", e.target.value || null)}
                        placeholder={
                          formData.issuer_category === "GOVERNMENT_STATE" ||
                          formData.issuer_category === "GOVERNMENT_FEDERAL"
                            ? "Agency or department name"
                            : "Division or department"
                        }
                      />
                    </div>

                    <div>
                      <Label>Document Type</Label>
                      <Input
                        value={formData.document_type || ""}
                        onChange={(e) => handleFieldChange("document_type", e.target.value || null)}
                        placeholder="e.g., Statement, Invoice, Notice"
                      />
                    </div>

                    {(formData.issuer_category === "GOVERNMENT_STATE" ||
                      formData.issuer_category === "GOVERNMENT_FEDERAL") && (
                      <>
                        <div>
                          <Label>Country</Label>
                          <Input
                            value={formData.country || ""}
                            onChange={(e) => handleFieldChange("country", e.target.value || null)}
                            placeholder="e.g., US"
                          />
                        </div>
                        {formData.issuer_category === "GOVERNMENT_STATE" && (
                          <div>
                            <Label>State</Label>
                            <Input
                              value={formData.state || ""}
                              onChange={(e) => handleFieldChange("state", e.target.value || null)}
                              placeholder="Full state name"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Period End Date</Label>
                        <Input
                          type="date"
                          value={formData.period_end_date || ""}
                          onChange={(e) => handleFieldChange("period_end_date", e.target.value || null)}
                        />
                      </div>
                      <div>
                        <Label>Letter Date</Label>
                        <Input
                          type="date"
                          value={formData.letter_date || ""}
                          onChange={(e) => handleFieldChange("letter_date", e.target.value || null)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Account Last 4</Label>
                      <Input
                        value={formData.account_last4 || ""}
                        onChange={(e) => handleFieldChange("account_last4", e.target.value || null)}
                        placeholder="Last 4 digits"
                        maxLength={4}
                      />
                    </div>

                    <div>
                      <Label>Employee Name</Label>
                      <Input
                        value={formData.employee_name || ""}
                        onChange={(e) => handleFieldChange("employee_name", e.target.value || null)}
                        placeholder="Last, First (if applicable)"
                      />
                    </div>

                    {formData.issuer_category === "INVOICE" && (
                      <>
                        <div>
                          <Label>Invoice Type</Label>
                          <Select
                            value={formData.invoice_type || ""}
                            onValueChange={(v) => handleFieldChange("invoice_type", v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="VENDOR">Vendor (bill we received)</SelectItem>
                              <SelectItem value="CLIENT">Client (invoice we sent)</SelectItem>
                              <SelectItem value="CONTRACTOR">Contractor (contractor invoice)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Amount</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.amount || ""}
                              onChange={(e) =>
                                handleFieldChange("amount", e.target.value ? parseFloat(e.target.value) : null)
                              }
                            />
                          </div>
                          <div>
                            <Label>Currency</Label>
                            <Input
                              value={formData.currency || "USD"}
                              onChange={(e) => handleFieldChange("currency", e.target.value || null)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Due Date</Label>
                          <Input
                            type="date"
                            value={formData.due_date || ""}
                            onChange={(e) => handleFieldChange("due_date", e.target.value || null)}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </CardContent>

            {/* Action Buttons */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/documents-v2/queue")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
                <div className="flex-1" />
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete
                </Button>
                <Button onClick={handleApprove} disabled={saving}>
                  {saving ? "Approving..." : "Approve & Archive"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
