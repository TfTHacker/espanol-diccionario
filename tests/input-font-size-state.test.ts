import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_INPUT_FONT_SIZE_PX,
  MAX_INPUT_FONT_SIZE_PX,
  MIN_INPUT_FONT_SIZE_PX,
  normalizeInputFontSize,
} from "../src/ui/input-font-size-state";

test("normalizeInputFontSize falls back to the larger readable default for non-numbers", () => {
  assert.equal(normalizeInputFontSize("18"), DEFAULT_INPUT_FONT_SIZE_PX);
  assert.equal(DEFAULT_INPUT_FONT_SIZE_PX, 18);
});

test("normalizeInputFontSize rounds and clamps to the supported range", () => {
  assert.equal(normalizeInputFontSize(3), MIN_INPUT_FONT_SIZE_PX);
  assert.equal(normalizeInputFontSize(40), MAX_INPUT_FONT_SIZE_PX);
  assert.equal(normalizeInputFontSize(18.4), 18);
  assert.equal(normalizeInputFontSize(18.5), 19);
});
