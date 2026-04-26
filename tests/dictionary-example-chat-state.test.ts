import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefinitionExplanationPrompt,
  buildExampleExplanationPrompt,
} from "../src/ui/dictionary-example-chat-state";

test("buildExampleExplanationPrompt includes both Spanish and English when available", () => {
  assert.equal(
    buildExampleExplanationPrompt("Me gusta esta casa.", "I like this house."),
    [
      "Explain this example sentence in more detail.",
      "Spanish: Me gusta esta casa.",
      "English: I like this house.",
      "Please explain the meaning, important vocabulary, grammar, and why this example is useful for a learner.",
    ].join("\n")
  );
});

test("buildExampleExplanationPrompt omits English when no translation is available", () => {
  assert.equal(
    buildExampleExplanationPrompt("Me gusta esta casa."),
    [
      "Explain this example sentence in more detail.",
      "Spanish: Me gusta esta casa.",
      "Please explain the meaning, important vocabulary, grammar, and why this example is useful for a learner.",
    ].join("\n")
  );
});

test("buildDefinitionExplanationPrompt includes the word, translation, and context when available", () => {
  assert.equal(
    buildDefinitionExplanationPrompt("casa", "house, dwelling", "formal"),
    [
      "Help me explore this specific dictionary translation in more detail.",
      "Word: casa",
      "Translation: house, dwelling",
      "Context: formal",
      "Please explain the nuance, likely usage, register, close alternatives, and how this translation differs from similar options.",
    ].join("\n")
  );
});

test("buildDefinitionExplanationPrompt omits context when absent", () => {
  assert.equal(
    buildDefinitionExplanationPrompt("casa", "house, dwelling"),
    [
      "Help me explore this specific dictionary translation in more detail.",
      "Word: casa",
      "Translation: house, dwelling",
      "Please explain the nuance, likely usage, register, close alternatives, and how this translation differs from similar options.",
    ].join("\n")
  );
});
