"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconFile, IconGrid } from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
;

export function CanvasSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" id="sidebar">
      <div className="logo">
        <img src="/assets/logo.svg" alt="Logo" />
      </div>

      <nav className="nav-section">
        <p className="nav-label">Library</p>
        <Link
          href="/"
          className={`nav-item ${pathname === "/" ? "active" : ""}`}
        >
          <HugeIcon icon={IconGrid} size={18} />
          All bookmarks
        </Link>
        <Link
          href="/canvas"
          className={`nav-item ${pathname === "/canvas" ? "active" : ""}`}
        >
          <HugeIcon icon={IconFile} size={18} />
          Canvas
        </Link>
      </nav>
    </aside>
  );
}
