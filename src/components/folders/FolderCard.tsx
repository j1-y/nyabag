import Link from "next/link";
import type { BookmarkFolder } from "@/lib/types";

const FOLDER_ICONS = [
  "macos-folder-black128x128@2x.svg",
  "macos-folder-blue128x128@2x.svg",
  "macos-folder-gray128x128@2x.svg",
  "macos-folder-green128x128@2x.svg",
  "macos-folder-lime128x128@2x.svg",
  "macos-folder-orange128x128@2x.svg",
  "macos-folder-purple128x128@2x.svg",
  "macos-folder-red128x128@2x.svg",
  "macos-folder-yellow128x128@2x.svg",
];

function getFolderIcon(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FOLDER_ICONS.length;
  return `/assets/folder_icons/${FOLDER_ICONS[index]}`;
}

type FolderCardProps = {
  folder: BookmarkFolder;
  bookmarkCount?: number;
};

export function FolderCard({ folder, bookmarkCount }: FolderCardProps) {
  const iconSrc = getFolderIcon(folder.id || folder.name);

  return (
    <Link
      href={`/folders/${folder.id}`}
      className="folder-grid-card"
      aria-label={`Open folder: ${folder.name}`}
    >
      <div className="folder-grid-icon-wrap" aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
        <img src={iconSrc} alt="" width={72} height={60} style={{ objectFit: 'contain' }} />
      </div>
      <p className="folder-grid-name">{folder.name}</p>
      {(bookmarkCount !== undefined || folder.description) && (
        <p className="folder-grid-meta">
          {bookmarkCount !== undefined
            ? `${bookmarkCount} bookmark${bookmarkCount !== 1 ? "s" : ""}`
            : folder.description || ""}
        </p>
      )}
    </Link>
  );
}
