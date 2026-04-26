import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CHAT_FONT_SIZE_PX,
  MAX_CHAT_FONT_SIZE_PX,
  MIN_CHAT_FONT_SIZE_PX,
  adjustChatFontSize,
  normalizeChatFontSize,
} from "../src/ui/chat-font-size-state";

test("normalizeChatFontSize falls back to the default for non-numbers", () => {
  assert.equal(normalizeChatFontSize("16"), DEFAULT_CHAT_FONT_SIZE_PX);
});

test("normalizeChatFontSize clamps to the supported range", () => {
  assert.equal(normalizeChatFontSize(3), MIN_CHAT_FONT_SIZE_PX);
  assert.equal(normalizeChatFontSize(40), MAX_CHAT_FONT_SIZE_PX);
});

test("adjustChatFontSize increments and decrements within bounds", () => {
  assert.equal(adjustChatFontSize(13, 1), 14);
  assert.equal(adjustChatFontSize(13, -1), 12);
});

test("adjustChatFontSize stays clamped at the min and max", () => {
  assert.equal(adjustChatFontSize(MIN_CHAT_FONT_SIZE_PX, -1), MIN_CHAT_FONT_SIZE_PX);
  assert.equal(adjustChatFontSize(MAX_CHAT_FONT_SIZE_PX, 1), MAX_CHAT_FONT_SIZE_PX);
});
