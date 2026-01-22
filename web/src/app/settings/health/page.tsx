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

const serviceIcons: { [key: string]: string } = {
  Snowflake: "❄️",
  BigTime: "⏱️",
  QuickBooks: "📗",
  Pipedrive: "🔵",
  "Google Drive": "📁",
  "Google Docs": "📄",
  "Config Data": "⚙️",
  Gmail: "📧",
  "Claude API": "🤖",
  "Gemini API": "✨",
};

const serviceDescriptions: { [key: string]: string } = {
  Snowflake: "Data warehouse - stores all configuration and app data",
  BigTime: "Time tracking - employee hours and project billing",
  QuickBooks: "Financial data - invoices and revenue",
  Pipedrive: "CRM - deals, pipeline, and bookings",
  "Google Drive": "File storage - vault folders and documents",
  "Google Docs": "Contract standards template for AI review",
  "Config Data": "Staff, benefits, rules (migrated from Sheets)",
  Gmail: "Email notifications and reports",
  "Claude API": "AI analysis and document review",
  "Gemini API": "AI vault processing (cost-effective)",
};

export default function HealthCheckPage() {
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);

  const runHealthCheck = async (sendTestEmail: boolean = false) => {
    if (sendTestEmail) {
      setSendingEmail(true);
    } else {
      setLoading(true);
    }

    try {
      const url = sendTestEmail ? "/api/health?sendTestEmail=true" : "/api/health";
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to run health check");
      }
      const result: HealthResponse = await response.json();
      setData(result);

      if (sendTestEmail) {
        const gmailResult = result.results["Gmail"];
        if (gmailResult?.status === "success" && gmailResult.message.includes("sent")) {
          toast.success("Test email sent! Check your inbox.");
        } else {
          toast.error("Failed to send test email");
        }
      } else {
        if (result.summary.error > 0) {
          toast.error(`${result.summary.error} service(s) have errors`);
        } else if (result.summary.warning > 0 || result.summary.notConfigured > 0) {
          toast.warning("Some services need attention");
        } else {
          toast.success("All services are healthy!");
        }
      }
    } catch (error) {
      console.error("Health check error:", error);
      toast.error("Failed to run health check");
    } finally {
      setLoading(false);
      setSendingEmail(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "success":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          icon: "bg-emerald-500",
          text: "text-emerald-700",
          badge: "bg-emerald-100 text-emerald-800",
        };
      case "warning":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: "bg-amber-500",
          text: "text-amber-700",
          badge: "bg-amber-100 text-amber-800",
        };
      case "error":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          icon: "bg-red-500",
          text: "text-red-700",
          badge: "bg-red-100 text-red-800",
        };
      default:
        return {
          bg: "bg-slate-50",
          border: "border-slate-200",
          icon: "bg-slate-400",
          text: "text-slate-600",
          badge: "bg-slate-100 text-slate-600",
        };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "success":
        return "Healthy";
      case "warning":
        return "Warning";
      case "error":
        return "Error";
      default:
        return "Not Configured";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="text-4xl">🏥</span>
              Connection Health
            </h1>
            <p className="text-gray-500 mt-1">
              Monitor all external API connections and services
            </p>
          </div>
          <div className="flex gap-3">
            {data && (
              <Button
                variant="outline"
                onClick={() => runHealthCheck(true)}
                disabled={sendingEmail || !data.results["Gmail"] || data.results["Gmail"].status === "not_configured"}
              >
                {sendingEmail ? "Sending..." : "📧 Send Test Email"}
              </Button>
            )}
            <Button onClick={() => runHealthCheck(false)} disabled={loading} size="lg">
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Checking...
                </>
              ) : (
                <>🔍 Run Health Check</>
              )}
            </Button>
          </div>
        </div>

        {data && (
          <>
            {/* Summary Dashboard */}
            <div className="grid grid-cols-5 gap-4">
              <div className="rounded-xl border-2 border-slate-200 bg-white p-5 text-center shadow-sm">
                <p className="text-4xl font-bold text-slate-700">{data.summary.total}</p>
                <p className="text-sm text-slate-500 mt-1">Total Services</p>
              </div>
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm">
                <p className="text-4xl font-bold text-emerald-600">{data.summary.success}</p>
                <p className="text-sm text-emerald-600 mt-1">Healthy</p>
              </div>
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
                <p className="text-4xl font-bold text-amber-600">{data.summary.warning}</p>
                <p className="text-sm text-amber-600 mt-1">Warnings</p>
              </div>
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5 text-center shadow-sm">
                <p className="text-4xl font-bold text-red-600">{data.summary.error}</p>
                <p className="text-sm text-red-600 mt-1">Errors</p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-5 text-center shadow-sm">
                <p className="text-4xl font-bold text-slate-500">{data.summary.notConfigured}</p>
                <p className="text-sm text-slate-500 mt-1">Not Configured</p>
              </div>
            </div>

            {/* Overall Status Banner */}
            {data.summary.error === 0 && data.summary.warning === 0 && data.summary.notConfigured === 0 && (
              <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white shadow-lg">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">🎉</span>
                  <div>
                    <h2 className="text-xl font-bold">All Systems Operational</h2>
                    <p className="text-emerald-100">All {data.summary.total} services are connected and working correctly.</p>
                  </div>
                </div>
              </div>
            )}
            {data.summary.error > 0 && (
              <div className="rounded-xl bg-gradient-to-r from-red-500 to-rose-500 p-6 text-white shadow-lg">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">⚠️</span>
                  <div>
                    <h2 className="text-xl font-bold">Action Required</h2>
                    <p className="text-red-100">
                      {data.summary.error} service(s) have errors. Some apps may not work correctly.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {data.summary.error === 0 && (data.summary.warning > 0 || data.summary.notConfigured > 0) && (
              <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white shadow-lg">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">📋</span>
                  <div>
                    <h2 className="text-xl font-bold">Mostly Good</h2>
                    <p className="text-amber-100">
                      Core services working. {data.summary.notConfigured > 0 && `${data.summary.notConfigured} service(s) not configured.`}
                      {data.summary.warning > 0 && ` ${data.summary.warning} warning(s).`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Service Cards */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-700">Service Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(data.results).map(([service, result]) => {
                  const style = getStatusStyle(result.status);
                  return (
                    <div
                      key={service}
                      className={`rounded-xl border-2 ${style.border} ${style.bg} p-5 shadow-sm transition-all hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{serviceIcons[service] || "🔌"}</span>
                          <div>
                            <h3 className="font-semibold text-slate-800">{service}</h3>
                            <p className="text-xs text-slate-500">{serviceDescriptions[service]}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.badge}`}>
                          {getStatusLabel(result.status)}
                        </span>
                      </div>
                      <div className={`text-sm ${style.text} font-medium mb-2`}>
                        {result.message}
                      </div>
                      <div className="text-xs text-slate-600 bg-white/60 rounded-lg p-3 whitespace-pre-wrap">
                        {result.details}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timestamp */}
            <p className="text-sm text-slate-400 text-center">
              Last checked: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
        )}

        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-16 text-center">
            <span className="text-6xl mb-6 block">🔌</span>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Ready to Check Connections</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Click the button above to test all API connections and verify your services are working correctly.
            </p>

            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-700 text-sm">Data & Storage</h3>
                <ul className="text-sm text-slate-500 space-y-1">
                  <li>❄️ Snowflake</li>
                  <li>📁 Google Drive (5 folders)</li>
                  <li>📄 Google Docs</li>
                  <li>⚙️ Config Data</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-700 text-sm">Business Apps</h3>
                <ul className="text-sm text-slate-500 space-y-1">
                  <li>⏱️ BigTime</li>
                  <li>📗 QuickBooks</li>
                  <li>🔵 Pipedrive</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-700 text-sm">AI & Comms</h3>
                <ul className="text-sm text-slate-500 space-y-1">
                  <li>🤖 Claude API</li>
                  <li>✨ Gemini API</li>
                  <li>📧 Gmail</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
