"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Client {
  name: string;
  id: number;
  clientId?: string;
}

interface Project {
  clientName: string;
  projectName: string;
  id: number;
  projectCode?: string;
}

interface FetchResult {
  clients: Client[];
  projects: Project[];
  includeInactive: boolean;
}

export default function BigTimeClientLookupPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FetchResult | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/bigtime/clients?includeInactive=${includeInactive}`
      );
      const result = await response.json();

      if (result.success) {
        setData(result);
        toast.success(
          `Found ${result.clients.length} clients and ${result.projects.length} projects`
        );
      } else {
        toast.error(result.error || "Failed to fetch data");
      }
    } catch (error) {
      toast.error("Failed to fetch BigTime data");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = (type: "clients" | "projects") => {
    if (!data) return;

    let csv = "";
    let filename = "";

    if (type === "clients") {
      csv = "Client Name,BigTime Client ID,Client Code\n";
      data.clients.forEach((c) => {
        csv += `"${c.name}",${c.id},"${c.clientId || ""}"\n`;
      });
      filename = "bigtime_client_ids.csv";
    } else {
      csv = "Client Name,Project Name,BigTime Project ID,Project Code\n";
      data.projects.forEach((p) => {
        csv += `"${p.clientName}","${p.projectName}",${p.id},"${p.projectCode || ""}"\n`;
      });
      filename = "bigtime_project_ids.csv";
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredClients =
    data?.clients.filter((c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const filteredProjects =
    data?.projects.filter(
      (p) =>
        p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.projectName.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  return (
    <AppLayout>
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">🔍</span>
            BigTime Client Lookup
          </h1>
          <p className="text-gray-500 mt-1">
            Find BigTime Client IDs and Project IDs to add to Pipedrive
          </p>
        </div>

        {/* Options */}
        <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-6 items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-slate-700">
                Include inactive projects
              </span>
            </label>

            <Button onClick={fetchClients} disabled={loading} size="lg">
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Fetching...
                </>
              ) : (
                "📡 Fetch Client & Project List"
              )}
            </Button>
          </div>

          {!data && !loading && (
            <p className="text-sm text-slate-500 mt-4">
              Click the button to fetch all BigTime clients and projects with
              their IDs.
              {includeInactive
                ? " Will include inactive projects."
                : " Will only show active projects."}
            </p>
          )}
        </div>

        {data && (
          <>
            {/* Summary */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-emerald-800">
                ✅ Found <strong>{data.clients.length}</strong> clients and{" "}
                <strong>{data.projects.length}</strong> projects
                {data.includeInactive ? " (including inactive)" : " (active only)"}
              </p>
            </div>

            {/* Search */}
            <div>
              <Input
                placeholder="🔍 Search by client or project name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Clients Section */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    1️⃣ Clients
                  </h2>
                  <p className="text-sm text-slate-500">
                    {searchTerm
                      ? `Showing ${filteredClients.length} of ${data.clients.length} clients`
                      : `${data.clients.length} clients`}
                  </p>
                </div>
                <Button variant="outline" onClick={() => downloadCSV("clients")}>
                  📥 Download CSV
                </Button>
              </div>

              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Client Name
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        BigTime Client ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-3">{client.name}</td>
                        <td className="p-3 font-mono text-blue-600">
                          {client.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Projects Section */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    2️⃣ Projects
                  </h2>
                  <p className="text-sm text-slate-500">
                    {searchTerm
                      ? `Showing ${filteredProjects.length} of ${data.projects.length} projects`
                      : `${data.projects.length} projects`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => downloadCSV("projects")}
                >
                  📥 Download CSV
                </Button>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Client Name
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Project Name
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        BigTime Project ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => (
                      <tr
                        key={project.id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-3">{project.clientName}</td>
                        <td className="p-3">{project.projectName}</td>
                        <td className="p-3 font-mono text-blue-600">
                          {project.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Help Section */}
        {!data && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              How to Use
            </h2>
            <div className="space-y-4 text-sm text-slate-600">
              <div>
                <h3 className="font-medium text-slate-700">What This Shows:</h3>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>
                    <strong>Section 1: Clients</strong> - Organization names and
                    their BigTime Client IDs
                  </li>
                  <li>
                    <strong>Section 2: Projects</strong> - Project names, their
                    parent client, and BigTime Project IDs
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-slate-700">Options:</h3>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>
                    <strong>Include inactive:</strong> Shows all projects
                    including archived ones
                  </li>
                  <li>
                    <strong>Default:</strong> Only shows active projects
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-slate-700">Steps:</h3>
                <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                  <li>Choose whether to include inactive items</li>
                  <li>Click &quot;Fetch Client &amp; Project List&quot;</li>
                  <li>Find your client/project in the tables (use search)</li>
                  <li>Copy the BigTime Client ID or Project ID</li>
                  <li>Paste it into the corresponding Pipedrive custom field</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
