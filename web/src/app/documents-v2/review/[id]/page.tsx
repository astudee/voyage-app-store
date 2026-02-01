"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SimilarDocument {
  id: string;
  original_filename: string;
  party: string | null;
  document_type: string | null;
  ai_summary: string | null;
  date: string | null;
  similarity_reason: string;
}

interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  status: string;
  // Phase 2 fields
  document_type_category: "contract" | "document" | "invoice" | null;
  is_contract: boolean | null; // Legacy, derived from document_type_category
  // Common fields
  party: string | null;
  sub_party: string | null;
  document_type: string | null;
  ai_summary: string | null;
  notes: string | null;
  // Contract fields
  document_category: string | null; // EMPLOYEE, CONTRACTOR, VENDOR, CLIENT
  contract_type: string | null;
  executed_date: string | null;
  // Document fields
  letter_date: string | null;
  period_end_date: string | null;
  account_last4: string | null;
  // Invoice fields
  amount: number | null;
  due_date: string | null;
  invoice_type: string | null; // PAYABLE, RECEIVABLE
  // AI fields
  ai_confidence_score: number | null;
  ai_model_used: string | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReviewDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [document, setDocument] = useState<Document | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate detection state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [similarDocuments, setSimilarDocuments] = useState<SimilarDocument[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

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
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Sync is_contract with document_type_category for backwards compatibility
      if (field === "document_type_category") {
        updated.is_contract = value === "contract";
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents-v2/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to save");
      }
      setDocument(data);
      setFormData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Check for duplicates before approving
  const handleApprove = async () => {
    setCheckingDuplicates(true);
    setError(null);

    try {
      // First check for potential duplicates
      const checkRes = await fetch("/api/documents-v2/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const checkData = await checkRes.json();

      if (checkRes.ok && checkData.similar && checkData.similar.length > 0) {
        // Show duplicate warning modal
        setSimilarDocuments(checkData.similar);
        setShowDuplicateModal(true);
        setCheckingDuplicates(false);
        return;
      }

      // No duplicates found, proceed with approval
      await performApproval();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate check failed");
      setCheckingDuplicates(false);
    }
  };

  // Actually perform the approval (called directly or after duplicate confirmation)
  const performApproval = async () => {
    setSaving(true);
    setError(null);
    setShowDuplicateModal(false);

    try {
      const res = await fetch(`/api/documents-v2/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, status: "archived", reviewed_at: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to approve");
      }
      router.push("/documents-v2/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
      setSaving(false);
      setCheckingDuplicates(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents-v2/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/documents-v2/review");
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

  if (error && !document) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-red-500">{error || "Document not found"}</p>
              <div className="mt-4 flex justify-center">
                <Button onClick={() => router.push("/documents-v2/review")}>
                  Back to Review
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const docTypeCategory = formData.document_type_category;
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
              <CardTitle className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate font-semibold" title={document?.original_filename}>
                    Review: {document?.original_filename}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
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
              {error && (
                <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                {/* Document Type Category */}
                <div>
                  <Label>Document Type</Label>
                  <Select
                    value={docTypeCategory || ""}
                    onValueChange={(v) =>
                      handleFieldChange("document_type_category", v || null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Summary (read-only) */}
                {formData.ai_summary && (
                  <div>
                    <Label>AI Summary</Label>
                    <div className="mt-1 rounded border bg-gray-50 p-3 text-sm text-gray-700">
                      {formData.ai_summary}
                    </div>
                  </div>
                )}

                {/* CONTRACT FIELDS */}
                {docTypeCategory === "contract" && (
                  <>
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
                          <SelectItem value="EMPLOYEE">Employee</SelectItem>
                          <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                          <SelectItem value="VENDOR">Vendor</SelectItem>
                          <SelectItem value="CLIENT">Client</SelectItem>
                          <SelectItem value="PARTNER">Partner</SelectItem>
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
                          : "Party"}
                      </Label>
                      <Input
                        value={formData.party || ""}
                        onChange={(e) => handleFieldChange("party", e.target.value || null)}
                        placeholder={
                          formData.document_category === "CONTRACTOR"
                            ? "Company name (e.g., Acme Consulting LLC)"
                            : formData.document_category === "EMPLOYEE"
                            ? "Last, First"
                            : "Company name"
                        }
                      />
                    </div>

                    <div>
                      <Label>
                        {formData.document_category === "CONTRACTOR"
                          ? "Individual Name"
                          : "Sub-Party (optional)"}
                      </Label>
                      <Input
                        value={formData.sub_party || ""}
                        onChange={(e) => handleFieldChange("sub_party", e.target.value || null)}
                        placeholder={
                          formData.document_category === "CONTRACTOR"
                            ? "Last, First (e.g., Alam, Shah)"
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
                  </>
                )}

                {/* DOCUMENT FIELDS */}
                {docTypeCategory === "document" && (
                  <>
                    <div>
                      <Label>Party (Issuer)</Label>
                      <Input
                        value={formData.party || ""}
                        onChange={(e) => handleFieldChange("party", e.target.value || null)}
                        placeholder="Bank, company, or government entity"
                      />
                    </div>

                    <div>
                      <Label>Sub-Party (optional)</Label>
                      <Input
                        value={formData.sub_party || ""}
                        onChange={(e) => handleFieldChange("sub_party", e.target.value || null)}
                        placeholder="Agency, department, or division"
                      />
                    </div>

                    <div>
                      <Label>Document Type</Label>
                      <Input
                        value={formData.document_type || ""}
                        onChange={(e) => handleFieldChange("document_type", e.target.value || null)}
                        placeholder="e.g., Statement, Notice, Letter"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Letter Date</Label>
                        <Input
                          type="date"
                          value={formData.letter_date || ""}
                          onChange={(e) => handleFieldChange("letter_date", e.target.value || null)}
                        />
                      </div>
                      <div>
                        <Label>Period End Date</Label>
                        <Input
                          type="date"
                          value={formData.period_end_date || ""}
                          onChange={(e) => handleFieldChange("period_end_date", e.target.value || null)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Account Last 4</Label>
                      <Input
                        value={formData.account_last4 || ""}
                        onChange={(e) => handleFieldChange("account_last4", e.target.value || null)}
                        placeholder="Last 4 digits"
                        maxLength={10}
                      />
                    </div>
                  </>
                )}

                {/* INVOICE FIELDS */}
                {docTypeCategory === "invoice" && (
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
                          <SelectItem value="PAYABLE">Payable (Bill to Pay)</SelectItem>
                          <SelectItem value="RECEIVABLE">Receivable (Invoice We Sent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>
                        {formData.invoice_type === "PAYABLE" ? "Vendor" : "Client"}
                      </Label>
                      <Input
                        value={formData.party || ""}
                        onChange={(e) => handleFieldChange("party", e.target.value || null)}
                        placeholder={
                          formData.invoice_type === "PAYABLE"
                            ? "Vendor company name"
                            : "Client company name"
                        }
                      />
                    </div>

                    <div>
                      <Label>Sub-Party (optional)</Label>
                      <Input
                        value={formData.sub_party || ""}
                        onChange={(e) => handleFieldChange("sub_party", e.target.value || null)}
                        placeholder="Department or contact"
                      />
                    </div>

                    <div>
                      <Label>Document Type</Label>
                      <Input
                        value={formData.document_type || ""}
                        onChange={(e) => handleFieldChange("document_type", e.target.value || null)}
                        placeholder="e.g., Invoice"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Amount ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.amount || ""}
                          onChange={(e) =>
                            handleFieldChange("amount", e.target.value ? parseFloat(e.target.value) : null)
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Due Date</Label>
                        <Input
                          type="date"
                          value={formData.due_date || ""}
                          onChange={(e) => handleFieldChange("due_date", e.target.value || null)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Notes (for all types) */}
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={formData.notes || ""}
                    onChange={(e) => handleFieldChange("notes", e.target.value || null)}
                    placeholder="Additional context"
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>

            {/* Action Buttons */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/documents-v2/review")}
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
                <Button onClick={handleApprove} disabled={saving || checkingDuplicates}>
                  {checkingDuplicates ? "Checking..." : saving ? "Approving..." : "Approve & Archive"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Duplicate Detection Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Potential Duplicates Found</DialogTitle>
            <DialogDescription>
              The following archived documents may be similar to the one you&apos;re approving.
              Please review before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-3">
              {similarDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded border p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => window.open(`/documents-v2/review/${doc.id}`, "_blank")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{doc.party || "Unknown party"}</p>
                      <p className="text-sm text-gray-500">{doc.original_filename}</p>
                    </div>
                    <Badge variant="outline">{doc.document_type || "Unknown"}</Badge>
                  </div>
                  {doc.ai_summary && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{doc.ai_summary}</p>
                  )}
                  <p className="mt-2 text-xs text-amber-600 font-medium">
                    ⚠️ {doc.similarity_reason}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateModal(false)}>
              Cancel
            </Button>
            <Button onClick={performApproval} disabled={saving}>
              {saving ? "Approving..." : "Archive Anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
