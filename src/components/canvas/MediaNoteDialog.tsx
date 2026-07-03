"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconLink, IconUpload } from "@/components/ui/icons";
import { useRef, useState } from "react";
;
import type { PendingMediaNote } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MediaType = "image" | "video";
type MediaSource = "upload" | "url";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function formatLimit(type: MediaType) {
  return type === "image" ? "10MB" : "50MB";
}

function isValidFile(type: MediaType, file: File) {
  return type === "image" ? file.type.startsWith("image/") : file.type.startsWith("video/");
}

function normalizeUrl(raw: string): string | null {
  const normalized = /^https?:\/\//i.test(raw.trim())
    ? raw.trim()
    : `https://${raw.trim()}`;

  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

export function MediaNoteDialog({
  type,
  onClose,
  onConfirm,
}: {
  type: MediaType;
  onClose: () => void;
  onConfirm: (media: PendingMediaNote) => void;
}) {
  const [source, setSource] = useState<MediaSource>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileDimensions, setFileDimensions] = useState<{ width: number; height: number } | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accept = type === "image" ? "image/*" : "video/*";
  const title = type === "image" ? "Add image" : "Add video";
  const urlPlaceholder =
    type === "image" ? "Paste an image URL" : "Paste a YouTube, Vimeo, or video URL";

  function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  }

  function getImageDimensions(nextFile: File) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(nextFile);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read image dimensions"));
      };
      image.src = objectUrl;
    });
  }

  async function selectFile(nextFile: File | undefined) {
    setError("");
    if (!nextFile) return;

    if (!isValidFile(type, nextFile)) {
      setFile(null);
      setFileDimensions(null);
      setError(`Please choose a ${type} file.`);
      return;
    }

    const maxBytes = type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (nextFile.size > maxBytes) {
      setFile(null);
      setFileDimensions(null);
      setError(`File must be ${formatLimit(type)} or smaller.`);
      return;
    }

    setFile(nextFile);
    setFileDimensions(null);

    if (type === "image") {
      try {
        setFileDimensions(await getImageDimensions(nextFile));
      } catch {
        setFile(null);
        setError("Could not read that image. Try another file.");
      }
    }
  }

  function confirm() {
    setError("");

    if (source === "upload") {
      if (!file) {
        setError(`Choose a ${type} file first.`);
        return;
      }
      onConfirm({
        type,
        source: "upload",
        file,
        width: fileDimensions?.width,
        height: fileDimensions?.height,
      });
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError("Enter a valid URL.");
      return;
    }
    onConfirm({ type, source: "url", url: normalizedUrl });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose media first, then place it anywhere on the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4">
          <Tabs value={source} onValueChange={(value) => {
            setSource(value as MediaSource);
            setError("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="gap-2">
                <HugeIcon icon={IconUpload} size={18} />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <HugeIcon icon={IconLink} size={18} />
                Link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <div
                className={`media-note-dropzone${isDragging ? " dragging" : ""}${file ? " has-file" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void selectFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={accept}
                  onChange={(e) => void selectFile(e.target.files?.[0])}
                />
                <HugeIcon icon={IconUpload} size={18} />
                <strong>{file ? file.name : `Drop a ${type} file here`}</strong>
                <span>
                  {file
                    ? `${file.name} · ${formatBytes(file.size)}${fileDimensions ? ` · ${fileDimensions.width}x${fileDimensions.height}` : ""}`
                    : `or choose a file, up to ${formatLimit(type)}`}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Choose file
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4">
              <Field>
                <FieldLabel htmlFor="media-note-url">Media URL</FieldLabel>
                <Input
                  id="media-note-url"
                  autoFocus
                  type="url"
                  placeholder={urlPlaceholder}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirm();
                  }}
                />
                <FieldHint>Paste a direct media URL or supported video link.</FieldHint>
              </Field>
            </TabsContent>
          </Tabs>

          {error && <FieldError>{error}</FieldError>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm}>
            Place on canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
