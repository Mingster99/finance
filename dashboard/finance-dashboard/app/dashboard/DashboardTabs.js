"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/transactions", label: "Transactions" },
];

export default function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav className="tab-nav" aria-label="Dashboard sections">
      {TABS.map((tab) => {
        // Overview is an exact match; other tabs match their subtree.
        const active =
          tab.href === "/dashboard"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
