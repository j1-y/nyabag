export type BookmarkFolder = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  description: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BookmarkFolderTreeNode = BookmarkFolder & {
  children: BookmarkFolderTreeNode[];
  bookmark_count?: number;
  recursive_bookmark_count?: number;
};

export type Bookmark = {
  id: string;
  user_id: string;
  url: string;
  title: string;
  tags: string[];
  palette: string[];
  fonts: string[];
  screenshot_url: string | null;
  screenshot_path: string | null;
  screenshot_refreshed_at: string | null;
  long_screenshot_url?: string | null;
  long_screenshot_path?: string | null;
  long_screenshot_refreshed_at?: string | null;
  summary: string;
  metadata_refreshed_at: string | null;
  note: string;
  processing_status: "queued" | "processing" | "ready" | "failed";
  processing_error: string | null;
  cortex_status?: CortexStatus;
  cortex_error?: string | null;
  cortex_memory_id?: string | null;
  cortex_ingested_at?: string | null;
  enrichment_started_at: string | null;
  enrichment_finished_at: string | null;
  save_reason?: string | null;
  last_opened_at?: string | null;
  search_score?: number;
  search_mode?: "cortex";
  search_match_reasons?: string[];
  semantic_similarity?: number;
  match_label?: string;
  match_strength?: "exact" | "strong" | "possible" | "related";
  created_at: string;
  updated_at: string;
  folder_id?: string | null;
  folder?: BookmarkFolder | null;
};

export type CortexStatus = "pending" | "processing" | "ready" | "failed" | "skipped";

export type TelegramConnectionStatus = "pending" | "connected" | "disabled";

export type TelegramConnection = {
  id: string;
  user_id: string;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  status: TelegramConnectionStatus;
  verification_code_expires_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramInboundMessageStatus =
  | "received"
  | "processed"
  | "failed"
  | "ignored"
  | "verification";

export type OnboardingWorkspaceType = "solo_creator" | "team";
export type OnboardingPrimaryGoal =
  | "save_links"
  | "organize_research"
  | "build_moodboards";
export type OnboardingFocusArea =
  | "product_design"
  | "branding"
  | "marketing"
  | "general";
export type OnboardingStep = "welcome" | "preferences" | "telegram" | "complete";

export type UserOnboarding = {
  user_id: string;
  workspace_type: OnboardingWorkspaceType | "";
  primary_goal: OnboardingPrimaryGoal | "";
  focus_area: OnboardingFocusArea | "";
  current_step: OnboardingStep;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ImportBookmarkItemResult = {
  url: string;
  success: boolean;
  bookmark?: Bookmark;
  error?: string;
};

export type ImportBookmarksResult = {
  created: Bookmark[];
  failed: ImportBookmarkItemResult[];
  skipped: ImportBookmarkItemResult[];
  total: number;
};

export type CortexBookmarkSearchPayload = {
  bookmarks: Bookmark[];
  query: string;
  result_count: number;
  configured: boolean;
  message?: string;
};

export type UserProfile = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  avatar_path: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteType = "text" | "text_frame" | "link" | "image" | "video" | "social";
export type NoteMediaSource = "url" | "upload";
export type NoteContentFormat = "plain" | "rich";
export type CanvasToolMode = "select" | "pan";

export type PendingMediaNote = {
  type: "image" | "video";
  source: "upload" | "url";
  file?: File;
  url?: string;
  width?: number;
  height?: number;
};

export type CanvasSection = {
  id: string;
  user_id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  z_index: number;
  created_at: string;
  updated_at: string;
};

export type CanvasNote = {
  id: string;
  user_id: string;
  section_id: string | null;
  type: NoteType;
  content: string;
  content_json?: unknown | null;
  content_format?: NoteContentFormat | string;
  media_source: NoteMediaSource | null;
  media_path: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  z_index: number;
  created_at: string;
  updated_at: string;
};

export type CanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasSnapshot = {
  notes: CanvasNote[];
  sections: CanvasSection[];
};

export type DeleteNotesResult = {
  deletedIds: string[];
  removedMediaPaths: string[];
  snapshot?: CanvasSnapshot;
};
