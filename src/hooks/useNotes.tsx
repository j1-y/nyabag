"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  bringNoteToFront,
  createMediaNoteFromUrl,
  createMediaNoteWithUpload,
  createSocialNoteFromUrl,
  createSectionFromNotes,
  createNote,
  createTextNoteWithRichContent,
  deleteSection as deleteSectionAction,
  deleteNote as deleteNoteAction,
  deleteNotes as deleteNotesAction,
  removeNoteMedia,
  updateSectionLabel,
  updateSectionPosition,
  updateSectionSize,
  updateNoteContent,
  updateNoteColor,
  updateNotePosition,
  updateNoteSize,
  updateTextNoteRichContent,
  uploadNoteMedia,
} from "@/lib/canvas-actions";
import type {
  ActionResult,
  CanvasNote,
  CanvasSection,
  CanvasToolMode,
  CanvasViewport,
  NoteMediaSource,
  NoteType,
  PendingMediaNote,
} from "@/lib/types";
import { useCanvasStore } from "@/features/canvas/store/useCanvasStore";

const DRAFT_NOTE_PREFIX = "draft-note-";

function isDraftNoteId(id: string) {
  return id.startsWith(DRAFT_NOTE_PREFIX);
}

export const NOTE_COLORS = [
  "#12CFF3",
  "#FFE13B",
  "#7ED957",
  "#EF4056",
  "#B23ACB",
  "#FFFFFF",
] as const;

interface NotesCtx {
  notes: CanvasNote[];
  sections: CanvasSection[];
  toolMode: CanvasToolMode;
  setToolMode: (mode: CanvasToolMode) => void;
  activeNoteTool: NoteType | null;
  setActiveNoteTool: (type: NoteType | null) => void;
  pendingMediaNote: PendingMediaNote | null;
  setPendingMediaNote: (media: PendingMediaNote | null) => void;
  isCreatingMediaNote: boolean;
  mediaPlacementError: string;
  viewport: CanvasViewport;
  setViewport: (v: CanvasViewport) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  addNote: (
    type: NoteType,
    canvasX: number,
    canvasY: number,
    width?: number,
    height?: number
  ) => Promise<void>;
  addMediaNote: (
    canvasX: number,
    canvasY: number,
    width?: number,
    height?: number
  ) => Promise<ActionResult<CanvasNote>>;
  createSocialNote: (url: string) => Promise<ActionResult<CanvasNote>>;
  deleteNote: (id: string) => Promise<void>;
  deleteNotes: (ids: string[]) => Promise<void>;
  updateContent: (
    id: string,
    content: string,
    color?: string,
    mediaSource?: NoteMediaSource | null
  ) => Promise<ActionResult<CanvasNote>>;
  updateRichTextContent: (
    id: string,
    plainText: string,
    contentJson: unknown
  ) => Promise<ActionResult<CanvasNote>>;
  updateColor: (id: string, color: string) => Promise<ActionResult<CanvasNote>>;
  uploadMedia: (id: string, file: File) => Promise<ActionResult<CanvasNote>>;
  removeMedia: (id: string) => Promise<ActionResult<CanvasNote>>;
  setNotePosition: (id: string, x: number, y: number) => void;
  setNotePositions: (positions: Array<{ id: string; x: number; y: number }>) => void;
  setNoteSize: (id: string, width: number, height: number) => void;
  commitPosition: (id: string, x: number, y: number) => Promise<void>;
  commitSize: (id: string, width: number, height: number) => Promise<void>;
  bringToFront: (id: string) => void;
  wrapSelectionInSection: (label: string) => Promise<ActionResult<CanvasSection>>;
  setSectionPosition: (id: string, x: number, y: number) => void;
  setSectionSize: (id: string, width: number, height: number) => void;
  commitSectionPosition: (id: string, x: number, y: number) => Promise<void>;
  commitSectionSize: (id: string, width: number, height: number) => Promise<void>;
  renameSection: (id: string, label: string) => Promise<ActionResult<CanvasSection>>;
  deleteSection: (id: string) => Promise<void>;
}

const NotesContext = createContext<NotesCtx | null>(null);

export function NotesProvider({
  children,
  initial,
  initialSections,
}: {
  children: React.ReactNode;
  initial: CanvasNote[];
  initialSections: CanvasSection[];
}) {
  const [notes, setNotes] = useState<CanvasNote[]>(initial);
  const [sections, setSections] = useState<CanvasSection[]>(initialSections);
  const [toolMode, setToolMode] = useState<CanvasToolMode>("select");
  const [activeNoteTool, setActiveNoteToolState] = useState<NoteType | null>(null);
  const [pendingMediaNote, setPendingMediaNoteState] = useState<PendingMediaNote | null>(null);
  const [isCreatingMediaNote, setIsCreatingMediaNote] = useState(false);
  const [mediaPlacementError, setMediaPlacementError] = useState("");
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const [selectedIds, setSelectedIdsState] = useState<string[]>([]);
  const colorIndexRef = useRef(0);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const initializeCanvasStore = useCanvasStore((state) => state.initialize);
  const setStoreViewport = useCanvasStore((state) => state.setViewport);

  useEffect(() => {
    initializeCanvasStore(initial, initialSections);
  }, [initial, initialSections, initializeCanvasStore]);

  useEffect(() => {
    let frame: number | null = null;

    try {
      const stored = window.localStorage.getItem("nyabag:canvas-viewport");
      if (!stored) return undefined;
      const parsed = JSON.parse(stored) as Partial<CanvasViewport>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.scale === "number"
      ) {
        const restoredViewport = parsed as CanvasViewport;
        frame = window.requestAnimationFrame(() => {
          setViewport(restoredViewport);
          setStoreViewport(restoredViewport);
        });
      }
    } catch {
      // Canvas viewport is a non-sensitive UI preference; ignore corrupt storage.
    }

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [setStoreViewport]);

  useEffect(() => {
    setStoreViewport(viewport);
  }, [setStoreViewport, viewport]);

  const setPersistentViewport = useCallback((nextViewport: CanvasViewport) => {
    setViewport(nextViewport);
    setStoreViewport(nextViewport);
    try {
      window.localStorage.setItem("nyabag:canvas-viewport", JSON.stringify(nextViewport));
    } catch {
      // Do not persist private canvas content; viewport only is safe to drop.
    }
  }, [setStoreViewport]);

  const setSelectedIds = useCallback((ids: string[]) => {
    setSelectedIdsState([...new Set(ids)]);
  }, []);

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelectedIds(id ? [id] : []);
    },
    [setSelectedIds]
  );

  const setActiveNoteTool = useCallback((type: NoteType | null) => {
    setActiveNoteToolState(type);
    if (!type || (type !== "image" && type !== "video")) {
      setPendingMediaNoteState(null);
      setMediaPlacementError("");
    }
  }, []);

  const setPendingMediaNote = useCallback((media: PendingMediaNote | null) => {
    setPendingMediaNoteState(media);
    setActiveNoteToolState(media?.type ?? null);
    setMediaPlacementError("");
    if (media) setToolMode("select");
  }, []);

  const addNote = useCallback(
    async (type: NoteType, canvasX: number, canvasY: number, width?: number, height?: number) => {
      const color = NOTE_COLORS[colorIndexRef.current % NOTE_COLORS.length];
      colorIndexRef.current++;
      if (type === "text" || type === "text_frame") {
        const draftId = `${DRAFT_NOTE_PREFIX}${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const draftWidth = width ?? 240;
        const draftHeight = height ?? 180;

        setNotes((prev) => {
          const zIndex = Math.max(...prev.map((note) => note.z_index), 0) + 1;
          const draftNote: CanvasNote = {
            id: draftId,
            user_id: "draft",
            workspace_id: "draft",
            section_id: null,
            type,
            content: "",
            content_json: null,
            content_format: "plain",
            media_source: null,
            media_path: null,
            media_mime: null,
            media_name: null,
            x: canvasX,
            y: canvasY,
            width: draftWidth,
            height: draftHeight,
            color,
            z_index: zIndex,
            created_at: now,
            updated_at: now,
          };
          return [...prev, draftNote];
        });
        setSelectedId(draftId);
        setActiveNoteToolState(null);
        return;
      }

      const result = await createNote(type, canvasX, canvasY, color, width, height);

      if (result.success) {
        setNotes((prev) => [...prev, result.data]);
        setSelectedId(result.data.id);
        setActiveNoteToolState(null);
      } else {
        console.error("Failed to create note:", result.error);
      }
    },
    [setSelectedId]
  );

  const addMediaNote = useCallback(
    async (
      canvasX: number,
      canvasY: number,
      width?: number,
      height?: number
    ): Promise<ActionResult<CanvasNote>> => {
      if (!pendingMediaNote) {
        return { success: false, error: "Choose media before placing the note" };
      }

      const color = NOTE_COLORS[colorIndexRef.current % NOTE_COLORS.length];
      colorIndexRef.current++;
      setIsCreatingMediaNote(true);
      setMediaPlacementError("");

      let result: ActionResult<CanvasNote>;
      try {
        result =
          pendingMediaNote.source === "upload"
            ? await (async () => {
                if (!pendingMediaNote.file) {
                  return { success: false, error: "No file was selected" } as ActionResult<CanvasNote>;
                }
                const formData = new FormData();
                formData.append("file", pendingMediaNote.file);
                return createMediaNoteWithUpload(
                  pendingMediaNote.type,
                  formData,
                  canvasX,
                  canvasY,
                  color,
                  width,
                  height
                );
              })()
            : await createMediaNoteFromUrl(
                pendingMediaNote.type,
                pendingMediaNote.url ?? "",
                canvasX,
                canvasY,
                color,
                width,
                height
              );
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create media note",
        };
      } finally {
        setIsCreatingMediaNote(false);
      }
      if (result.success) {
        setNotes((prev) => [...prev, result.data]);
        setSelectedId(result.data.id);
        setPendingMediaNote(null);
      } else {
        colorIndexRef.current = Math.max(0, colorIndexRef.current - 1);
        setMediaPlacementError(result.error);
        console.error("Failed to create media note:", result.error);
      }

      return result;
    },
    [pendingMediaNote, setPendingMediaNote, setSelectedId]
  );

  const createSocialNote = useCallback(
    async (url: string): Promise<ActionResult<CanvasNote>> => {
      const color = NOTE_COLORS[colorIndexRef.current % NOTE_COLORS.length];
      colorIndexRef.current++;
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.scale;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.scale;
      const result = await createSocialNoteFromUrl(url, centerX, centerY, color);

      if (result.success) {
        setNotes((prev) => [...prev, result.data]);
        setSelectedId(result.data.id);
        setActiveNoteToolState(null);
      } else {
        colorIndexRef.current = Math.max(0, colorIndexRef.current - 1);
      }

      return result;
    },
    [setSelectedId, viewport.scale, viewport.x, viewport.y]
  );

  const applyServerSnapshot = useCallback((snapshot: { notes: CanvasNote[]; sections: CanvasSection[] }) => {
    setNotes(snapshot.notes);
    setSections(snapshot.sections);
    const noteIds = new Set(snapshot.notes.map((note) => note.id));
    setSelectedIdsState((prev) => prev.filter((id) => noteIds.has(id)));
  }, []);

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) return;
      const persistedIds = uniqueIds.filter((id) => !isDraftNoteId(id));

      setNotes((prev) => prev.filter((note) => !uniqueIds.includes(note.id)));
      setSelectedIdsState((prev) => prev.filter((selected) => !uniqueIds.includes(selected)));

      if (persistedIds.length === 0) return;

      const result = await deleteNotesAction(persistedIds);
      if (result.success) {
        if (result.data.snapshot) {
          applyServerSnapshot(result.data.snapshot);
        } else {
          setNotes((prev) => prev.filter((note) => !result.data.deletedIds.includes(note.id)));
          setSelectedIdsState((prev) => prev.filter((selected) => !result.data.deletedIds.includes(selected)));
        }
      } else {
        console.error("Failed to delete note:", result.error);
      }
    },
    [applyServerSnapshot]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (isDraftNoteId(id)) {
        setNotes((prev) => prev.filter((note) => note.id !== id));
        setSelectedIdsState((prev) => prev.filter((selected) => selected !== id));
        return;
      }

      const result = await deleteNoteAction(id);
      if (result.success) {
        if (result.data.snapshot) {
          applyServerSnapshot(result.data.snapshot);
        } else {
          setNotes((prev) => prev.filter((note) => !result.data.deletedIds.includes(note.id)));
          setSelectedIdsState((prev) => prev.filter((selected) => !result.data.deletedIds.includes(selected)));
        }
      } else {
        console.error("Failed to delete note:", result.error);
      }
    },
    [applyServerSnapshot]
  );

  const updateContent = useCallback(
    async (
      id: string,
      content: string,
      color?: string,
      mediaSource?: NoteMediaSource | null
    ) => {
      let previous: CanvasNote | undefined;
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          previous = n;
          return {
            ...n,
            content,
            ...(color ? { color } : {}),
            ...(mediaSource !== undefined
              ? {
                  media_source: mediaSource,
                  media_path: null,
                  media_mime: null,
                  media_name: null,
                  media_url: undefined,
                }
              : {}),
          };
        })
      );

      const result = await updateNoteContent(id, content, color, mediaSource);
      if (result.success) {
        setNotes((prev) => prev.map((n) => (n.id === id ? result.data : n)));
      } else if (previous) {
        setNotes((prev) => prev.map((n) => (n.id === id ? previous as CanvasNote : n)));
      }

      return result;
    },
    []
  );

  const updateRichTextContent = useCallback(
    async (id: string, plainText: string, contentJson: unknown) => {
      let previous: CanvasNote | undefined;
      setNotes((prev) =>
        prev.map((note) => {
          if (note.id !== id) return note;
          previous = note;
          return {
            ...note,
            content: plainText,
            content_json: contentJson,
            content_format: "rich",
          };
        })
      );

      if (!previous) {
        return {
          success: false,
          error: "Note no longer exists",
        } satisfies ActionResult<CanvasNote>;
      }

      if (isDraftNoteId(id)) {
        if (!plainText.trim()) {
          return {
            success: false,
            error: "Draft note is empty",
          } satisfies ActionResult<CanvasNote>;
        }

        if (previous.type !== "text" && previous.type !== "text_frame") {
          return {
            success: false,
            error: "Only text notes support rich content",
          } satisfies ActionResult<CanvasNote>;
        }

        const result = await createTextNoteWithRichContent(
          previous.type,
          plainText,
          contentJson,
          previous.x,
          previous.y,
          previous.color,
          previous.width,
          previous.height,
          previous.z_index
        );

        if (result.success) {
          setNotes((prev) => prev.map((note) => (note.id === id ? result.data : note)));
          setSelectedIdsState((prev) => prev.map((selected) => (selected === id ? result.data.id : selected)));
        } else {
          setNotes((prev) => prev.map((note) => (note.id === id ? previous as CanvasNote : note)));
        }

        return result;
      }

      const result = await updateTextNoteRichContent(id, plainText, contentJson);
      if (result.success) {
        setNotes((prev) => prev.map((note) => (note.id === id ? result.data : note)));
      } else if (previous) {
        setNotes((prev) => prev.map((note) => (note.id === id ? previous as CanvasNote : note)));
      }

      return result;
    },
    []
  );

  const updateColor = useCallback(async (id: string, color: string) => {
    let previous: CanvasNote | undefined;
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id !== id) return note;
        previous = note;
        return { ...note, color };
      })
    );

    if (isDraftNoteId(id)) {
      return { success: true, data: previous as CanvasNote } satisfies ActionResult<CanvasNote>;
    }

    const result = await updateNoteColor(id, color);
    if (result.success) {
      setNotes((prev) => prev.map((note) => (note.id === id ? result.data : note)));
    } else if (previous) {
      setNotes((prev) => prev.map((note) => (note.id === id ? previous as CanvasNote : note)));
    }

    return result;
  }, []);

  const uploadMedia = useCallback(async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadNoteMedia(id, formData);
    if (result.success) {
      setNotes((prev) => prev.map((n) => (n.id === id ? result.data : n)));
    }

    return result;
  }, []);

  const removeMedia = useCallback(async (id: string) => {
    let previous: CanvasNote | undefined;
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        previous = n;
        return {
          ...n,
          content: "",
          media_source: null,
          media_path: null,
          media_mime: null,
          media_name: null,
          media_url: undefined,
        };
      })
    );

    const result = await removeNoteMedia(id);
    if (result.success) {
      setNotes((prev) => prev.map((n) => (n.id === id ? result.data : n)));
    } else if (previous) {
      setNotes((prev) => prev.map((n) => (n.id === id ? previous as CanvasNote : n)));
    }

    return result;
  }, []);

  const setNotePosition = useCallback((id: string, x: number, y: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  const setNotePositions = useCallback((positions: Array<{ id: string; x: number; y: number }>) => {
    const nextPositions = new Map(positions.map((position) => [position.id, position]));
    setNotes((prev) =>
      prev.map((note) => {
        const position = nextPositions.get(note.id);
        return position ? { ...note, x: position.x, y: position.y } : note;
      })
    );
  }, []);

  const setNoteSize = useCallback((id: string, width: number, height: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, width, height } : n)));
  }, []);

  const commitPosition = useCallback(async (id: string, x: number, y: number) => {
    if (isDraftNoteId(id)) return;
    const result = await updateNotePosition(id, x, y);
    if (!result.success) console.error("Failed to update note position:", result.error);
  }, []);

  const commitSize = useCallback(async (id: string, width: number, height: number) => {
    if (isDraftNoteId(id)) return;
    const result = await updateNoteSize(id, width, height);
    if (!result.success) console.error("Failed to update note size:", result.error);
  }, []);

  const bringToFront = useCallback((id: string) => {
    setNotes((prev) => {
      const maxZ = Math.max(...prev.map((n) => n.z_index), 0);
      return prev.map((n) => (n.id === id ? { ...n, z_index: maxZ + 1 } : n));
    });

    if (isDraftNoteId(id)) return;

    bringNoteToFront(id).then((result) => {
      if (result.success) {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, z_index: result.data } : n))
        );
      } else {
        console.error("Failed to bring note forward:", result.error);
      }
    });
  }, []);

  const wrapSelectionInSection = useCallback(
    async (label: string): Promise<ActionResult<CanvasSection>> => {
      const noteIds = new Set(notes.map((note) => note.id));
      const ids = selectedIds.filter((id) => noteIds.has(id) && !isDraftNoteId(id));
      const staleIds = selectedIds.filter((id) => !noteIds.has(id));
      if (staleIds.length > 0) {
        setSelectedIds(ids);
      }
      if (ids.length === 0) {
        return { success: false, error: "Selected notes no longer exist" };
      }

      const result = await createSectionFromNotes(label, ids);

      if (result.success) {
        setSections((prev) => [...prev, result.data.section]);
        setNotes((prev) =>
          prev
            .filter((note) => !result.data.missingNoteIds.includes(note.id))
            .map((note) => {
              const updated = result.data.notes.find((n) => n.id === note.id);
              return updated ?? note;
            })
        );
        setSelectedIds(result.data.notes.map((note) => note.id));
        return { success: true, data: result.data.section };
      }

      if (result.error === "Selected notes no longer exist") {
        setNotes((prev) => prev.filter((note) => !ids.includes(note.id)));
        setSelectedIds([]);
      } else {
        console.warn("Failed to create section:", result.error);
      }
      return result;
    },
    [notes, selectedIds, setSelectedIds]
  );

  const setSectionPosition = useCallback((id: string, x: number, y: number) => {
    setSections((prev) => prev.map((section) => (section.id === id ? { ...section, x, y } : section)));
  }, []);

  const setSectionSize = useCallback((id: string, width: number, height: number) => {
    setSections((prev) =>
      prev.map((section) => (section.id === id ? { ...section, width, height } : section))
    );
  }, []);

  const commitSectionPosition = useCallback(
    async (id: string, x: number, y: number) => {
      const memberNotes = notes
        .filter((note) => note.section_id === id)
        .map((note) => ({ id: note.id, x: note.x, y: note.y }));
      const result = await updateSectionPosition(id, x, y, memberNotes);
      if (!result.success) console.error("Failed to update section position:", result.error);
    },
    [notes]
  );

  const commitSectionSize = useCallback(async (id: string, width: number, height: number) => {
    const result = await updateSectionSize(id, width, height);
    if (result.success) {
      setSections((prev) => prev.map((section) => (section.id === id ? result.data : section)));
    } else {
      console.error("Failed to update section size:", result.error);
    }
  }, []);

  const renameSection = useCallback(async (id: string, label: string) => {
    const result = await updateSectionLabel(id, label);
    if (result.success) {
      setSections((prev) => prev.map((section) => (section.id === id ? result.data : section)));
    }
    return result;
  }, []);

  const deleteSection = useCallback(async (id: string) => {
    const previousSection = sections.find((section) => section.id === id);
    const previousNotes = notes;
    setSections((prev) => prev.filter((section) => section.id !== id));
    setNotes((prev) =>
      prev.map((note) => (note.section_id === id ? { ...note, section_id: null } : note))
    );

    const result = await deleteSectionAction(id);
    if (!result.success) {
      if (previousSection) setSections((prev) => [...prev, previousSection]);
      setNotes(previousNotes);
      console.error("Failed to delete section:", result.error);
    }
  }, [notes, sections]);

  const value = useMemo<NotesCtx>(
    () => ({
      notes,
      sections,
      toolMode,
      setToolMode,
      activeNoteTool,
      setActiveNoteTool,
      pendingMediaNote,
      setPendingMediaNote,
      isCreatingMediaNote,
      mediaPlacementError,
      viewport,
      setViewport: setPersistentViewport,
      selectedId,
      setSelectedId,
      selectedIds,
      setSelectedIds,
      addNote,
      addMediaNote,
      createSocialNote,
      deleteNote,
      deleteNotes,
      updateContent,
      updateRichTextContent,
      updateColor,
      uploadMedia,
      removeMedia,
      setNotePosition,
      setNotePositions,
      setNoteSize,
      commitPosition,
      commitSize,
      bringToFront,
      wrapSelectionInSection,
      setSectionPosition,
      setSectionSize,
      commitSectionPosition,
      commitSectionSize,
      renameSection,
      deleteSection,
    }),
    [
      notes,
      sections,
      toolMode,
      activeNoteTool,
      setActiveNoteTool,
      pendingMediaNote,
      setPendingMediaNote,
      isCreatingMediaNote,
      mediaPlacementError,
      viewport,
      setPersistentViewport,
      selectedId,
      selectedIds,
      setSelectedId,
      setSelectedIds,
      addNote,
      addMediaNote,
      createSocialNote,
      deleteNote,
      deleteNotes,
      updateContent,
      updateRichTextContent,
      updateColor,
      uploadMedia,
      removeMedia,
      setNotePosition,
      setNotePositions,
      setNoteSize,
      commitPosition,
      commitSize,
      bringToFront,
      wrapSelectionInSection,
      setSectionPosition,
      setSectionSize,
      commitSectionPosition,
      commitSectionSize,
      renameSection,
      deleteSection,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesCtx {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}
