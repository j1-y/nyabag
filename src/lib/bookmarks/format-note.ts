const EXTENSION_CAPTURE_ATTRIBUTION = "Saved with Nyabag Capture extension";

export function formatBookmarkNote(note: string) {
  return note.replaceAll(
    "Captured via chrome-extension-popup",
    EXTENSION_CAPTURE_ATTRIBUTION
  );
}

export { EXTENSION_CAPTURE_ATTRIBUTION };
