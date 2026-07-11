import assert from "node:assert/strict";
import test from "node:test";

import { classifyExtensionCapture } from "../src/lib/extension/capture-dispatch";

test("dispatches bookmark capture types", () => {
  for (const type of ["page", "image", "link", "selection"]) {
    assert.deepEqual(classifyExtensionCapture({ type }), { kind: "bookmark" });
  }
});

test("dispatches any payload with screenshot bytes to storage", () => {
  assert.deepEqual(classifyExtensionCapture({ imageBase64: "data:image/png;base64,abc" }), { kind: "screenshot" });
  assert.deepEqual(
    classifyExtensionCapture({ type: "visible_screenshot", imageBase64: "abc" }),
    { kind: "screenshot" }
  );
});

test("rejects screenshot types without image bytes", () => {
  for (const type of ["visible_screenshot", "full_page_screenshot"]) {
    assert.deepEqual(classifyExtensionCapture({ type }), {
      kind: "error",
      status: 400,
      code: "SCREENSHOT_IMAGE_REQUIRED",
      error: "Screenshot image data is required",
    });
  }
});

test("rejects missing and unsupported capture types", () => {
  assert.equal(classifyExtensionCapture({}).kind, "error");
  assert.deepEqual(classifyExtensionCapture({ type: "video" }), {
    kind: "error",
    status: 400,
    code: "CAPTURE_TYPE_UNSUPPORTED",
    error: "Unsupported capture type",
  });
});
