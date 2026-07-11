export type ExtensionCaptureDispatch =
  | { kind: "screenshot" }
  | { kind: "bookmark" }
  | {
      kind: "error";
      status: 400;
      code: "SCREENSHOT_IMAGE_REQUIRED" | "CAPTURE_TYPE_REQUIRED" | "CAPTURE_TYPE_UNSUPPORTED";
      error: string;
    };

const SCREENSHOT_TYPES = new Set(["visible_screenshot", "full_page_screenshot"]);
const BOOKMARK_TYPES = new Set(["page", "image", "link", "selection"]);

export function classifyExtensionCapture(payload: { type?: string; imageBase64?: string }): ExtensionCaptureDispatch {
  if (payload.imageBase64) return { kind: "screenshot" };

  const type = payload.type?.trim();
  if (type && SCREENSHOT_TYPES.has(type)) {
    return {
      kind: "error",
      status: 400,
      code: "SCREENSHOT_IMAGE_REQUIRED",
      error: "Screenshot image data is required",
    };
  }

  if (!type) {
    return {
      kind: "error",
      status: 400,
      code: "CAPTURE_TYPE_REQUIRED",
      error: "Capture type is required",
    };
  }

  if (!BOOKMARK_TYPES.has(type)) {
    return {
      kind: "error",
      status: 400,
      code: "CAPTURE_TYPE_UNSUPPORTED",
      error: "Unsupported capture type",
    };
  }

  return { kind: "bookmark" };
}
