"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface HealthResult {
  status: "success" | "warning" | "error" | "not_configured";
  message: string;
  details: string;
}

interface HealthResponse {
  results: { [service: string]: HealthResult };
  summary: {
    total: number;
    success: number;
    warning: number;
    error: number;
    notConfigured: number;
  };
  timestamp: string;
}

const statusIcons: { [key: string]: string } = {
  success: "✅",
  warning: "⚠️",
  error: "❌",
  not_configured: "⚙️",
};

const statusColors: { [key: string]: string } = {
  success: "bg-green-50 border-green-200",
  warning: "bg-yellow-50 border-yellow-200",
  error: "bg-red-50 border-red-200",
  not_configured: "bg-gray-50 border-gray-200",
};

const statusTextColors: { [key: string]: string } = {
  success: "text-green-700",
  warning: "text-yellow-700",
  error: "text-red-700",
  not_configured: "text-gray-500",
};

export default function HealthCheckPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/health");
      if (!response.ok) {
        throw new Error("Failed to run health check");
      }
      const result: HealthResponse = await response.json();
      setData(result);

      // Show toast based on results
      if (result.summary.error > 0) {
        toast.error(`${result.summary.error} service(s) have errors`);
      } else if (result.summary.warning > 0) {
        toast.warning(`${result.summary.warning} service(s) have warnings`);
      } else {
        toast.success("All configured services are healthy");
      }
    } catch (error) {
      console.error("Health check error:", error);
      toast.error("Failed to run health check");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Connection Health</h1>
          <p className="text-gray-500">
            Test connections to all external APIs and services
          </p>
        </div>

        <Button onClick={runHealthCheck} disabled={loading}>
          {loading ? "Checking..." : "Run Health Check"}
        </Button>

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="rounded-lg border bg-white p-4 text-center">
                <p className="text-2xl font-bold">{data.summary.total}</p>
                <p className="text-sm text-gray-500">Total Services</p>
              </div>
              <div className="rounded-lg border bg-green-50 border-green-200 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{data.summary.success}</p>
                <p className="text-sm text-green-600">Healthy</p>
              </div>
              <div className="rounded-lg border bg-yellow-50 border-yellow-200 p-4 text-center">
                <p className="text-2xl font-bold text-yellow-700">{data.summary.warning}</p>
                <p className="text-sm text-yellow-600">Warnings</p>
              </div>
              <div className="rounded-lg border bg-red-50 border-red-200 p-4 text-center">
                <p className="text-2xl font-bold text-red-700">{data.summary.error}</p>
                <p className="text-sm text-red-600">Errors</p>
              </div>
              <div className="rounded-lg border bg-gray-50 border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-gray-500">{data.summary.notConfigured}</p>
                <p className="text-sm text-gray-500">Not Configured</p>
              </div>
            </div>

            {/* Overall Status Banner */}
            {data.summary.error === 0 && data.summary.warning === 0 && data.summary.notConfigured === 0 && (
              <div className="rounded-lg bg-green-100 border border-green-300 p-4 text-green-800">
                All systems operational! All apps should work correctly.
              </div>
            )}
            {data.summary.error === 0 && data.summary.warning > 0 && (
              <div className="rounded-lg bg-yellow-100 border border-yellow-300 p-4 text-yellow-800">
                {data.summary.warning} warning(s). Core functionality works but some features may be limited.
              </div>
            )}
            {data.summary.error > 0 && (
              <div className="rounded-lg bg-red-100 border border-red-300 p-4 text-red-800">
                {data.summary.error} error(s) detected. Some apps may not work. Please fix the issues below.
              </div>
            )}

            {/* Service Details */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Service Details</h2>

              {Object.entries(data.results).map(([service, result]) => (
                <div
                  key={service}
                  className={`rounded-lg border p-4 ${statusColors[result.status]}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{statusIcons[result.status]}</span>
                      <div>
                        <h3 className="font-semibold">{service}</h3>
                        <p className={`text-sm ${statusTextColors[result.status]}`}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 bg-white/50 rounded p-2">
                    {result.details}
                  </p>

                  {/* Troubleshooting hints for errors */}
                  {result.status === "error" && (
                    <div className="mt-2 text-sm bg-white rounded p-2 border">
                      <strong>Fix:</strong>{" "}
                      {service === "Snowflake" && "Check SNOWFLAKE_* environment variables in Vercel"}
                      {service === "Pipedrive" && "Check PIPEDRIVE_API_TOKEN in Vercel environment variables"}
                      {service === "BigTime" && "Check BIGTIME_API_KEY and BIGTIME_FIRM_ID in Vercel"}
                      {service === "QuickBooks" && "QuickBooks requires OAuth token refresh"}
                      {service === "Claude API" && "Check CLAUDE_API_KEY in Vercel environment variables"}
                      {service === "Gemini API" && "Check GEMINI_API_KEY in Vercel environment variables"}
                      {service === "Google APIs" && "Check GOOGLE_SERVICE_ACCOUNT_KEY in Vercel"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Timestamp */}
            <p className="text-sm text-gray-400">
              Last checked: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
        )}

        {!data && !loading && (
          <div className="rounded-lg border border-dashed p-12 text-center text-gray-500">
            <p className="mb-4">Click the button above to check all API connections</p>
            <div className="text-left max-w-md mx-auto">
              <h3 className="font-semibold mb-2">Services Checked:</h3>
              <ul className="space-y-1 text-sm">
                <li>Snowflake - Data warehouse</li>
                <li>Pipedrive - CRM and deal tracking</li>
                <li>BigTime - Time tracking</li>
                <li>QuickBooks - Financial data</li>
                <li>Claude API - AI analysis</li>
                <li>Gemini API - AI vault processing</li>
                <li>Google APIs - Drive, Sheets, Gmail</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
