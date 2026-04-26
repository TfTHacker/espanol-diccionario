import test from "node:test";
import assert from "node:assert/strict";

import { getScrollTopForMessageTop } from "../src/ui/chat-scroll-state";

test("getScrollTopForMessageTop aligns a new message to the top padding when it starts below the viewport", () => {
  assert.equal(getScrollTopForMessageTop(0, 240, 320, 120), 312);
});

test("getScrollTopForMessageTop keeps scroll position when the whole message is already visible", () => {
  assert.equal(getScrollTopForMessageTop(120, 300, 180, 80), 120);
});

test("getScrollTopForMessageTop still aligns tall messages to their top instead of chasing the bottom", () => {
  assert.equal(getScrollTopForMessageTop(400, 240, 520, 500), 512);
});

test("getScrollTopForMessageTop never scrolls above zero", () => {
  assert.equal(getScrollTopForMessageTop(50, 240, 4, 100), 0);
});
