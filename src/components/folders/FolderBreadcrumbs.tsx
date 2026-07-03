import Link from "next/link";
import type { BookmarkFolder } from "@/lib/types";

type FolderBreadcrumbsProps = {
  breadcrumbs: BookmarkFolder[];
  /** If true, shows "Inbox" as the leaf item with no parent link */
  isInbox?: boolean;
};

export function FolderBreadcrumbs({ breadcrumbs, isInbox }: FolderBreadcrumbsProps) {
  return (
    <nav className="folder-breadcrumbs" aria-label="Folder navigation">

      {isInbox ? (
        <>
          <span className="folder-breadcrumb-sep" aria-hidden="true">&middot;</span>
          <span className="folder-breadcrumb-item folder-breadcrumb-current">Inbox</span>
        </>
      ) : (
        breadcrumbs.map((folder, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={folder.id} className="folder-breadcrumb-group">
              <span className="folder-breadcrumb-sep" aria-hidden="true">&middot;</span>
              {isLast ? (
                <span className="folder-breadcrumb-item folder-breadcrumb-current">
                  {folder.name}
                </span>
              ) : (
                <Link
                  href={`/folders/${folder.id}`}
                  className="folder-breadcrumb-item folder-breadcrumb-link"
                >
                  <span className="folder-breadcrumb-text">{folder.name}</span>
                </Link>
              )}
            </span>
          );
        })
      )}
    </nav>
  );
}
