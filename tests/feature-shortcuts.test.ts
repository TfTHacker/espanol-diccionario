import test from "node:test";
import assert from "node:assert/strict";

import { VIEW_TYPE_DICTIONARY, VIEW_TYPE_SPANISH_CHAT, VIEW_TYPE_TTS_PRACTICE } from "../src/constants";
import { FEATURE_SHORTCUTS } from "../src/ui/feature-shortcuts";

test("feature shortcuts expose the same top-level custom forms in a stable order", () => {
  assert.deepEqual(
    FEATURE_SHORTCUTS.map((shortcut) => shortcut.viewType),
    [VIEW_TYPE_DICTIONARY, VIEW_TYPE_SPANISH_CHAT, VIEW_TYPE_TTS_PRACTICE],
  );
});

test("feature shortcuts have compact icon labels and accessible titles", () => {
  assert.equal(FEATURE_SHORTCUTS.length, 3);
  for (const shortcut of FEATURE_SHORTCUTS) {
    assert.ok(shortcut.icon.length > 0);
    assert.ok(shortcut.label.length > 0);
    assert.ok(shortcut.title.startsWith("Open "));
  }
});
