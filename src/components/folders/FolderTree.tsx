"use client";

import { Inbox, FolderPlus } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderCreateDialog } from "./FolderCreateDialog";
import { FolderTreeItem } from "./FolderTreeItem";
import { buildFolderTree } from "@/lib/folders";
import type { BookmarkFolder } from "@/lib/types";

type FolderTreeProps = {
  folders: BookmarkFolder[];
  collapsed?: boolean;
};

export function FolderTree({ folders, collapsed }: FolderTreeProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const tree = buildFolderTree(folders);
  const uncatActive = pathname === "/folders/inbox";

  if (collapsed) {
    return null; // Sidebar collapsed — don't show tree
  }

  return (
    <div className="folder-tree">
      <div className="folder-tree-section-header">
        <span className="folder-tree-section-label">Design Folders</span>
        <button
          type="button"
          className="folder-tree-new-btn"
          onClick={() => setCreateOpen(true)}
          aria-label="Create design folder"
          title="New folder"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      <nav className="folder-tree-nav" aria-label="Folders">
        {/* Inbox */}
        <Link
          href="/folders/inbox"
          className={`folder-tree-static-item folder-tree-root-item ${uncatActive ? "active" : ""}`}
          title="Inbox bookmarks"
        >
          <Inbox size={16} aria-hidden="true" className="folder-tree-root-icon" />
          <span className="folder-tree-root-label">Inbox</span>
        </Link>

        {/* User folders */}
        {tree.length > 0 ? (
          <ul className="folder-tree-list" role="tree" aria-label="Your folders">
            {tree.map((node) => (
              <FolderTreeItem
                key={node.id}
                node={node}
              />
            ))}
          </ul>
        ) : (
          <p className="folder-tree-empty">No folders yet.</p>
        )}
      </nav>

      <FolderCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
