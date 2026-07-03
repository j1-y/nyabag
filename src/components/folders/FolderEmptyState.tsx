import { HugeIcon } from "@/components/ui/huge-icon";
import { IconFolder } from "@/components/ui/icons";

type FolderEmptyStateProps = {
  isInbox?: boolean;
};

export function FolderEmptyState({ isInbox }: FolderEmptyStateProps) {
  if (isInbox) {
    return (
      <div className="folder-empty-state">
        <div className="folder-empty-state-icon" aria-hidden="true">
          <HugeIcon icon={IconFolder} size={18} />
        </div>
        <h3>Inbox is empty</h3>
        <p>New bookmarks land here until you move them into a folder.</p>
      </div>
    );
  }

  return (
    <div className="folder-empty-state">
      <div className="folder-empty-state-icon" aria-hidden="true">
        <HugeIcon icon={IconFolder} size={18} />
      </div>
      <h3>This folder is empty</h3>
      <p>Move bookmarks here or create a subfolder.</p>
    </div>
  );
}
