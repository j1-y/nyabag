"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SECTION_COLOR } from "@/lib/content-colors";
import { CANVAS_NOTE_COLUMNS, CANVAS_SECTION_COLUMNS } from "@/lib/canvas-data";
import { isPerfEnabled, timeAsync } from "@/lib/perf";
import { checkRateLimit, userLimitKey } from "@/lib/rate-limit";
import {
  noteCreateSchema,
  noteDeleteSchema,
  notePositionSchema,
  noteSizeSchema,
  noteUpdateSchema,
  sectionCreateSchema,
  sectionMoveSchema,
  sectionUpdateSchema,
} from "@/lib/validations";
import type {
  ActionResult,
  CanvasNote,
  CanvasSection,
  CanvasSnapshot,
  DeleteNotesResult,
  NoteMediaSource,
  NoteType,
} from "@/lib/types";
import {
  getSocialEmbedFallbackSize,
  getSocialNoteUrl,
  isSocialNoteContent,
  parseSocialEmbed,
  SOCIAL_NOTE_PREFIX,
  toSocialNoteContent,
} from "@/lib/social-embeds";

const MEDIA_BUCKET = "canvas-media";
const SIGNED_URL_TTL = 60 * 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const SECTION_PAD_X = 32;
const SECTION_PAD_TOP = 56;
const SECTION_PAD_BOTTOM = 32;
const NOTE_CHROME_WIDTH = 22;
const NOTE_CHROME_HEIGHT = 22;

type Supabase = Awaited<ReturnType<typeof createClient>>;

type SectionWrapResult = {
  section: CanvasSection;
  notes: CanvasNote[];
  missingNoteIds: string[];
};

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

function safeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "upload";
}

async function withSignedUrl(
  supabase: Supabase,
  note: CanvasNote
): Promise<CanvasNote> {
  if (note.media_source !== "upload" || !note.media_path) return note;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(note.media_path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) return note;
  return { ...note, media_url: data.signedUrl };
}

async function getUser(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

async function getOwnedNote(
  supabase: Supabase,
  userId: string,
  id: string
): Promise<CanvasNote | null> {
  const { data, error } = await supabase
    .from("canvas_notes")
    .select(CANVAS_NOTE_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as unknown as CanvasNote;
}

async function getOwnedSection(
  supabase: Supabase,
  userId: string,
  id: string
): Promise<CanvasSection | null> {
  const { data, error } = await supabase
    .from("canvas_sections")
    .select(CANVAS_SECTION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as unknown as CanvasSection;
}

async function removeStoredMedia(supabase: Supabase, note: CanvasNote | null) {
  if (note?.media_source === "upload" && note.media_path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([note.media_path]);
  }
}

async function getCanvasSnapshot(supabase: Supabase): Promise<CanvasSnapshot> {
  const [{ data: notesData }, { data: sectionsData }] = await Promise.all([
    supabase.from("canvas_notes").select(CANVAS_NOTE_COLUMNS).order("z_index", { ascending: true }),
    supabase.from("canvas_sections").select(CANVAS_SECTION_COLUMNS).order("z_index", { ascending: true }),
  ]);
  const notes = (notesData ?? []) as unknown as CanvasNote[];
  const signedNotes = await Promise.all(notes.map((note) => withSignedUrl(supabase, note)));

  return {
    notes: signedNotes,
    sections: (sectionsData ?? []) as unknown as CanvasSection[],
  };
}

async function getNextNoteZIndex(supabase: Supabase, userId: string): Promise<number> {
  const { data: maxRow } = await supabase
    .from("canvas_notes")
    .select("z_index")
    .eq("user_id", userId)
    .order("z_index", { ascending: false })
    .limit(1)
    .single();

  return (maxRow?.z_index ?? 0) + 1;
}

function isMediaNoteType(type: NoteType): type is "image" | "video" {
  return type === "image" || type === "video";
}

function isAllowedMediaFile(type: "image" | "video", file: File): boolean {
  return type === "image" ? file.type.startsWith("image/") : file.type.startsWith("video/");
}

function clampNoteWidth(value: number) {
  return Math.min(1200, Math.max(100, Math.ceil(value)));
}

function clampNoteHeight(value: number) {
  return Math.min(900, Math.max(80, Math.ceil(value)));
}

async function getXPostEmbedMetadata(url: string): Promise<ActionResult<{ html: string; width: number; height: number }>> {
  try {
    const endpoint = new URL("https://publish.twitter.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("omit_script", "true");
    endpoint.searchParams.set("dnt", "true");
    endpoint.searchParams.set("theme", "light");

    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    if (!response.ok) return { success: false, error: "X could not render this post" };

    const json = await response.json();
    const html = typeof json?.html === "string" ? json.html : "";
    if (!html || !html.includes("twitter-tweet")) {
      return { success: false, error: "X did not return an embeddable post" };
    }

    const fallback = getSocialEmbedFallbackSize("x");
    const width = typeof json?.width === "number" && Number.isFinite(json.width) ? json.width : fallback.width;
    const height = typeof json?.height === "number" && Number.isFinite(json.height) ? json.height : fallback.height;

    return { success: true, data: { html, width, height } };
  } catch {
    return { success: false, error: "X embed failed to load" };
  }
}

export async function createNote(
  type: NoteType,
  x: number,
  y: number,
  color: string,
  width?: number,
  height?: number
): Promise<ActionResult<CanvasNote>> {
  return timeAsync("createNote", async () => {
    const supabase = await createClient();
    const user = await getUser(supabase);

    if (!user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    const rate = await checkRateLimit({
      scope: "canvas-note-create",
      identifier: userLimitKey(user.id),
      limit: 120,
      windowSeconds: 60 * 60,
    });

    if (!rate.allowed) {
      return {
        success: false,
        error: "You are creating notes too quickly. Please slow down.",
      };
    }

    const z_index = await getNextNoteZIndex(supabase, user.id);
    const isSocial = type === "social";
    const noteWidth = width ?? 240;
    const noteHeight = height ?? 180;

    const parsed = noteCreateSchema.safeParse({
      type,
      content: isSocial ? SOCIAL_NOTE_PREFIX : "",
      media_source: null,
      media_path: null,
      media_mime: null,
      media_name: null,
      x,
      y,
      width: noteWidth,
      height: noteHeight,
      color,
      z_index,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid note",
      };
    }

    const { section_id, ...noteInput } = parsed.data;

    const { data, error } = await supabase
      .from("canvas_notes")
      .insert({
        user_id: user.id,
        ...noteInput,
        ...(section_id ? { section_id } : {}),
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: data as unknown as CanvasNote,
    };
  });
}

export async function createTextNoteWithRichContent(
  type: "text" | "text_frame",
  content: string,
  contentJson: unknown,
  x: number,
  y: number,
  color: string,
  width: number,
  height: number,
  zIndex?: number
): Promise<ActionResult<CanvasNote>> {
  return timeAsync("createTextNoteWithRichContent", async () => {
    const supabase = await createClient();
    const user = await getUser(supabase);

    if (!user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    const rate = await checkRateLimit({
      scope: "canvas-note-create",
      identifier: userLimitKey(user.id),
      limit: 120,
      windowSeconds: 60 * 60,
    });

    if (!rate.allowed) {
      return {
        success: false,
        error: "You are creating notes too quickly. Please slow down.",
      };
    }

    const z_index = zIndex ?? (await getNextNoteZIndex(supabase, user.id));

    const parsed = noteCreateSchema.safeParse({
      type,
      content,
      content_json: contentJson,
      content_format: "rich",
      media_source: null,
      media_path: null,
      media_mime: null,
      media_name: null,
      x,
      y,
      width,
      height,
      color,
      z_index,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid rich text note",
      };
    }

    const { section_id, ...noteInput } = parsed.data;

    const { data, error } = await supabase
      .from("canvas_notes")
      .insert({
        user_id: user.id,
        ...noteInput,
        ...(section_id ? { section_id } : {}),
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: data as unknown as CanvasNote,
    };
  });
}

export async function createSocialNoteFromUrl(
  url: string,
  centerX: number,
  centerY: number,
  color: string
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const rate = await checkRateLimit({
    scope: "canvas-social-note-create",
    identifier: userLimitKey(user.id),
    limit: 30,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Social embed limit reached. Please try again later.",
    };
  }

  const embed = parseSocialEmbed(url);

  if (!embed) {
    return {
      success: false,
      error:
        "Paste a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post URL",
    };
  }

  let embedSize = getSocialEmbedFallbackSize(embed.provider);

  if (embed.provider === "x") {
    const metadata = await getXPostEmbedMetadata(embed.url);

    if (!metadata.success) {
      return {
        success: false,
        error: metadata.error,
      };
    }

    embedSize = {
      width: metadata.data.width,
      height: metadata.data.height,
    };
  }

  const width = clampNoteWidth(embedSize.width + NOTE_CHROME_WIDTH);
  const height = clampNoteHeight(embedSize.height + NOTE_CHROME_HEIGHT);
  const z_index = await getNextNoteZIndex(supabase, user.id);

  const parsed = noteCreateSchema.safeParse({
    type: "social",
    content: toSocialNoteContent(embed.url),
    media_source: null,
    media_path: null,
    media_mime: null,
    media_name: null,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    color,
    z_index,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid social note",
    };
  }

  const { section_id, ...noteInput } = parsed.data;

  const { data, error } = await supabase
    .from("canvas_notes")
    .insert({
      user_id: user.id,
      ...noteInput,
      ...(section_id ? { section_id } : {}),
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    data: data as unknown as CanvasNote,
  };
}

export async function createMediaNoteFromUrl(
  type: NoteType,
  url: string,
  x: number,
  y: number,
  color: string,
  width?: number,
  height?: number
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const rate = await checkRateLimit({
    scope: "canvas-media-url-note-create",
    identifier: userLimitKey(user.id),
    limit: 60,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Media URL note limit reached. Please try again later.",
    };
  }

  if (!isMediaNoteType(type)) {
    return {
      success: false,
      error: "Only image and video notes support media URLs",
    };
  }

  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return {
      success: false,
      error: "Must be a valid URL",
    };
  }

  const z_index = await getNextNoteZIndex(supabase, user.id);

  const parsed = noteCreateSchema.safeParse({
    type,
    content: normalizedUrl,
    media_source: "url",
    media_path: null,
    media_mime: null,
    media_name: null,
    x,
    y,
    width: width ?? 240,
    height: height ?? 180,
    color,
    z_index,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid media note",
    };
  }

  const { section_id, ...noteInput } = parsed.data;

  const { data, error } = await supabase
    .from("canvas_notes")
    .insert({
      user_id: user.id,
      ...noteInput,
      ...(section_id ? { section_id } : {}),
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/canvas");

  return {
    success: true,
    data: data as unknown as CanvasNote,
  };
}

export async function createMediaNoteWithUpload(
  type: NoteType,
  formData: FormData,
  x: number,
  y: number,
  color: string,
  width?: number,
  height?: number
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();

  const user = await getUser(supabase);

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const rate = await checkRateLimit({
    scope: "canvas-media-upload",
    identifier: userLimitKey(user.id),
    limit: 20,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Upload limit reached. Please try again later.",
    };
  }

  if (!isMediaNoteType(type)) {
    return {
      success: false,
      error: "Only image and video notes support uploads",
    };
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      success: false,
      error: "No file was selected",
    };
  }

  if (!isAllowedMediaFile(type, file)) {
    return {
      success: false,
      error: `Please upload a ${type} file`,
    };
  }

  const maxBytes = type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (file.size > maxBytes) {
    const mb = Math.floor(maxBytes / 1024 / 1024);

    return {
      success: false,
      error: `File must be ${mb}MB or smaller`,
    };
  }

  const z_index = await getNextNoteZIndex(supabase, user.id);

  const parsed = noteCreateSchema.safeParse({
    type,
    content: "",
    media_source: null,
    media_path: null,
    media_mime: null,
    media_name: null,
    x,
    y,
    width: width ?? 240,
    height: height ?? 180,
    color,
    z_index,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid media note",
    };
  }

  const { section_id, ...noteInput } = parsed.data;

  const { data: created, error: createError } = await supabase
    .from("canvas_notes")
    .insert({
      user_id: user.id,
      ...noteInput,
      ...(section_id ? { section_id } : {}),
    })
    .select()
    .single();

  if (createError || !created) {
    return {
      success: false,
      error: createError?.message ?? "Failed to create note",
    };
  }

  const note = created as unknown as CanvasNote;

  const path = `${user.id}/${note.id}/${crypto.randomUUID()}-${safeFilename(
    file.name
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    await supabase
      .from("canvas_notes")
      .delete()
      .eq("id", note.id)
      .eq("user_id", user.id);

    return {
      success: false,
      error: uploadError.message,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("canvas_notes")
    .update({
      content: "",
      media_source: "upload",
      media_path: path,
      media_mime: file.type,
      media_name: file.name.slice(0, 255),
    })
    .eq("id", note.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError || !updated) {
    await Promise.all([
      supabase.storage.from(MEDIA_BUCKET).remove([path]),
      supabase
        .from("canvas_notes")
        .delete()
        .eq("id", note.id)
        .eq("user_id", user.id),
    ]);

    return {
      success: false,
      error: updateError?.message ?? "Failed to attach media",
    };
  }

  revalidatePath("/canvas");

  const signed = await withSignedUrl(
    supabase,
    updated as unknown as CanvasNote
  );

  return {
    success: true,
    data: signed,
  };
}

export async function updateNoteContent(
  id: string,
  content: string,
  color?: string,
  mediaSource?: NoteMediaSource | null
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const oldNote = await getOwnedNote(supabase, user.id, id);
  if (!oldNote) return { success: false, error: "Note not found" };

  const socialUrl = getSocialNoteUrl(content);
  const isSocialNote = oldNote.type === "social" || isSocialNoteContent(oldNote.content) || isSocialNoteContent(content);
  const normalizedContent = mediaSource === "url" ? normalizeUrl(content) : content;
  if (mediaSource === "url" && !normalizedContent) {
    return { success: false, error: "Must be a valid URL" };
  }
  if (isSocialNote && socialUrl && !parseSocialEmbed(socialUrl)) {
    return { success: false, error: "Paste a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post URL" };
  }

  const parsed = noteUpdateSchema.safeParse({
    id,
    content: normalizedContent,
    ...(color ? { color } : {}),
    ...(mediaSource !== undefined
      ? {
          media_source: mediaSource,
          media_path: null,
          media_mime: null,
          media_name: null,
        }
      : {}),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { id: noteId, ...updates } = parsed.data;
  const { data, error } = await supabase
    .from("canvas_notes")
    .update(updates)
    .eq("id", noteId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (mediaSource !== undefined) await removeStoredMedia(supabase, oldNote);
  return { success: true, data: data as unknown as CanvasNote };
}

export async function updateTextNoteRichContent(
  id: string,
  content: string,
  contentJson: unknown
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const oldNote = await getOwnedNote(supabase, user.id, id);
  if (!oldNote) return { success: false, error: "Note not found" };
  if (oldNote.type !== "text" && oldNote.type !== "text_frame") {
    return { success: false, error: "Only text notes support rich content" };
  }

  const parsed = noteUpdateSchema.safeParse({
    id,
    content,
    content_json: contentJson,
    content_format: "rich",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("canvas_notes")
    .update({
      content: parsed.data.content,
      content_json: parsed.data.content_json,
      content_format: "rich",
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .in("type", ["text", "text_frame"])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/canvas");
  return { success: true, data: data as unknown as CanvasNote };
}

export async function updateNoteColor(
  id: string,
  color: string
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = noteUpdateSchema.safeParse({ id, color });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("canvas_notes")
    .update({ color: parsed.data.color })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/canvas");
  return { success: true, data: data as unknown as CanvasNote };
}

export async function uploadNoteMedia(
  id: string,
  formData: FormData
): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const note = await getOwnedNote(supabase, user.id, id);
  if (!note) return { success: false, error: "Note not found" };
  if (note.type !== "image" && note.type !== "video") {
    return { success: false, error: "Only image and video notes support uploads" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No file was selected" };
  }

  if (!isMediaNoteType(note.type) || !isAllowedMediaFile(note.type, file)) {
    return { success: false, error: `Please upload a ${note.type} file` };
  }

  const maxBytes = note.type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    const mb = Math.floor(maxBytes / 1024 / 1024);
    return { success: false, error: `File must be ${mb}MB or smaller` };
  }

  const path = `${user.id}/${note.id}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data, error } = await supabase
    .from("canvas_notes")
    .update({
      content: "",
      media_source: "upload",
      media_path: path,
      media_mime: file.type,
      media_name: file.name.slice(0, 255),
    })
    .eq("id", note.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { success: false, error: error.message };
  }

  await removeStoredMedia(supabase, note);
  revalidatePath("/canvas");
  const signed = await withSignedUrl(supabase, data as unknown as CanvasNote);
  return { success: true, data: signed };
}

export async function removeNoteMedia(id: string): Promise<ActionResult<CanvasNote>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const note = await getOwnedNote(supabase, user.id, id);
  if (!note) return { success: false, error: "Note not found" };

  const { data, error } = await supabase
    .from("canvas_notes")
    .update({
      content: "",
      media_source: null,
      media_path: null,
      media_mime: null,
      media_name: null,
    })
    .eq("id", note.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  await removeStoredMedia(supabase, note);
  revalidatePath("/canvas");
  return { success: true, data: data as unknown as CanvasNote };
}

export async function updateNotePosition(
  id: string,
  x: number,
  y: number
): Promise<ActionResult> {
  const persist = async (): Promise<ActionResult> => {
    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return { success: false, error: "Not authenticated" };

    const parsed = notePositionSchema.safeParse({ id, x, y, z_index: 1 });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { error } = await supabase
      .from("canvas_notes")
      .update({ x, y })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  };

  return isPerfEnabled() ? timeAsync("updateNotePosition", persist) : persist();
}

export async function updateNoteSize(
  id: string,
  width: number,
  height: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = noteSizeSchema.safeParse({ id, width, height });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from("canvas_notes")
    .update({ width, height })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function bringNoteToFront(id: string): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: maxRow } = await supabase
    .from("canvas_notes")
    .select("z_index")
    .eq("user_id", user.id)
    .order("z_index", { ascending: false })
    .limit(1)
    .single();

  const newZIndex = (maxRow?.z_index ?? 0) + 1;
  const { error } = await supabase
    .from("canvas_notes")
    .update({ z_index: newZIndex })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: newZIndex };
}

export async function deleteNotes(
  ids: string[],
  options: { returnSnapshot?: boolean } = {}
): Promise<ActionResult<DeleteNotesResult>> {
  return timeAsync("deleteNotes", async () => {
    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return { success: false, error: "Not authenticated" };

    const parsed = noteDeleteSchema.safeParse({ ids });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const uniqueIds = [...new Set(parsed.data.ids)];
    const { data: ownedNotes, error: lookupError } = await supabase
      .from("canvas_notes")
      .select(CANVAS_NOTE_COLUMNS)
      .eq("user_id", user.id)
      .in("id", uniqueIds);

    if (lookupError) return { success: false, error: lookupError.message };
    const notes = (ownedNotes ?? []) as unknown as CanvasNote[];
    const deletedIds = notes.map((note) => note.id);
    const removedMediaPaths = notes
      .filter((note) => note.media_source === "upload" && note.media_path)
      .map((note) => note.media_path as string);

    const { error } = await supabase
      .from("canvas_notes")
      .delete()
      .eq("user_id", user.id)
      .in("id", uniqueIds);

    if (error) return { success: false, error: error.message };
    await Promise.all(notes.map((note) => removeStoredMedia(supabase, note)));
    const snapshot = options.returnSnapshot ? await getCanvasSnapshot(supabase) : undefined;
    return { success: true, data: { deletedIds, removedMediaPaths, snapshot } };
  });
}

export async function deleteNote(id: string): Promise<ActionResult<DeleteNotesResult>> {
  return deleteNotes([id]);
}

export async function createSectionFromNotes(
  label: string,
  noteIds: string[]
): Promise<ActionResult<SectionWrapResult>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = sectionCreateSchema.safeParse({ label, noteIds });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const uniqueIds = [...new Set(parsed.data.noteIds)];
  const { data: notesData, error: notesError } = await supabase
    .from("canvas_notes")
    .select("*")
    .eq("user_id", user.id)
    .in("id", uniqueIds);

  if (notesError) return { success: false, error: notesError.message };
  const notes = (notesData ?? []) as unknown as CanvasNote[];
  const foundIds = new Set(notes.map((note) => note.id));
  const missingNoteIds = uniqueIds.filter((id) => !foundIds.has(id));
  if (notes.length === 0) {
    return { success: false, error: "Selected notes no longer exist" };
  }

  const minX = Math.min(...notes.map((note) => note.x));
  const minY = Math.min(...notes.map((note) => note.y));
  const maxX = Math.max(...notes.map((note) => note.x + note.width));
  const maxY = Math.max(...notes.map((note) => note.y + note.height));

  const { data: maxRow } = await supabase
    .from("canvas_sections")
    .select("z_index")
    .eq("user_id", user.id)
    .order("z_index", { ascending: false })
    .limit(1)
    .single();

  const sectionInput = {
    user_id: user.id,
    label: parsed.data.label,
    x: minX - SECTION_PAD_X,
    y: minY - SECTION_PAD_TOP,
    width: maxX - minX + SECTION_PAD_X * 2,
    height: maxY - minY + SECTION_PAD_TOP + SECTION_PAD_BOTTOM,
    color: DEFAULT_SECTION_COLOR,
    z_index: (maxRow?.z_index ?? 0) + 1,
  };

  const { data: sectionData, error: sectionError } = await supabase
    .from("canvas_sections")
    .insert(sectionInput)
    .select()
    .single();

  if (sectionError) return { success: false, error: sectionError.message };
  const section = sectionData as unknown as CanvasSection;

  const { data: updatedNotes, error: updateError } = await supabase
    .from("canvas_notes")
    .update({ section_id: section.id })
    .eq("user_id", user.id)
    .in("id", uniqueIds)
    .select();

  if (updateError) {
    await supabase.from("canvas_sections").delete().eq("id", section.id).eq("user_id", user.id);
    return { success: false, error: updateError.message };
  }

  revalidatePath("/canvas");
  return {
    success: true,
    data: { section, notes: (updatedNotes ?? []) as unknown as CanvasNote[], missingNoteIds },
  };
}

export async function updateSectionLabel(
  id: string,
  label: string
): Promise<ActionResult<CanvasSection>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = sectionUpdateSchema.safeParse({ id, label });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("canvas_sections")
    .update({ label: parsed.data.label })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/canvas");
  return { success: true, data: data as unknown as CanvasSection };
}

export async function updateSectionPosition(
  id: string,
  x: number,
  y: number,
  notes: Array<{ id: string; x: number; y: number }>
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = sectionMoveSchema.safeParse({ id, x, y, notes });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const section = await getOwnedSection(supabase, user.id, id);
  if (!section) return { success: false, error: "Section not found" };

  const { error: sectionError } = await supabase
    .from("canvas_sections")
    .update({ x: parsed.data.x, y: parsed.data.y })
    .eq("id", id)
    .eq("user_id", user.id);

  if (sectionError) return { success: false, error: sectionError.message };

  const updates = await Promise.all(
    parsed.data.notes.map((note) =>
      supabase
        .from("canvas_notes")
        .update({ x: note.x, y: note.y })
        .eq("id", note.id)
        .eq("user_id", user.id)
        .eq("section_id", id)
    )
  );
  const failed = updates.find((result) => result.error);
  if (failed?.error) return { success: false, error: failed.error.message };

  return { success: true, data: undefined };
}

export async function updateSectionSize(
  id: string,
  width: number,
  height: number
): Promise<ActionResult<CanvasSection>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = sectionUpdateSchema.safeParse({ id, width, height });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("canvas_sections")
    .update({ width: parsed.data.width, height: parsed.data.height })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as unknown as CanvasSection };
}

export async function deleteSection(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const section = await getOwnedSection(supabase, user.id, id);
  if (!section) return { success: false, error: "Section not found" };

  const { error: ungroupError } = await supabase
    .from("canvas_notes")
    .update({ section_id: null })
    .eq("section_id", id)
    .eq("user_id", user.id);

  if (ungroupError) return { success: false, error: ungroupError.message };

  const { error } = await supabase
    .from("canvas_sections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/canvas");
  return { success: true, data: undefined };
}

export async function getXPostEmbedHtml(url: string): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = parseSocialEmbed(url);
  if (!parsed || parsed.provider !== "x") {
    return { success: false, error: "Must be a valid X or Twitter post URL" };
  }

  const metadata = await getXPostEmbedMetadata(parsed.url);
  return metadata.success
    ? { success: true, data: metadata.data.html }
    : { success: false, error: metadata.error };
}
