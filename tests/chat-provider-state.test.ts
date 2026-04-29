import test from "node:test";
import assert from "node:assert/strict";

import { buildChatSystemMessage } from "../src/chat/system-message";

test("dictionary chat system message tells the model not to include inline follow-up offers", () => {
  const system = buildChatSystemMessage("Tutor prompt", "Word context");

  assert.match(system, /Tutor prompt/);
  assert.match(system, /Word context/);
  assert.match(system, /Do not include meta follow-up offers or suggested next questions/);
  assert.match(system, /Continue suggestions/);
  assert.ok(system.indexOf("Tutor prompt") < system.indexOf("Do not include meta follow-up"));
  assert.ok(system.indexOf("Do not include meta follow-up") < system.indexOf("Word context"));
});

test("dictionary chat system message includes no-inline-follow-up instruction even without word context", () => {
  const system = buildChatSystemMessage("Tutor prompt");

  assert.match(system, /Tutor prompt/);
  assert.match(system, /Would you like/);
  assert.doesNotMatch(system, /undefined/);
});
