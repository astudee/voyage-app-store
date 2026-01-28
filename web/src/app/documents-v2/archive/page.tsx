"use client";

import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ArchivePage() {
  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Archive</h1>
            <p className="text-sm text-gray-500">
              Browse and search archived documents
            </p>
          </div>
          <Link href="/documents-v2/upload">
            <Button>Upload Documents</Button>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-4 flex gap-2 border-b">
          <Link href="/documents-v2/queue">
            <Button variant="ghost" className="rounded-none">
              Queue
            </Button>
          </Link>
          <Link href="/documents-v2/archive">
            <Button variant="ghost" className="border-b-2 border-blue-500 rounded-none">
              Archive
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">
              The archive view will allow you to browse, search, and filter
              documents that have been reviewed and classified. Features will include:
            </p>
            <ul className="mt-4 list-disc pl-6 text-gray-500 space-y-1">
              <li>Search by counterparty, document type, date range</li>
              <li>Filter by contracts vs documents</li>
              <li>View document details and AI-extracted metadata</li>
              <li>Download original files</li>
              <li>Edit classifications if needed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
