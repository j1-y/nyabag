"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconDelete, IconFolderAdd, IconPencil } from "@/components/ui/icons";
import { useState } from "react";
import { FolderCreateDialog } from "./FolderCreateDialog";
import { FolderRenameDialog } from "./FolderRenameDialog";
import { FolderDeleteDialog } from "./FolderDeleteDialog";
import type { BookmarkFolder } from "@/lib/types";

type FolderDetailHeaderProps = {
  folder: BookmarkFolder | null;
  isInbox: boolean;
  bookmarkCount: number;
  subfolderCount: number;
  allFolders: BookmarkFolder[];
  onAddBookmark?: () => void;
  viewToggleNode?: React.ReactNode;
};

export function FolderDetailHeader({
  folder,
  isInbox,
  bookmarkCount,
  subfolderCount,
  onAddBookmark,
  viewToggleNode,
}: FolderDetailHeaderProps) {
  const [createSubfolderOpen, setCreateSubfolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const metaParts: string[] = [];
  if (bookmarkCount > 0) metaParts.push(`${bookmarkCount} bookmark${bookmarkCount !== 1 ? "s" : ""}`);
  if (!isInbox && subfolderCount > 0)
    metaParts.push(`${subfolderCount} subfolder${subfolderCount !== 1 ? "s" : ""}`);

  if (isInbox) {
    return (
      <div className="folder-header-row">
        <h1 className="folder-header-heading">Inbox</h1>
        {viewToggleNode}
        
        <div style={{ flex: 1 }} />

        <div className="folder-detail-actions">
          {onAddBookmark && (
              <button
                type="button"
                className="folder-action-btn folder-action-btn-primary"
                onClick={onAddBookmark}
                aria-label="Add bookmark"
              >
                <HugeIcon icon={IconAdd} size={18} />
                <span>Add bookmark</span>
              </button>
          )}
        </div>
      </div>
    );
  }

  if (!folder) return null;

  return (
    <>
      <div className="folder-header-row">
      <h1
        className="folder-header-heading"
        style={folder.color ? { color: folder.color } : undefined}
      >
        {folder.name}
      </h1>
      
      {viewToggleNode}
      
      <div style={{ flex: 1 }} />

      <div className="folder-detail-actions">
          {onAddBookmark && (
            <button
              type="button"
              className="folder-action-btn folder-action-btn-primary"
              onClick={onAddBookmark}
              aria-label="Add bookmark"
            >
              <HugeIcon icon={IconAdd} size={18} />
              <span>Add bookmark</span>
            </button>
          )}
          <button
            type="button"
            className="folder-action-btn"
            onClick={() => setCreateSubfolderOpen(true)}
            aria-label="Create subfolder"
            title="New subfolder"
          >
            <HugeIcon icon={IconFolderAdd} size={18} />
            <span>New subfolder</span>
          </button>
          <button
            type="button"
            className="folder-action-btn"
            onClick={() => setRenameOpen(true)}
            aria-label="Rename folder"
            title="Rename"
          >
            <HugeIcon icon={IconPencil} size={18} />
            <span>Rename</span>
          </button>
          <button
            type="button"
            className="folder-action-btn folder-action-btn-danger"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete folder"
            title="Delete"
          >
            <HugeIcon icon={IconDelete} size={18} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <FolderCreateDialog
        open={createSubfolderOpen}
        onOpenChange={setCreateSubfolderOpen}
        parentFolder={folder}
      />
      {folder && (
        <>
          <FolderRenameDialog
            folder={folder}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
          <FolderDeleteDialog
            folder={folder}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
        </>
      )}
    </>
  );
}
