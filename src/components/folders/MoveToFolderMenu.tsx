"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconFolder, IconLoader } from "@/components/ui/icons";
import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
;
import { moveBookmarkToFolder, getBookmarkFolders } from "@/lib/folder-actions";
import { buildFolderTree, flattenFolderTree } from "@/lib/folders";
import type { BookmarkFolder } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MoveToFolderMenuProps = {
  children: React.ReactNode;
  bookmarkId: string;
  currentFolderId?: string | null;
  onMoved?: () => void;
};

export function MoveToFolderMenu({
  children,
  bookmarkId,
  currentFolderId,
  onMoved,
}: MoveToFolderMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [movingTo, setMovingTo] = useState<string | null | undefined>(undefined);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open && folders.length === 0 && !isLoading) {
      setIsLoading(true);
      getBookmarkFolders().then((result) => {
        if (result.success) {
          setFolders(result.data);
        }
        setIsLoading(false);
      });
    }
  }

  const tree = buildFolderTree(folders);
  const flatOptions = flattenFolderTree(tree);

  function handleMove(folderId: string | null, e: React.MouseEvent) {
    e.preventDefault();
    if (folderId === currentFolderId) return;
    setMovingTo(folderId);
    startTransition(async () => {
      const result = await moveBookmarkToFolder(bookmarkId, folderId);
      if (result.success) {
        onMoved?.();
        router.refresh();
      }
      setMovingTo(undefined);
      setIsOpen(false);
    });
  }

  const isMoving = isPending;

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
        
        {isLoading ? (
          <div className="px-2 py-4 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <HugeIcon icon={IconLoader} className="animate-spin" size={18} /> Loading...
          </div>
        ) : (
          <>
            <DropdownMenuItem
              onClick={(e) => handleMove(null, e)}
              disabled={isMoving || !currentFolderId}
              className="gap-2 cursor-pointer"
            >
              <HugeIcon icon={IconFolder} size={18} aria-hidden="true" />
              Inbox
              {!currentFolderId && <span className="ml-auto text-xs text-muted-foreground">(current)</span>}
            </DropdownMenuItem>

            {flatOptions.map(({ folder, depth }) => {
              const isCurrent = folder.id === currentFolderId;
              const isTarget = movingTo === folder.id;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={(e) => handleMove(folder.id, e)}
                  disabled={isMoving || isCurrent}
                  style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
                  className="gap-2 cursor-pointer"
                >
                  <HugeIcon icon={IconFolder}
                    size={18}
                    aria-hidden="true"
                    style={folder.color ? { color: folder.color } : undefined}
                  />
                  <span className="truncate">{folder.name}</span>
                  {isCurrent && <span className="ml-auto text-xs text-muted-foreground shrink-0">(current)</span>}
                  {isTarget && <span className="ml-auto text-xs text-muted-foreground shrink-0">Moving...</span>}
                </DropdownMenuItem>
              );
            })}

            {folders.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No folders yet. Create one from the sidebar.
              </div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
