import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatFollowUpSuggestions,
  buildContinueSuggestionPrompt,
  buildLookupChatSuggestions,
  buildLookupSuggestionPrompt,
  buildStaticLookupQuestion,
  extractAnswerTopic,
  filterNewSuggestions,
  parseLlmSuggestionList,
} from "../src/ui/chat-follow-up-state";

test("extractAnswerTopic prefers markdown headings and inline emphasis", () => {
  assert.equal(extractAnswerTopic("### Por vs para\nUse **por** for cause."), "Por vs para");
  assert.equal(extractAnswerTopic("This is about **register and tone** in Spain."), "register and tone");
});

test("static lookup question is always the first Ask prompt", () => {
  assert.equal(buildStaticLookupQuestion("tener"), "Tell me more about the word tener");
});

test("LLM suggestion prompts request strict JSON for lookup and Continue questions", () => {
  const lookupPrompt = buildLookupSuggestionPrompt({
    word: "tener",
    lang: "es",
    pos: "verb",
    definitions: ["to have"],
  });
  assert.match(lookupPrompt, /exactly 3/);
  assert.match(lookupPrompt, /generic 'tell me more' question/);
  assert.match(lookupPrompt, /Return only a JSON array/);
  assert.match(lookupPrompt, /Write every question in English/);
  assert.match(lookupPrompt, /under 120 characters/);
  assert.match(lookupPrompt, /Word: tener/);
  assert.match(lookupPrompt, /Part of speech: verb/);

  const continuePrompt = buildContinueSuggestionPrompt("The answer discusses **tener que**.", {
    word: "tener",
    lang: "es",
    pos: "verb",
    definitions: ["to have"],
  }, ["How do I use tener que?", "Can tener express age?"]);
  assert.match(continuePrompt, /exactly 3/);
  assert.match(continuePrompt, /Latest assistant answer/);
  assert.match(continuePrompt, /tener que/);
  assert.match(continuePrompt, /Do not repeat or closely paraphrase/);
  assert.match(continuePrompt, /Can tener express age\?/);
});

test("filterNewSuggestions removes repeated previous Continue questions", () => {
  const suggestions = filterNewSuggestions([
    "How do I use tener que?",
    "How do I use tener que?",
    "Can tener express obligation?",
    "What phrases use tener hambre?",
  ], ["How do I use tener que?"], 3);

  assert.deepEqual(suggestions, ["Can tener express obligation?", "What phrases use tener hambre?"]);
});

test("parseLlmSuggestionList accepts JSON arrays and numbered fallback lists", () => {
  assert.deepEqual(parseLlmSuggestionList('["One?", "Two?", "Two?", "Three?"]', 3), ["One?", "Two?", "Three?"]);
  assert.deepEqual(parseLlmSuggestionList('1. First?\n2. Second?\nNot a question.\n3. Third?', 2), ["First?", "Second?"]);
});

test("lookup Ask suggestions are four dynamic questions based on the looked-up word", () => {
  const suggestions = buildLookupChatSuggestions({
    word: "tener",
    lang: "es",
    pos: "verb",
    definitions: ["to have", "to hold"],
  });

  assert.deepEqual(suggestions, [
    "Tell me more about the word tener",
    "How do I use and conjugate \"tener\" meaning \"to have\" in common Spain Spanish phrases?",
    "When does \"tener\" mean \"to have\" vs \"to hold\"?",
    "What words or phrases are easy to confuse with \"tener\"?",
  ]);
});

test("lookup Ask suggestions tailor noun questions to collocations and examples", () => {
  const suggestions = buildLookupChatSuggestions({
    word: "casa",
    lang: "es",
    pos: "noun",
    definitions: ["house"],
  });

  assert.deepEqual(suggestions, [
    "Tell me more about the word casa",
    "What are the most natural collocations and set phrases with \"casa\" meaning \"house\"?",
    "What direct-translation trap should I watch for with \"casa\" meaning \"house\"?",
    "What words or phrases are easy to confuse with \"casa\"?",
  ]);
});

test("buildChatFollowUpSuggestions limits Continue prompts to three word-specific questions", () => {
  const suggestions = buildChatFollowUpSuggestions("The key topic is **formal register**.", {
    word: "usted",
    lang: "es",
    pos: "pronoun",
    definitions: ["you", "you all"],
  });

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0], "When would a native speaker in Spain choose \"usted\" meaning \"you\" instead of another pronoun?");
  assert.equal(suggestions[1], "When does \"usted\" mean \"you\" vs \"you all\"?");
  assert.equal(suggestions[2], "What might English speakers confuse \"usted\" with, and how do I avoid that?");
});

test("buildChatFollowUpSuggestions tailors the first prompt to verb learning needs", () => {
  const suggestions = buildChatFollowUpSuggestions("A short explanation without obvious topics.", {
    word: "tener",
    lang: "es",
    pos: "verb",
    definitions: ["to have"],
  });

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0], "How do I use and conjugate \"tener\" meaning \"to have\" in common Spain Spanish phrases?");
  assert.equal(suggestions[1], "What direct-translation trap should I watch for with \"tener\" meaning \"to have\"?");
});

test("buildChatFollowUpSuggestions tailors noun prompts to collocations and set phrases", () => {
  const suggestions = buildChatFollowUpSuggestions("A short explanation without obvious topics.", {
    word: "casa",
    lang: "es",
    pos: "noun",
    definitions: ["house"],
  });

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0], "What are the most natural collocations and set phrases with \"casa\" meaning \"house\"?");
  assert.equal(suggestions[1], "What direct-translation trap should I watch for with \"casa\" meaning \"house\"?");
});
