"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconFolder } from "@/components/ui/icons";
import { useEffect, useState, useTransition } from "react";
;
import { getBookmarkFolders } from "@/lib/folder-actions";
import { buildFolderTree, flattenFolderTree } from "@/lib/folders";
import type { BookmarkFolder } from "@/lib/types";

type FolderSelectorProps = {
  name?: string;
  value?: string | null;
  onChange?: (folderId: string | null) => void;
  className?: string;
  id?: string;
};

export function FolderSelector({
  name = "folder_id",
  value,
  onChange,
  className = "",
  id,
}: FolderSelectorProps) {
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getBookmarkFolders();
      if (result.success) {
        setFolders(result.data);
      }
      setLoaded(true);
    });
  }, []);

  const tree = buildFolderTree(folders);
  const flatOptions = flattenFolderTree(tree);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newValue = e.target.value || null;
    onChange?.(newValue);
  }

  return (
    <div className={`folder-selector ${className}`}>
      <span className="folder-selector-icon" aria-hidden="true">
        <HugeIcon icon={IconFolder} size={18} />
      </span>
      <select
        id={id}
        name={name}
        value={value ?? ""}
        onChange={handleChange}
        className="folder-selector-select"
        disabled={!loaded}
        aria-label="Select folder"
      >
        <option value="">
          {loaded ? "Inbox" : "Loading folders…"}
        </option>
        {flatOptions.map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {"\u00A0".repeat(depth * 3)}
            {depth > 0 ? "↳ " : ""}
            {folder.name}
          </option>
        ))}
      </select>
    </div>
  );
}
