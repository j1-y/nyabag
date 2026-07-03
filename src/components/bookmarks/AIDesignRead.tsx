"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconLoader } from "@/components/ui/icons";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
;
import { refreshBookmarkAI } from "@/lib/actions";
import type { BookmarkAiMetadata } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AIIcon } from "@/components/ui/AIIcon";
import { AIMetadataChip } from "./AIMetadataChip";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ai-design-read__field">
      <span className="ai-design-read__label">{label}</span>
      <div className="ai-design-read__value">{children}</div>
    </div>
  );
}

function ChipList({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="ai-muted">Unknown</span>;
  return (
    <div className="ai-chip-list">
      {values.map((value) => (
        <AIMetadataChip key={value} label={value} />
      ))}
    </div>
  );
}

export function AIDesignRead({
  bookmarkId,
  metadata,
}: {
  bookmarkId: string;
  metadata: BookmarkAiMetadata | null;
}) {
  const [analyzedMetadata, setAnalyzedMetadata] = useState<BookmarkAiMetadata | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, startTransition] = useTransition();
  const currentMetadata = analyzedMetadata ?? metadata;

  function analyze() {
    setError("");
    startTransition(async () => {
      const result = await refreshBookmarkAI(bookmarkId);
      if (result.success) setAnalyzedMetadata(result.data);
      else setError(result.error);
    });
  }

  const status = isAnalyzing ? "pending" : currentMetadata?.status;
  const statusLabel = status === "completed" ? "completed" : status === "failed" ? "unavailable" : "pending";

  return (
    <section className="ai-design-read">
      <div className="ai-design-read__header">
        <span className="ai-design-read__icon">
          <AIIcon size={18} />
        </span>
        <h2>AI Design Read</h2>
        <span className={`ai-design-read__status ai-design-read__status--${statusLabel}`}>
          {statusLabel}
        </span>
      </div>

      {!currentMetadata && !isAnalyzing ? (
        <div className="ai-state">
          <p className="ai-state__title">Analyze with AI</p>
          <p className="ai-state__description">Let Nyabag read this reference for design memory.</p>
          <Button type="button" variant="outline" onClick={analyze}>
            <AIIcon size={18} />
            Analyze with AI
          </Button>
        </div>
      ) : status === "pending" ? (
        <div className="ai-state">
          <p className="ai-state__title">AI analysis pending</p>
          <p className="ai-state__description">Nyabag is reading this reference...</p>
          <HugeIcon icon={IconLoader} className="animate-spin" size={18} />
        </div>
      ) : currentMetadata?.status === "failed" ? (
        <div className="ai-state">
          <p className="ai-state__title">AI analysis unavailable</p>
          <p className="ai-state__description">This reference could not be analyzed right now.</p>
          <Button type="button" variant="outline" onClick={analyze} disabled={isAnalyzing}>
            {isAnalyzing ? <HugeIcon icon={IconLoader} className="animate-spin" /> : <AIIcon size={18} />}
            {isAnalyzing ? "Analyzing..." : "Analyze again"}
          </Button>
        </div>
      ) : currentMetadata ? (
        <div className="ai-design-read__body">
          <Field label="Page type">
            <strong>{currentMetadata.page_type || "Unknown"}</strong>
          </Field>
          {currentMetadata.design_context && (
            <Field label="Design context">
              <p>{currentMetadata.design_context}</p>
            </Field>
          )}
          <Field label="Visual style">
            <ChipList values={currentMetadata.visual_style} />
          </Field>
          <Field label="UI patterns">
            <ChipList values={currentMetadata.ui_patterns} />
          </Field>
          <Field label="Components">
            <ChipList values={currentMetadata.components} />
          </Field>
          {currentMetadata.suggested_folder && (
            <Field label="Suggested folder">
              <strong>{currentMetadata.suggested_folder}</strong>
            </Field>
          )}
          <Field label="Suggested tags">
            <ChipList values={currentMetadata.suggested_tags} />
          </Field>
          {currentMetadata.confidence > 0 && (
            <p className="ai-confidence">Confidence: {Math.round(currentMetadata.confidence * 100)}%</p>
          )}
        </div>
      ) : null}

      {error && <p className="ai-design-read__error" role="alert">{error}</p>}
    </section>
  );
}
