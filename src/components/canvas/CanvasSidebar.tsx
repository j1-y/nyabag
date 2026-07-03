"use client";

import { FileText, Grid } from "lucide-react";
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
          <Grid size={13} />
          All bookmarks
        </Link>
        <Link
          href="/canvas"
          className={`nav-item ${pathname === "/canvas" ? "active" : ""}`}
        >
          <FileText size={13} />
          Canvas
        </Link>
      </nav>
    </aside>
  );
}
