"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconUpload } from "@/components/ui/icons";
import { useMemo, useRef, useState, useTransition } from "react";
import { importBookmarks } from "@/lib/actions";
import { extractUrlsFromText } from "@/lib/url-extraction";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ImportBookmarksResult } from "@/lib/types";

const MAX_FILE_BYTES = 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["txt", "md", "csv"]);
const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.ms-excel",
]);

function isSupportedTextFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension) || SUPPORTED_MIME_TYPES.has(file.type);
}

function ResultSummary({ result }: { result: ImportBookmarksResult }) {
  return (
    <div className="import-results" aria-live="polite">
      <div className="import-result-summary">
        <strong>Imported {result.created.length} references successfully</strong>
      </div>

      {(result.skipped.length > 0 || result.failed.length > 0) && (
        <div className="import-result-list">
          {[...result.skipped, ...result.failed].map((item) => (
            <div key={`${item.url}-${item.error}`} className="import-result-row">
              <span>{item.url}</span>
              <strong>{item.error ?? "Could not import"}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportReferencesModal() {
  const { importOpen, closeImport, setBookmarks } = useBookmarks();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportBookmarksResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedUrls = useMemo(() => extractUrlsFromText(text), [text]);
  const isImporting = isPending;
  const importLabel = isImporting ? "Importing..." : `Import ${detectedUrls.length} links`;

  function reset() {
    setText("");
    setError("");
    setIsDragging(false);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    closeImport();
  }

  async function addFile(file: File | undefined) {
    setError("");
    if (!file) return;

    if (!isSupportedTextFile(file)) {
      setError("Only .txt, .md, and .csv files are supported right now.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError("File must be 1 MB or smaller.");
      return;
    }

    try {
      const fileText = await file.text();
      setText((prev) => [prev, fileText].filter(Boolean).join("\n"));
      setResult(null);
    } catch {
      setError("Could not read that file.");
    }
  }

  function handleImport() {
    setError("");
    setResult(null);

    if (detectedUrls.length === 0) {
      setError("Paste links or drop a text file to begin.");
      return;
    }

    const formData = new FormData();
    formData.set("text", text);
    formData.set("urls", JSON.stringify(detectedUrls));

    startTransition(async () => {
      const response = await importBookmarks(formData);
      if (!response.success) {
        setError(response.error);
        return;
      }

      setResult(response.data);
      if (response.data.created.length > 0) {
        setBookmarks((prev) => {
          const importedIds = new Set(response.data.created.map((bookmark) => bookmark.id));
          return [...response.data.created, ...prev.filter((bookmark) => !importedIds.has(bookmark.id))];
        });
      }
    });
  }

  return (
    <Dialog open={importOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="import-modal max-w-xl">
        <DialogHeader>
          <DialogTitle>Import references</DialogTitle>
        </DialogHeader>

        <div className="import-modal-body grid gap-4 px-4 py-4">
          {error && <div className="auth-error">{error}</div>}

          {!result ? (
            <>
              <label className="import-textarea-field">
                <span>Paste links</span>
                <Textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setResult(null);
                    setError("");
                  }}
                  placeholder="Paste URLs, notes, or a messy list here. Nyabag will extract the links."
                  rows={7}
                />
              </label>

              <div
                className={`import-dropzone${isDragging ? " dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void addFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                  onChange={(event) => void addFile(event.target.files?.[0])}
                />
                <HugeIcon icon={IconUpload} size={18} />
                <strong>{isDragging ? "Drop it into Nyabag" : "Drop a .txt, .md, or .csv file here"}</strong>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  or choose a file
                </button>
              </div>
            </>
          ) : (
            <ResultSummary result={result} />
          )}
        </div>

        <DialogFooter>
          {result ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button type="button" onClick={reset}>
                Import more
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isImporting}>
                Cancel
              </Button>
              <Button type="button" onClick={handleImport} disabled={detectedUrls.length === 0 || isImporting}>
                {importLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
