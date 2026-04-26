import test from "node:test";
import assert from "node:assert/strict";

import { buildChatFollowUpSuggestions, extractAnswerTopic } from "../src/ui/chat-follow-up-state";

test("extractAnswerTopic prefers markdown headings and inline emphasis", () => {
  assert.equal(extractAnswerTopic("### Por vs para\nUse **por** for cause."), "Por vs para");
  assert.equal(extractAnswerTopic("This is about **register and tone** in Spain."), "register and tone");
});

test("buildChatFollowUpSuggestions prioritizes English-speaker confusion questions", () => {
  const suggestions = buildChatFollowUpSuggestions("The key topic is **formal register**.", {
    word: "usted",
    lang: "es",
    definitions: ["you", "you all"],
  });
  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0], "What might English speakers confuse \"usted\" with, and how do I avoid that?");
  assert.equal(suggestions[1], "When does \"usted\" mean \"you\" vs \"you all\"?");
  assert.ok(suggestions.some((item) => item.includes("real Spanish")));
});

test("buildChatFollowUpSuggestions asks about direct-translation traps when only one definition is available", () => {
  const suggestions = buildChatFollowUpSuggestions("A short explanation without obvious topics.", {
    word: "casa",
    lang: "es",
    definitions: ["house"],
  });
  assert.equal(suggestions[0], "What might English speakers confuse \"casa\" with, and how do I avoid that?");
  assert.equal(suggestions[1], "What direct-translation trap should I watch for with \"casa\" meaning \"house\"?");
});
