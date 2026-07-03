"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconClock, IconFile, IconGrid } from "@/components/ui/icons";
import { useState } from "react";
import Link from "next/link";
import { useBookmarks } from "@/hooks/useBookmarks";
import { getTagColor } from "@/lib/data";

const BRAND_NAME = "Nyabag";
const SECTION_LIBRARY = "Library";
const SECTION_TAGS = "Tags";
const TEXT_NO_TAGS = "No tags yet";

export function Sidebar() {
  const { bookmarks, activeTag, setActiveTag, activeFilter, setActiveFilter, openAdd } =
    useBookmarks();
  const [logoError, setLogoError] = useState(false);

  const tags = Array.from(new Set(bookmarks.flatMap((b) => b.tags)));

  return (
    <aside className="sidebar" id="sidebar">
      <div className="logo">
        <img src="/assets/logo.svg" alt="Logo"/>
      </div>

      <nav className="nav-section">
        <p className="nav-label">{SECTION_LIBRARY}</p>
        <button
          className={`nav-item ${activeFilter === "all" && activeTag === "All" ? "active" : ""}`}
          onClick={() => { setActiveFilter("all"); setActiveTag("All"); }}
        >
          <HugeIcon icon={IconGrid} size={18} />
          All bookmarks
        </button>
        <button
          className={`nav-item ${activeFilter === "recent" ? "active" : ""}`}
          onClick={() => setActiveFilter("recent")}
        >
          <HugeIcon icon={IconClock} size={18} />
          Recent
        </button>
        <Link href="/canvas" className="nav-item">
          <HugeIcon icon={IconFile} size={18} />
          Notes
        </Link>
      </nav>

      <nav className="nav-section">
        <p className="nav-label">{SECTION_TAGS}</p>
        {tags.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text3)", padding: "0 8px" }}>
            {TEXT_NO_TAGS}
          </p>
        ) : (
          tags.map((t) => (
            <button
              key={t}
              className={`nav-item ${activeTag === t ? "active" : ""}`}
              onClick={() => { setActiveTag(t); setActiveFilter("all"); }}
            >
              <span className="tag-dot" style={{ background: getTagColor(t) }} />
              {t}
            </button>
          ))
        )}
      </nav>

      <div className="sidebar-footer">
        <button className="add-btn-sidebar" onClick={openAdd}>
          <HugeIcon icon={IconAdd} size={18} /> New bookmark
        </button>
      </div>
    </aside>
  );
}
