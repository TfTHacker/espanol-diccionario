import test from "node:test";
import assert from "node:assert/strict";

import { FEATURE_SHORTCUTS } from "../src/ui/feature-shortcuts";
import { SHORTCUT_LABELS, getFeatureShortcutNumber, isPlainAltShortcut, titleWithShortcut } from "../src/ui/keyboard-shortcuts";

test("titleWithShortcut appends a readable key combo to button tooltips", () => {
  assert.equal(titleWithShortcut("Play Spanish audio", "Alt+P"), "Play Spanish audio (Alt+P)");
  assert.equal(titleWithShortcut("Back", SHORTCUT_LABELS.dictionaryBack), "Back (Alt+←)");
});

test("feature launcher tooltips show their Alt number shortcuts", () => {
  assert.deepEqual(
    FEATURE_SHORTCUTS.map((shortcut) => shortcut.title),
    ["Open dictionary (Alt+1)", "Open Spanish chat (Alt+2)", "Open Spanish TTS practice (Alt+3)", "Open translator (Alt+4)"],
  );
});

test("toolbar shortcut labels cover common dictionary, chat, and TTS buttons", () => {
  assert.equal(SHORTCUT_LABELS.dictionaryRecents, "Alt+R");
  assert.equal(SHORTCUT_LABELS.dictionaryToggleChat, "Alt+C");
  assert.equal(SHORTCUT_LABELS.chatSend, "Ctrl+Enter");
  assert.equal(SHORTCUT_LABELS.chatClear, "Alt+Backspace");
  assert.equal(SHORTCUT_LABELS.ttsPlay, "Alt+P");
  assert.equal(SHORTCUT_LABELS.ttsPause, "Alt+E");
  assert.equal(SHORTCUT_LABELS.ttsStop, "Alt+S");
});

test("feature shortcut detection recognizes Alt number keys for focused inputs", () => {
  const event = (key: string, extras: Partial<KeyboardEvent> = {}) => ({
    key,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extras,
  }) as KeyboardEvent;

  assert.equal(getFeatureShortcutNumber(event("1")), 1);
  assert.equal(getFeatureShortcutNumber(event("2")), 2);
  assert.equal(getFeatureShortcutNumber(event("3")), 3);
  assert.equal(getFeatureShortcutNumber(event("4")), 4);
  assert.equal(getFeatureShortcutNumber(event("1", { ctrlKey: true })), null);
});

test("Alt letter shortcut detection recognizes physical keys when Alt produces special characters", () => {
  const event = (key: string, code: string, extras: Partial<KeyboardEvent> = {}) => ({
    key,
    code,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extras,
  }) as KeyboardEvent;

  assert.equal(isPlainAltShortcut(event("π", "KeyP"), "p"), true);
  assert.equal(isPlainAltShortcut(event("ß", "KeyS"), "s"), true);
  assert.equal(isPlainAltShortcut(event("å", "KeyA"), "a"), true);
  assert.equal(isPlainAltShortcut(event("p", "KeyP"), "p"), true);
  assert.equal(isPlainAltShortcut(event("π", "KeyP", { shiftKey: true }), "p"), false);
  assert.equal(isPlainAltShortcut(event("π", "KeyX"), "p"), false);
});
