"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconDatabase, IconLoader, IconSparkles } from "@/components/ui/icons";
import { useState, useTransition } from "react";
import { processAllBookmarksSemanticData } from "@/lib/semantic/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BackfillResult = {
  processed: number;
  skipped: number;
  failed: number;
};

export function SemanticMemoryPanel() {
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function processBookmarks() {
    setError("");
    setResult(null);

    startTransition(async () => {
      const response = await processAllBookmarksSemanticData();
      if (!response.success) {
        setError(response.error);
        return;
      }

      setResult(response.data);
    });
  }

  return (
    <section className="profile-panel semantic-memory-panel" aria-label="Search by memory">
      <div className="profile-panel-header semantic-memory-header">
        <div>
          <h2>Search by memory</h2>
          <p>Process existing saves so Nyabag can search by vibe, layout, color, or pattern.</p>
        </div>
        <Badge variant="subtle">
          <HugeIcon icon={IconSparkles} size={18} />
          Memory
        </Badge>
      </div>

      {error && <div className="profile-message profile-message-error">{error}</div>}
      {result && (
        <div className="profile-message profile-message-success">
          Processed {result.processed}, skipped {result.skipped}, failed {result.failed}.
        </div>
      )}

      <div className="semantic-memory-state">
        <HugeIcon icon={IconDatabase} size={18} />
        <p>Runs up to 20 bookmarks at a time for your account. Existing keyword search keeps working either way.</p>
      </div>

      <Button type="button" onClick={processBookmarks} disabled={isPending}>
        {isPending ? <HugeIcon icon={IconLoader} className="animate-spin" size={18} /> : <HugeIcon icon={IconSparkles} size={18} />}
        {isPending ? "Processing..." : "Process existing bookmarks"}
      </Button>
    </section>
  );
}
