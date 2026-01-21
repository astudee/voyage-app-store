"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Home", href: "/" },
  {
    name: "Settings",
    href: "/settings",
    children: [
      { name: "Staff", href: "/settings/staff" },
      { name: "Benefits", href: "/settings/benefits" },
      { name: "Commission Rules", href: "/settings/rules" },
      { name: "Offsets", href: "/settings/offsets" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900 text-white">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold">Voyage App Store</h1>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => (
          <div key={item.name}>
            <Link
              href={item.href}
              className={`group flex items-center rounded-md px-2 py-2 text-sm font-medium ${
                pathname === item.href
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {item.name}
            </Link>
            {item.children && (
              <div className="ml-4 mt-1 space-y-1">
                {item.children.map((child) => (
                  <Link
                    key={child.name}
                    href={child.href}
                    className={`group flex items-center rounded-md px-2 py-2 text-sm ${
                      pathname === child.href || pathname.startsWith(child.href + "/")
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <p className="text-gray-400">Signed in as</p>
            <p className="font-medium">{session?.user?.name || "User"}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-gray-400 hover:text-white"
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
