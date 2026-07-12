import { z } from "zod";
import { DEFAULT_NOTE_COLOR } from "./content-colors";

const urlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .transform((val) => (!/^https?:\/\//i.test(val) ? `https://${val}` : val))
  .pipe(z.string().url("Must be a valid URL"));

export const bookmarkCreateSchema = z.object({
  url: urlSchema,
  title: z.string().trim().max(255).optional(),
  tags: z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    )
    .pipe(z.string().array().max(20)),
  note: z.string().trim().max(2000).optional(),
  folder_id: z.string().uuid().nullable().optional(),
});

export const bookmarkUpdateSchema = bookmarkCreateSchema.extend({
  id: z.string().uuid(),
});

export type BookmarkCreateInput = z.infer<typeof bookmarkCreateSchema>;
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>;

// ── Folder schemas ────────────────────────────────────────────

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #FF5733)")
  .nullable()
  .optional();

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(80, "Name must be 80 characters or less"),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(300).optional().default(""),
  color: hexColorSchema,
  icon: z.string().trim().max(40).nullable().optional(),
});

export const folderUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(300).optional(),
  color: hexColorSchema,
  icon: z.string().trim().max(40).nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const moveBookmarkToFolderSchema = z.object({
  bookmark_id: z.string().uuid(),
  folder_id: z.string().uuid().nullable(),
});

export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>;
export type MoveBookmarkToFolderInput = z.infer<typeof moveBookmarkToFolderSchema>;

export const workspaceSwitchSchema = z.object({
  workspaceId: z.string().uuid("Workspace not found"),
});

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(80, "Name must be 80 characters or less"),
  description: z.string().trim().max(500, "Description must be 500 characters or less").optional().default(""),
});

export const workspaceUpdateSchema = z.object({
  id: z.string().uuid("Workspace not found"),
  name: z.string().trim().min(1, "Workspace name is required").max(80, "Name must be 80 characters or less"),
  description: z.string().trim().max(500, "Description must be 500 characters or less").optional().default(""),
});

export type WorkspaceSwitchInput = z.infer<typeof workspaceSwitchSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateSchema>;

export const profileUpdateSchema = z.object({
  name: z.string().trim().max(120, "Name must be 120 characters or less").optional(),
  email: z
    .string()
    .trim()
    .max(255, "Email must be 255 characters or less")
    .optional()
    .refine((value) => !value || z.email().safeParse(value).success, "Must be a valid email"),
  phone: z.string().trim().max(40, "Phone must be 40 characters or less").optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const onboardingWorkspaceTypeSchema = z.enum(["solo_creator", "team"]);
export const onboardingPrimaryGoalSchema = z.enum([
  "save_links",
  "organize_research",
  "build_moodboards",
]);
export const onboardingFocusAreaSchema = z.enum([
  "product_design",
  "branding",
  "marketing",
  "general",
]);

export const onboardingPreferencesSchema = z.object({
  workspace_type: onboardingWorkspaceTypeSchema,
  primary_goal: onboardingPrimaryGoalSchema,
  focus_area: onboardingFocusAreaSchema,
});

export type OnboardingPreferencesInput = z.infer<typeof onboardingPreferencesSchema>;

export const noteCreateSchema = z.object({
  type: z.enum(["text", "text_frame", "link", "image", "video", "social"]),
  section_id: z.string().uuid().nullable().default(null),
  content: z.string().max(12000).default(""),
  content_json: z.unknown().nullable().optional(),
  content_format: z.enum(["plain", "rich"]).default("plain"),
  media_source: z.enum(["url", "upload"]).nullable().default(null),
  media_path: z.string().max(1024).nullable().default(null),
  media_mime: z.string().max(255).nullable().default(null),
  media_name: z.string().max(255).nullable().default(null),
  x: z.coerce.number().finite(),
  y: z.coerce.number().finite(),
  width: z.coerce.number().min(100).max(1200),
  height: z.coerce.number().min(80).max(900),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default(DEFAULT_NOTE_COLOR),
  z_index: z.coerce.number().int().min(1),
});

export const noteUpdateSchema = noteCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export const notePositionSchema = z.object({
  id: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
  z_index: z.number().int(),
});

export const noteSizeSchema = z.object({
  id: z.string().uuid(),
  width: z.number().min(100).max(1200),
  height: z.number().min(80).max(900),
});

export const noteDeleteSchema = z.object({
  ids: z.string().uuid().array().min(1).max(100),
});

export const sectionCreateSchema = z.object({
  label: z.string().trim().min(1, "Section label is required").max(120),
  noteIds: z.string().uuid().array().min(1, "Select at least one note").max(100),
});

export const sectionUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1, "Section label is required").max(120).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().min(180).max(4000).optional(),
  height: z.number().min(120).max(4000).optional(),
});

export const sectionMoveSchema = z.object({
  id: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
  notes: z
    .object({
      id: z.string().uuid(),
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .array()
    .max(100),
});
