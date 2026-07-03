"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconDelete, IconFolderAdd, IconFolderOpen, IconMoreHorizontal, IconPencil } from "@/components/ui/icons";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderCreateDialog } from "./FolderCreateDialog";
import { FolderRenameDialog } from "./FolderRenameDialog";
import { FolderDeleteDialog } from "./FolderDeleteDialog";
import type { BookmarkFolderTreeNode } from "@/lib/types";

type FolderTreeItemProps = {
  node: BookmarkFolderTreeNode;
};

export function FolderTreeItem({
  node,
}: FolderTreeItemProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createSubfolderOpen, setCreateSubfolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = pathname === `/folders/${node.id}`;

  function handleMenuToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((v) => !v);
  }

  function handleMenuBlur(e: React.FocusEvent) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      setMenuOpen(false);
    }
  }

  return (
    <li className={`folder-tree-item-wrapper folder-tree-item-depth-0`}>
      <div
        className={[
          "folder-tree-item",
          isActive ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link
          href={`/folders/${node.id}`}
          className={`folder-tree-item-link`}
          title={node.name}
        >
          <HugeIcon icon={IconFolderOpen}
            size={18}
            aria-hidden="true"
            style={node.color ? { color: node.color } : undefined}
          />
          <span className="folder-tree-item-name">{node.name}</span>
        </Link>

        <div className="folder-tree-actions" ref={menuRef} onBlur={handleMenuBlur}>
          <button
            type="button"
            className="folder-tree-action-btn"
            onClick={handleMenuToggle}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More options for ${node.name}`}
          >
            <HugeIcon icon={IconMoreHorizontal} size={18} />
          </button>

          {menuOpen && (
            <div className="folder-tree-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="folder-tree-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setCreateSubfolderOpen(true);
                }}
              >
                <HugeIcon icon={IconFolderAdd} size={18} />
                New subfolder
              </button>
              <button
                type="button"
                role="menuitem"
                className="folder-tree-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setRenameOpen(true);
                }}
              >
                <HugeIcon icon={IconPencil} size={18} />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="folder-tree-menu-item folder-tree-menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <HugeIcon icon={IconDelete} size={18} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <FolderCreateDialog
        open={createSubfolderOpen}
        onOpenChange={setCreateSubfolderOpen}
        parentFolder={node}
      />
      <FolderRenameDialog
        folder={node}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <FolderDeleteDialog
        folder={node}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </li>
  );
}
