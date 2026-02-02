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
  // Core fields
  document_type_category: "contract" | "document" | "invoice" | null;
  party: string | null;
  sub_party: string | null;
  document_type: string | null;
  document_date: string | null;
  notes: string | null;
  ai_summary: string | null;
  // Contract-specific
  document_category: string | null;
  contract_type: string | null;
  // Invoice-specific
  amount: number | null;
  due_date: string | null;
  // AI fields
  ai_confidence_score: number | null;
  ai_model_used: string | null;
  // Legacy - kept for backwards compatibility but not shown in UI
  is_contract: boolean | null;
  executed_date: string | null;
  letter_date: string | null;
  period_end_date: string | null;
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

      // Migrate legacy date fields to document_date if needed
      if (!data.document_date && (data.executed_date || data.letter_date || data.period_end_date)) {
        data.document_date = data.executed_date || data.letter_date || data.period_end_date;
      }

      setDocument(data);
      setFormData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchPdfUrl = async () => {
    // Use the view endpoint which proxies the PDF with proper Content-Disposition
    // This ensures the filename is correct when users save from the browser's PDF viewer
    setPdfUrl(`/api/documents-v2/${id}/view`);
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

  const handleDownload = async () => {
    window.open(`/api/documents-v2/${id}/download`, "_blank");
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
                  <span className="font-semibold break-words" title={document?.original_filename}>
                    {document?.original_filename}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    Download
                  </Button>
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
                {/* Document Type Category - ALWAYS SHOWN */}
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

                {/* CONTRACT-SPECIFIC: Category */}
                {docTypeCategory === "contract" && (
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
                )}

                {/* CONTRACT-SPECIFIC: Contract Type */}
                {docTypeCategory === "contract" && (
                  <div>
                    <Label>Contract Type</Label>
                    <Input
                      value={formData.contract_type || ""}
                      onChange={(e) => handleFieldChange("contract_type", e.target.value || null)}
                      placeholder="e.g., MSA, SOW, NDA, SubK, Offer Letter"
                    />
                  </div>
                )}

                {/* Party - ALWAYS SHOWN */}
                <div>
                  <Label>Party</Label>
                  <Input
                    value={formData.party || ""}
                    onChange={(e) => handleFieldChange("party", e.target.value || null)}
                    placeholder="Company or person name"
                  />
                </div>

                {/* Sub-Party - ALWAYS SHOWN */}
                <div>
                  <Label>Sub-Party</Label>
                  <Input
                    value={formData.sub_party || ""}
                    onChange={(e) => handleFieldChange("sub_party", e.target.value || null)}
                    placeholder="Secondary entity (e.g., individual name, department)"
                  />
                </div>

                {/* Document Type (specific type like Statement, Notice) - ALWAYS SHOWN */}
                <div>
                  <Label>Type</Label>
                  <Input
                    value={formData.document_type || ""}
                    onChange={(e) => handleFieldChange("document_type", e.target.value || null)}
                    placeholder="e.g., Statement, Notice, Letter, Invoice"
                  />
                </div>

                {/* Document Date - ALWAYS SHOWN */}
                <div>
                  <Label>Document Date</Label>
                  <Input
                    type="date"
                    value={formData.document_date || ""}
                    onChange={(e) => handleFieldChange("document_date", e.target.value || null)}
                  />
                </div>

                {/* INVOICE-SPECIFIC: Amount */}
                {docTypeCategory === "invoice" && (
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
                )}

                {/* INVOICE-SPECIFIC: Due Date */}
                {docTypeCategory === "invoice" && (
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={formData.due_date || ""}
                      onChange={(e) => handleFieldChange("due_date", e.target.value || null)}
                    />
                  </div>
                )}

                {/* Notes - ALWAYS SHOWN */}
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes || ""}
                    onChange={(e) => handleFieldChange("notes", e.target.value || null)}
                    placeholder="Additional context"
                    rows={3}
                  />
                </div>

                {/* AI Summary (read-only) - ALWAYS SHOWN */}
                <div>
                  <Label>AI Summary</Label>
                  <div className="mt-1 rounded border bg-gray-50 p-3 text-sm text-gray-700">
                    {formData.ai_summary || (
                      <span className="italic text-gray-400">
                        No AI summary available. Re-process the document to generate one.
                      </span>
                    )}
                  </div>
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
                    {doc.similarity_reason}
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
