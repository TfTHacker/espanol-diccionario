import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldAutoFocusDictionarySearch,
  shouldBlurDictionarySearchAfterLookup,
} from "../src/ui/dictionary-focus-state";

test("dictionary search auto-focus is desktop-only", () => {
  assert.equal(shouldAutoFocusDictionarySearch(false), true);
  assert.equal(shouldAutoFocusDictionarySearch(true), false);
});

test("dictionary lookups blur the search field on mobile to dismiss the keyboard", () => {
  assert.equal(shouldBlurDictionarySearchAfterLookup(false), false);
  assert.equal(shouldBlurDictionarySearchAfterLookup(true), true);
});
