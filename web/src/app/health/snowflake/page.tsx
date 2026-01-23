"use client";

import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TestRecord {
  ID: number;
  USER_TEXT: string;
  CREATED_AT: string;
}

export default function SnowflakeTestPage() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [text, setText] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/snowflake-test");
      if (!response.ok) throw new Error("Failed to fetch records");
      const data = await response.json();
      setRecords(data.records || []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.warning("Please enter some text first");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/snowflake-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save record");
      }

      toast.success("Record saved to Snowflake!");
      setText("");
      fetchRecords();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save record";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Are you sure you want to delete all test records?")) return;

    setClearing(true);
    try {
      const response = await fetch("/api/snowflake-test", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to clear records");

      toast.success("All records deleted");
      setRecords([]);
    } catch (error) {
      console.error("Clear error:", error);
      toast.error("Failed to clear records");
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">❄️</span>
            Snowflake Test
          </h1>
          <p className="text-gray-500 mt-1">
            Verify database connectivity by writing and reading test records
          </p>
        </div>

        {/* Write Form */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Write a Record</h2>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter some text..."
              className="flex-1 bg-white"
              disabled={submitting}
            />
            <Button type="submit" disabled={submitting || !text.trim()}>
              {submitting ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Saving...
                </>
              ) : (
                "Submit to Snowflake"
              )}
            </Button>
          </form>
        </div>

        {/* Recent Records */}
        <div className="rounded-xl border bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Records</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading}>
                {loading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Loading...
                  </>
                ) : (
                  "Refresh"
                )}
              </Button>
              {records.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={clearing}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {clearing ? "Clearing..." : "Clear All"}
                </Button>
              )}
            </div>
          </div>

          {loading && records.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="animate-spin inline-block text-2xl mr-2">⟳</span>
              Loading records...
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl block mb-2">📭</span>
              No records yet. Try writing one above!
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.ID}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-mono text-sm text-gray-400 w-8">
                    #{record.ID}
                  </span>
                  <span className="flex-1 text-gray-800">{record.USER_TEXT}</span>
                  <span className="text-sm text-gray-500">
                    {formatDate(record.CREATED_AT)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connection Info */}
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
          <h3 className="font-semibold text-gray-700 mb-2">How it works</h3>
          <p className="text-sm text-gray-600">
            This page tests read/write connectivity to Snowflake by inserting records into
            the <code className="bg-gray-200 px-1 rounded">TEST_INPUT</code> table.
            If you can write and read records, your Snowflake connection is working correctly.
          </p>
          <div className="mt-3 text-sm text-gray-500">
            <p><strong>Table:</strong> TEST_INPUT</p>
            <p><strong>Test URL:</strong> <code className="bg-gray-200 px-1 rounded">/api/test-snowflake</code> (read-only health check)</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
