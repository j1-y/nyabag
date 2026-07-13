"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { useNotes } from "@/hooks/useNotes";
import type { CanvasNote } from "@/lib/types";

export type StickyNoteFormatAction =
  | "heading"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "bullet"
  | "ordered"
  | "todo"
  | "link";

export type StickyNoteTextHandle = {
  applyFormat: (action: StickyNoteFormatAction) => void;
  focus: () => void;
  isActive: (action: StickyNoteFormatAction) => boolean;
};

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const MAX_AUTO_HEIGHT = 900;
const MIN_FRAME_WIDTH = 100;
const MIN_FRAME_HEIGHT = 38;
const MAX_FRAME_WIDTH = 1200;
const MAX_FRAME_HEIGHT = 900;
const FRAME_PAD_X = 8;
const FRAME_PAD_Y = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function textToDoc(text: string): JSONContent {
  if (!text.trim()) return EMPTY_DOC;

  return {
    type: "doc",
    content: text.split(/\n{2,}/).map((block) => ({
      type: "paragraph",
      content: block
        .split("\n")
        .flatMap((line, index) => [
          ...(index > 0 ? [{ type: "hardBreak" }] : []),
          ...(line ? [{ type: "text", text: line }] : []),
        ]),
    })),
  };
}

function getInitialContent(note: CanvasNote): JSONContent {
  if (note.content_format === "rich" && note.content_json) {
    return note.content_json as JSONContent;
  }

  return textToDoc(note.content);
}

function normalizeUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyListFormat(editor: Editor, action: "bullet" | "ordered" | "todo") {
  const selection = {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  };
  const isBullet = editor.isActive("bulletList");
  const isOrdered = editor.isActive("orderedList");
  const isTodo = editor.isActive("taskList");
  const isSame =
    (action === "bullet" && isBullet) ||
    (action === "ordered" && isOrdered) ||
    (action === "todo" && isTodo);

  let chain = editor.chain().focus().setTextSelection(selection);

  if (isSame) {
    if (action === "bullet") chain = chain.toggleBulletList();
    if (action === "ordered") chain = chain.toggleOrderedList();
    if (action === "todo") chain = chain.toggleTaskList();
    chain.run();
    return;
  }

  if (isBullet) chain = chain.toggleBulletList();
  if (isOrdered) chain = chain.toggleOrderedList();
  if (isTodo) chain = chain.toggleTaskList();

  if (action === "bullet") chain = chain.toggleBulletList();
  if (action === "ordered") chain = chain.toggleOrderedList();
  if (action === "todo") chain = chain.toggleTaskList();
  chain.run();
}

export const NoteTextContent = forwardRef<
  StickyNoteTextHandle,
  { note: CanvasNote; isSelected: boolean }
>(function NoteTextContent({ note, isSelected }, ref) {
  const { updateRichTextContent, setNoteSize, commitSize } = useNotes();
  const isTextFrame = note.type === "text_frame";
  const textSizingMode = note.text_sizing_mode ?? (isTextFrame ? "auto_width" : "fixed");
  const initialContent = useMemo(() => getInitialContent(note), [note]);
  const savedPlainRef = useRef(note.content);
  const savedJsonRef = useRef<unknown>(initialContent);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestSizeRef = useRef({ width: note.width, height: note.height });
  const autoHeightFrameRef = useRef<number | null>(null);
  const autoHeightCommitRef = useRef<number | null>(null);
  const autoSaveRef = useRef<number | null>(null);

  const saveEditor = useCallback(async () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const plainText = editor.getText();
    const contentJson = editor.getJSON();

    if (plainText === savedPlainRef.current && jsonEqual(contentJson, savedJsonRef.current)) {
      return;
    }

    const result = await updateRichTextContent(note.id, plainText, contentJson);
    if (result.success) {
      savedPlainRef.current = result.data.content;
      savedJsonRef.current = result.data.content_json ?? contentJson;
    } else if (
      result.error === "Note not found" ||
      result.error === "Note no longer exists" ||
      result.error === "Draft note is empty"
    ) {
      return;
    } else {
      console.error("Failed to save rich text note:", result.error);
    }
  }, [note.id, updateRichTextContent]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveRef.current !== null) {
      window.clearTimeout(autoSaveRef.current);
    }

    autoSaveRef.current = window.setTimeout(() => {
      autoSaveRef.current = null;
      void saveEditor();
    }, 650);
  }, [saveEditor]);

  const growToFitContent = useCallback(() => {
    if (isTextFrame) return;
    if (autoHeightFrameRef.current !== null) return;
    autoHeightFrameRef.current = window.requestAnimationFrame(() => {
      autoHeightFrameRef.current = null;
      const container = containerRef.current;
      if (!container) return;

      const nextHeight = Math.min(MAX_AUTO_HEIGHT, Math.ceil(container.scrollHeight));
      const current = latestSizeRef.current;
      if (nextHeight <= current.height + 4) return;

      latestSizeRef.current = { width: current.width, height: nextHeight };
      setNoteSize(note.id, current.width, nextHeight);

      if (autoHeightCommitRef.current !== null) {
        window.clearTimeout(autoHeightCommitRef.current);
      }
      autoHeightCommitRef.current = window.setTimeout(() => {
        autoHeightCommitRef.current = null;
        void commitSize(note.id, current.width, nextHeight);
      }, 350);
    });
  }, [commitSize, isTextFrame, note.id, setNoteSize]);

  const fitFrameToContent = useCallback(() => {
    if (!isTextFrame || textSizingMode === "fixed") return;
    if (autoHeightFrameRef.current !== null) return;
    autoHeightFrameRef.current = window.requestAnimationFrame(() => {
      autoHeightFrameRef.current = null;
      const container = containerRef.current;
      const editorElement = container?.querySelector<HTMLElement>(".ProseMirror");
      if (!container || !editorElement) return;

      const nextWidth = textSizingMode === "auto_width"
        ? clamp(
            Math.ceil(editorElement.scrollWidth + FRAME_PAD_X),
            MIN_FRAME_WIDTH,
            MAX_FRAME_WIDTH
          )
        : latestSizeRef.current.width;
      const nextHeight = clamp(
        Math.ceil(editorElement.scrollHeight + FRAME_PAD_Y),
        MIN_FRAME_HEIGHT,
        MAX_FRAME_HEIGHT
      );
      const current = latestSizeRef.current;

      if (Math.abs(nextWidth - current.width) <= 2 && Math.abs(nextHeight - current.height) <= 2) {
        return;
      }

      latestSizeRef.current = { width: nextWidth, height: nextHeight };
      setNoteSize(note.id, nextWidth, nextHeight, textSizingMode);

      if (autoHeightCommitRef.current !== null) {
        window.clearTimeout(autoHeightCommitRef.current);
      }
      autoHeightCommitRef.current = window.setTimeout(() => {
        autoHeightCommitRef.current = null;
        void commitSize(note.id, nextWidth, nextHeight, textSizingMode);
      }, 250);
    });
  }, [commitSize, isTextFrame, note.id, setNoteSize, textSizingMode]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: isTextFrame ? "Type text..." : "Write a thought, checklist, or direction...",
      }),
    ],
    content: initialContent,
    editable: isSelected,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rich-text-note-editor",
      },
    },
    onBlur: () => {
      saveEditor();
    },
    onCreate: () => {
      growToFitContent();
      fitFrameToContent();
    },
    onUpdate: () => {
      growToFitContent();
      fitFrameToContent();
      scheduleAutoSave();
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  latestSizeRef.current = { width: note.width, height: note.height };

  useEffect(() => {
    editor?.setEditable(isSelected);
    if (!isSelected) saveEditor();
    growToFitContent();
    fitFrameToContent();
  }, [editor, fitFrameToContent, growToFitContent, isSelected, note.width, saveEditor]);

  useEffect(() => {
    return () => {
      if (autoHeightFrameRef.current !== null) {
        window.cancelAnimationFrame(autoHeightFrameRef.current);
      }
      if (autoHeightCommitRef.current !== null) {
        window.clearTimeout(autoHeightCommitRef.current);
      }
      if (autoSaveRef.current !== null) {
        window.clearTimeout(autoSaveRef.current);
      }
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      applyFormat(action) {
        if (!editor) return;

        switch (action) {
          case "heading":
            editor.chain().focus().toggleHeading({ level: 2 }).run();
            return;
          case "bold":
            editor.chain().focus().toggleBold().run();
            return;
          case "italic":
            editor.chain().focus().toggleItalic().run();
            return;
          case "underline":
            editor.chain().focus().toggleUnderline().run();
            return;
          case "strike":
            editor.chain().focus().toggleStrike().run();
            return;
          case "bullet":
            applyListFormat(editor, "bullet");
            growToFitContent();
            void saveEditor();
            return;
          case "ordered":
            applyListFormat(editor, "ordered");
            growToFitContent();
            void saveEditor();
            return;
          case "todo":
            applyListFormat(editor, "todo");
            growToFitContent();
            void saveEditor();
            return;
          case "link": {
            const previousUrl = editor.getAttributes("link").href as string | undefined;
            const input = window.prompt("Enter URL", previousUrl ?? "https://example.com");
            if (input === null) {
              editor.commands.focus();
              return;
            }
            const href = normalizeUrl(input);
            if (!href) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            return;
          }
        }
      },
      focus() {
        editor?.commands.focus();
      },
      isActive(action) {
        if (!editor) return false;
        switch (action) {
          case "heading":
            return editor.isActive("heading", { level: 2 });
          case "bold":
            return editor.isActive("bold");
          case "italic":
            return editor.isActive("italic");
          case "underline":
            return editor.isActive("underline");
          case "strike":
            return editor.isActive("strike");
          case "bullet":
            return editor.isActive("bulletList");
          case "ordered":
            return editor.isActive("orderedList");
          case "todo":
            return editor.isActive("taskList");
          case "link":
            return editor.isActive("link");
        }
      },
    }),
    [editor, growToFitContent, saveEditor]
  );

  return (
    <div
      ref={containerRef}
      className={`rich-text-note${isTextFrame ? " rich-text-note--frame" : ""}`}
      data-text-sizing-mode={isTextFrame ? textSizingMode : undefined}
      onPointerDown={(e) => isSelected && e.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
});
