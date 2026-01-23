"use client";

import { useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type TabType = "emails" | "upload" | "process";

interface ProcessedEmail {
  type: string;
  name: string;
  subject: string;
}

interface UploadedFile {
  name: string;
  id: string;
}

interface ProcessedDoc {
  name: string;
  ai: string;
  kind: string;
}

interface ToFileItem {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
}

export default function DocumentManagerPage() {
  const [activeTab, setActiveTab] = useState<TabType>("emails");

  // Email processing state
  const [emailLoading, setEmailLoading] = useState(false);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [emailErrors, setEmailErrors] = useState<string[]>([]);

  // Upload state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  // Process to vault state
  const [processLoading, setProcessLoading] = useState(false);
  const [processedDocs, setProcessedDocs] = useState<ProcessedDoc[]>([]);
  const [processErrors, setProcessErrors] = useState<string[]>([]);
  const [toFileItems, setToFileItems] = useState<ToFileItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Process vault emails
  const processEmails = async () => {
    setEmailLoading(true);
    setProcessedEmails([]);
    setEmailErrors([]);

    try {
      const response = await fetch("/api/document-manager/emails", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to process emails");
      }

      const result = await response.json();
      setProcessedEmails(result.processed || []);
      setEmailErrors(result.errors || []);

      if (result.processed?.length > 0) {
        toast.success(`Processed ${result.processed.length} items from vault emails`);
      } else {
        toast.info(result.message || "No emails to process");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process emails";
      toast.error(message);
    } finally {
      setEmailLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadLoading(true);
    setUploadedFiles([]);
    setUploadErrors([]);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const response = await fetch("/api/document-manager/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload files");
      }

      const result = await response.json();
      setUploadedFiles(result.uploaded || []);
      setUploadErrors(result.errors || []);

      if (result.uploaded?.length > 0) {
        toast.success(`Uploaded ${result.uploaded.length} files to 'to file' folder`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload files";
      toast.error(message);
    } finally {
      setUploadLoading(false);
      // Reset file input
      event.target.value = "";
    }
  }, []);

  // List files in "to file" folder
  const loadToFileItems = async () => {
    setListLoading(true);
    try {
      const response = await fetch("/api/document-manager/process");

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to list files");
      }

      const result = await response.json();
      setToFileItems(result.files || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list files";
      toast.error(message);
    } finally {
      setListLoading(false);
    }
  };

  // Process files to vault
  const processToVault = async () => {
    setProcessLoading(true);
    setProcessedDocs([]);
    setProcessErrors([]);

    try {
      const response = await fetch("/api/document-manager/process", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to process files");
      }

      const result = await response.json();
      setProcessedDocs(result.processed || []);
      setProcessErrors(result.errors || []);

      if (result.processed?.length > 0) {
        toast.success(`Processed ${result.processed.length} files to vault`);
        // Refresh list
        loadToFileItems();
      } else {
        toast.info(result.message || "No files to process");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process files";
      toast.error(message);
    } finally {
      setProcessLoading(false);
    }
  };

  const contracts = processedDocs.filter((d) => d.kind === "CONTRACT");
  const documents = processedDocs.filter((d) => d.kind === "DOCUMENT");
  const attachments = processedEmails.filter((e) => e.type === "Attachment");
  const emailPdfs = processedEmails.filter((e) => e.type === "Email Text");

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">📁</span>
            Document Manager
          </h1>
          <p className="text-gray-500 mt-1">
            Process emails, upload files, and automatically classify and archive documents
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl border p-2">
          <div className="flex gap-2">
            <Button
              variant={activeTab === "emails" ? "default" : "outline"}
              onClick={() => setActiveTab("emails")}
              className="flex-1"
            >
              Process Vault Emails
            </Button>
            <Button
              variant={activeTab === "upload" ? "default" : "outline"}
              onClick={() => setActiveTab("upload")}
              className="flex-1"
            >
              Upload Files
            </Button>
            <Button
              variant={activeTab === "process" ? "default" : "outline"}
              onClick={() => {
                setActiveTab("process");
                loadToFileItems();
              }}
              className="flex-1"
            >
              File to Vault
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "emails" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Process Vault Emails</h3>
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>How it works:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Emails sent to vault@voyageadvisory.com get the &quot;Vault&quot; label</li>
                  <li>If email has attachments → saves attachments to Drive</li>
                  <li>If email has no attachments → saves email as text file</li>
                  <li>Files go to the &quot;to file&quot; folder for processing</li>
                  <li>Removes &quot;Vault&quot; label after processing</li>
                </ul>
              </div>

              <Button
                size="lg"
                onClick={processEmails}
                disabled={emailLoading}
                className="w-full"
              >
                {emailLoading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Processing Vault Emails...
                  </>
                ) : (
                  "Process Vault Emails"
                )}
              </Button>
            </div>

            {/* Email Results */}
            {(processedEmails.length > 0 || emailErrors.length > 0) && (
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-lg font-semibold mb-4">Results</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{attachments.length}</div>
                    <div className="text-sm text-gray-500">Attachments Saved</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{emailPdfs.length}</div>
                    <div className="text-sm text-gray-500">Emails Converted</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{emailErrors.length}</div>
                    <div className="text-sm text-gray-500">Errors</div>
                  </div>
                </div>

                {processedEmails.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700">Processed Items:</h4>
                    {processedEmails.map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded p-3">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          {item.type} • From: {item.subject}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {emailErrors.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-medium text-red-700">Errors:</h4>
                    {emailErrors.map((error, i) => (
                      <div key={i} className="bg-red-50 text-red-700 rounded p-3 text-sm">
                        {error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Upload Files</h3>
              <p className="text-gray-500 mb-4">
                Upload files directly to the &quot;to file&quot; folder for processing. They will be ready for AI classification and filing.
              </p>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  disabled={uploadLoading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-gray-500 hover:text-gray-700"
                >
                  {uploadLoading ? (
                    <span className="animate-pulse">Uploading...</span>
                  ) : (
                    <>
                      <span className="text-5xl block mb-2">📄</span>
                      <span className="font-medium block">Click to upload files</span>
                      <span className="text-sm block mt-1">PDF, DOC, DOCX, XLS, XLSX, PNG, JPG</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Upload Results */}
            {(uploadedFiles.length > 0 || uploadErrors.length > 0) && (
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-lg font-semibold mb-4">Upload Results</h3>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <h4 className="font-medium text-green-700">Uploaded Successfully:</h4>
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="bg-green-50 rounded p-3 text-green-800">
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}

                {uploadErrors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-red-700">Errors:</h4>
                    {uploadErrors.map((error, i) => (
                      <div key={i} className="bg-red-50 text-red-700 rounded p-3 text-sm">
                        {error}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">
                    Files are now in the &quot;to file&quot; folder. Go to the &quot;File to Vault&quot; tab to process them.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "process" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">File to Vault</h3>
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>How it works:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>PDFs in the &quot;to file&quot; folder are analyzed by AI (Gemini/Claude)</li>
                  <li>Each file is classified as Contract or Document</li>
                  <li>Files are renamed with standardized naming conventions</li>
                  <li>Contracts go to the contracts archive folder</li>
                  <li>Documents go to the documents archive folder</li>
                </ul>
              </div>

              {/* Files in queue */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-700">Files in Queue ({toFileItems.length})</h4>
                  <Button variant="outline" size="sm" onClick={loadToFileItems} disabled={listLoading}>
                    {listLoading ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                {toFileItems.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {toFileItems.map((item) => (
                      <div key={item.id} className="px-3 py-2 border-b last:border-b-0 flex items-center justify-between">
                        <span className="truncate">{item.name}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(item.createdTime).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 text-center text-gray-500">
                    No files in queue
                  </div>
                )}
              </div>

              <Button
                size="lg"
                onClick={processToVault}
                disabled={processLoading || toFileItems.length === 0}
                className="w-full"
              >
                {processLoading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Processing with AI...
                  </>
                ) : (
                  "Process Files to Vault"
                )}
              </Button>

              {processLoading && (
                <p className="text-sm text-gray-500 text-center mt-2">
                  This may take a while depending on the number of files...
                </p>
              )}
            </div>

            {/* Process Results */}
            {(processedDocs.length > 0 || processErrors.length > 0) && (
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-lg font-semibold mb-4">Results</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{contracts.length}</div>
                    <div className="text-sm text-gray-500">Contracts</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{documents.length}</div>
                    <div className="text-sm text-gray-500">Documents</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{processErrors.length}</div>
                    <div className="text-sm text-gray-500">Errors</div>
                  </div>
                </div>

                {contracts.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-blue-700 mb-2">Contracts:</h4>
                    {contracts.map((item, i) => (
                      <div key={i} className="bg-blue-50 rounded p-3 mb-2">
                        <div className="font-medium text-blue-800">{item.name}</div>
                        <div className="text-xs text-blue-600">AI: {item.ai}</div>
                      </div>
                    ))}
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-green-700 mb-2">Documents:</h4>
                    {documents.map((item, i) => (
                      <div key={i} className="bg-green-50 rounded p-3 mb-2">
                        <div className="font-medium text-green-800">{item.name}</div>
                        <div className="text-xs text-green-600">AI: {item.ai}</div>
                      </div>
                    ))}
                  </div>
                )}

                {processErrors.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-700 mb-2">Errors:</h4>
                    {processErrors.map((error, i) => (
                      <div key={i} className="bg-red-50 text-red-700 rounded p-3 text-sm mb-2">
                        {error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Instructions when empty */}
        {activeTab === "emails" && processedEmails.length === 0 && emailErrors.length === 0 && !emailLoading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">📧</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Process Vault Emails</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Forward emails to vault@voyageadvisory.com to have them automatically saved to Google Drive.
            </p>
          </div>
        )}

        {activeTab === "upload" && uploadedFiles.length === 0 && uploadErrors.length === 0 && !uploadLoading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">📤</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Upload Files</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Upload PDF, Word, Excel, or image files to queue them for AI classification and filing.
            </p>
          </div>
        )}

        {activeTab === "process" && processedDocs.length === 0 && processErrors.length === 0 && !processLoading && toFileItems.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">🗂️</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">File to Vault</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Process emails or upload files first, then use this tab to classify and archive them.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
