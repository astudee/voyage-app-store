"use client";

import { useState, useCallback, useRef } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type InputMethod = "upload" | "paste" | "google-doc";

export default function ContractReviewPage() {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [contractText, setContractText] = useState("");
  const [contractName, setContractName] = useState("Uploaded Contract");

  const [inputMethod, setInputMethod] = useState<InputMethod>("upload");
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");

    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textParts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      if (pageText.trim()) {
        textParts.push(`--- Page ${i} ---\n${pageText}`);
      }
    }

    return textParts.join("\n\n");
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const processFile = useCallback(async (file: File) => {
    setExtracting(true);
    setContractName(file.name);

    try {
      let text = "";
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        text = await extractTextFromPdf(file);
      } else if (fileName.endsWith(".docx")) {
        text = await extractTextFromDocx(file);
      } else if (fileName.endsWith(".txt")) {
        text = await file.text();
      } else {
        throw new Error("Unsupported file format. Please use PDF, DOCX, or TXT.");
      }

      if (!text || text.trim().length < 100) {
        throw new Error("Could not extract enough text from the file. It may be scanned/image-based.");
      }

      setContractText(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters from ${file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to extract text";
      toast.error(message);
      setContractText("");
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith(".pdf") || fileName.endsWith(".docx") || fileName.endsWith(".txt")) {
        processFile(file);
      } else {
        toast.error("Unsupported file format. Please use PDF, DOCX, or TXT.");
      }
    }
  };

  const fetchGoogleDoc = async () => {
    if (!googleDocUrl) {
      toast.error("Please enter a Google Doc URL");
      return;
    }

    // Extract doc ID from URL
    const match = googleDocUrl.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      toast.error("Invalid Google Doc URL");
      return;
    }

    const docId = match[1];
    setExtracting(true);
    setContractName(`Google Doc ${docId.slice(0, 8)}...`);

    try {
      const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
      const response = await fetch(exportUrl);

      if (!response.ok) {
        throw new Error("Could not fetch Google Doc. Make sure it's shared as 'Anyone with the link can view'.");
      }

      const text = await response.text();

      if (!text || text.trim().length < 100) {
        throw new Error("Document appears to be empty or too short.");
      }

      setContractText(text);
      toast.success(`Fetched ${text.length.toLocaleString()} characters from Google Doc`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch Google Doc";
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  };

  const reviewContract = async () => {
    if (!contractText || contractText.trim().length < 100) {
      toast.error("Please provide contract text (at least 100 characters)");
      return;
    }

    setLoading(true);
    setReview(null);

    try {
      const response = await fetch("/api/contract-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractText }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to review contract");
      }

      const result = await response.json();
      setReview(result.review);
      toast.success("Contract review complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to review contract";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const downloadReview = () => {
    if (!review) return;

    const blob = new Blob([review], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Contract_Review_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Review downloaded!");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">📝</span>
            Contract Reviewer
          </h1>
          <p className="text-gray-500 mt-1">
            Upload a contract for review against Voyage Advisory&apos;s contract standards
          </p>
        </div>

        {/* Input Method Selection */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Contract Input</h3>

          <div className="flex gap-2 mb-4">
            <Button
              variant={inputMethod === "upload" ? "default" : "outline"}
              onClick={() => setInputMethod("upload")}
              size="sm"
            >
              Upload File
            </Button>
            <Button
              variant={inputMethod === "paste" ? "default" : "outline"}
              onClick={() => setInputMethod("paste")}
              size="sm"
            >
              Paste Text
            </Button>
            <Button
              variant={inputMethod === "google-doc" ? "default" : "outline"}
              onClick={() => setInputMethod("google-doc")}
              size="sm"
            >
              Google Doc URL
            </Button>
          </div>

          {inputMethod === "upload" && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={extracting}
                />
                {extracting ? (
                  <div className="animate-pulse">
                    <span className="text-4xl block mb-2">⏳</span>
                    <span className="font-medium text-gray-600">Extracting text...</span>
                  </div>
                ) : isDragging ? (
                  <div>
                    <span className="text-4xl block mb-2">📥</span>
                    <span className="font-medium text-blue-600">Drop file here</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl block mb-2">📄</span>
                    <span className="font-medium text-gray-600">
                      Drag & drop or click to upload
                    </span>
                    <p className="text-sm text-gray-400 mt-1">PDF, DOCX, or TXT</p>
                  </div>
                )}
              </div>
              {contractText && (
                <div className="text-sm text-green-600">
                  ✓ Loaded: {contractName} ({contractText.length.toLocaleString()} characters)
                </div>
              )}
            </div>
          )}

          {inputMethod === "paste" && (
            <div className="space-y-4">
              <Textarea
                placeholder="Paste the full contract text here..."
                value={contractText}
                onChange={(e) => {
                  setContractText(e.target.value);
                  setContractName("Pasted Contract");
                }}
                className="min-h-[300px] font-mono text-sm"
              />
              <div className="text-sm text-gray-500">
                {contractText.length.toLocaleString()} characters
              </div>
            </div>
          )}

          {inputMethod === "google-doc" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://docs.google.com/document/d/..."
                  value={googleDocUrl}
                  onChange={(e) => setGoogleDocUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={fetchGoogleDoc} disabled={extracting}>
                  {extracting ? "Fetching..." : "Fetch"}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Make sure the document is shared as &quot;Anyone with the link can view&quot;
              </p>
              {contractText && (
                <div className="text-sm text-green-600">
                  ✓ Loaded: {contractName} ({contractText.length.toLocaleString()} characters)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        {contractText && (
          <div className="bg-white rounded-xl border p-6">
            <h3 className="text-lg font-semibold mb-4">Contract Preview</h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
              <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono">
                {contractText.slice(0, 2000)}
                {contractText.length > 2000 && "..."}
              </pre>
            </div>
          </div>
        )}

        {/* Review Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={reviewContract}
            disabled={loading || !contractText || contractText.length < 100}
            className="px-8"
          >
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Analyzing with Claude AI...
              </>
            ) : (
              "🔍 Review Contract"
            )}
          </Button>
        </div>

        {loading && (
          <div className="text-center text-gray-500">
            <p>This may take 1-2 minutes for long contracts...</p>
          </div>
        )}

        {/* Review Results */}
        {review && (
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Contract Review Results</h3>
              <Button variant="outline" size="sm" onClick={downloadReview}>
                📥 Download
              </Button>
            </div>

            <div className="prose prose-sm max-w-none">
              {review.split("\n").map((line, i) => {
                const trimmed = line.trim();

                // Main headings
                if (trimmed.startsWith("### ")) {
                  return (
                    <h2 key={i} className="text-xl font-bold text-blue-800 mt-6 mb-3 border-b pb-2">
                      {trimmed.replace("### ", "").replace(/\*\*/g, "")}
                    </h2>
                  );
                }

                // Numbered headings
                if (/^\d+\.\s/.test(trimmed)) {
                  return (
                    <h3 key={i} className="text-lg font-semibold text-gray-700 mt-4 mb-2">
                      {trimmed}
                    </h3>
                  );
                }

                // Bullet points
                if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
                  const text = trimmed.replace(/^[•\-]\s/, "");
                  return (
                    <div key={i} className="ml-4 my-2 flex">
                      <span className="mr-2">•</span>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: text
                            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                            .replace(/`([^`]+)`/g, "<code class='bg-gray-100 px-1 rounded'>$1</code>"),
                        }}
                      />
                    </div>
                  );
                }

                // Empty lines
                if (!trimmed) {
                  return <div key={i} className="h-2" />;
                }

                // Regular paragraphs
                return (
                  <p
                    key={i}
                    className="my-2"
                    dangerouslySetInnerHTML={{
                      __html: trimmed
                        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                        .replace(/`([^`]+)`/g, "<code class='bg-gray-100 px-1 rounded'>$1</code>"),
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!review && !loading && !contractText && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">📝</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Contract Reviewer</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Upload or paste a contract to get detailed feedback based on Voyage Advisory&apos;s contract standards.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Review Categories:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Limitation of Liability</li>
                <li>Work Product and Intellectual Property</li>
                <li>Payment Terms</li>
                <li>Indemnification</li>
                <li>Confidentiality</li>
                <li>Termination</li>
                <li>Governing Law and Venue</li>
                <li>Entity Names and Signature Blocks</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
