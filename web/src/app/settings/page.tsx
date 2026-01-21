"use client";

import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const settingsSections = [
  {
    title: "Staff",
    description: "Manage staff members, salaries, and benefits",
    href: "/settings/staff",
    count: null,
  },
  {
    title: "Benefits",
    description: "Configure benefit plans and costs",
    href: "/settings/benefits",
    count: null,
  },
  {
    title: "Commission Rules",
    description: "Set up commission rates and rules",
    href: "/settings/rules",
    count: null,
  },
  {
    title: "Offsets",
    description: "Manage commission offsets",
    href: "/settings/offsets",
    count: null,
  },
];

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-500">Manage your configuration data</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {settingsSections.map((section) => (
            <Link key={section.href} href={section.href}>
              <Card className="h-full transition-shadow hover:shadow-lg">
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-blue-600">Manage &rarr;</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
