"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

const brandColors = {
  darkCharcoal: "#333333",
  darkBlue: "#336699",
  mediumBlue: "#6699cc",
  teal: "#669999",
  gray: "#999999",
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

const navigation = [
  {
    section: "Apps",
    items: [
      { name: "Benefits Calculator", href: "/apps/benefits-calc" },
      { name: "Billable Hours Report", href: "/apps/billable-hours" },
      { name: "Bonus Calculator", href: "/apps/bonus" },
      { name: "Bookings Tracker", href: "/apps/bookings" },
      { name: "Commission Calculator", href: "/apps/commission" },
      { name: "Contract Reviewer", href: "/apps/contract-review" },
      { name: "Contractor Fee Reviewer", href: "/apps/contractor-fees" },
      { name: "Document Manager", href: "/apps/document-manager" },
      { name: "Document Manager 2.0", href: "/documents-v2" },
      { name: "Expense Reviewer", href: "/apps/expense-reviewer" },
      { name: "Forecasted Billable Hours", href: "/apps/forecasted-hours" },
      { name: "Payroll Calculator", href: "/apps/payroll-calc" },
      { name: "Payroll Helper", href: "/apps/payroll-helper" },
      { name: "Project Health Monitor", href: "/apps/project-health" },
      { name: "Resource Checker", href: "/apps/resource-checker" },
      { name: "Revenue Apportionment", href: "/reports/revenue-by-client" },
      { name: "Revenue Forecaster", href: "/apps/revenue-forecast" },
      { name: "Sales Snapshot", href: "/apps/sales-snapshot" },
      { name: "Time Reviewer", href: "/apps/time-reviewer" },
    ],
  },
  {
    section: "Settings",
    items: [
      { name: "Assignments", href: "/settings/assignments" },
      { name: "Benefits", href: "/settings/benefits" },
      { name: "Commission Rules", href: "/settings/rules" },
      { name: "Fixed Fee Projects", href: "/settings/fixed-fee" },
      { name: "Mapping", href: "/settings/mapping" },
      { name: "Offsets", href: "/settings/offsets" },
      { name: "Staff", href: "/settings/staff" },
    ],
  },
  {
    section: "Health",
    items: [
      { name: "BigTime Client Lookup", href: "/health/bigtime" },
      { name: "Connection Health", href: "/health/connection" },
      { name: "QuickBooks Token", href: "/health/quickbooks" },
      { name: "Snowflake Test", href: "/health/snowflake" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Apps: true,
    Settings: true,
    Health: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Don't render sidebar on login page
  if (pathname === "/login") {
    return null;
  }

  return (
    <aside
      className="flex h-screen w-56 flex-col text-white"
      style={{ backgroundColor: brandColors.teal }}
    >
      {/* Logo Section */}
      <div
        className="border-b p-4"
        style={{ borderColor: brandColors.darkBlue + "44" }}
      >
        <Link href="/">
          <Image
            src="/voyage-logo-white.png"
            alt="Voyage Advisory"
            width={180}
            height={60}
            className="mb-2"
            priority
          />
        </Link>
        <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
          App Store
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navigation.map((group) => {
          const isExpanded = expandedSections[group.section] ?? true;

          return (
            <div key={group.section} className="mb-2">
              <button
                onClick={() => toggleSection(group.section)}
                className="flex w-full items-center justify-between px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors hover:bg-white/10"
                style={{ color: brandColors.darkBlue }}
              >
                <span>{group.section}</span>
                <ChevronIcon expanded={isExpanded} />
              </button>
              {isExpanded && (
                <div>
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href + "/"));

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center px-4 py-1.5 text-xs transition-colors"
                        style={{
                          backgroundColor: isActive
                            ? brandColors.darkBlue
                            : "transparent",
                          color: "white",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor =
                              "rgba(255, 255, 255, 0.2)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div
        className="border-t p-4"
        style={{ borderColor: brandColors.darkBlue + "44" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <p style={{ color: "rgba(255, 255, 255, 0.6)" }}>Signed in as</p>
            <p className="font-medium">{session?.user?.name || "User"}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-white hover:bg-white/20 hover:text-white"
          >
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}
