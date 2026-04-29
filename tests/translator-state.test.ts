import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTranslationBreakdownPrompt,
  buildTranslatorPrompt,
  getTranslatorTtsLocale,
  guessTranslatorSourceLanguage,
  parseTranslatorResponse,
} from "../src/ui/translator-state";

test("translator prompt asks for bidirectional compact JSON", () => {
  const prompt = buildTranslatorPrompt({ text: "Where is the train station?", sourceLanguage: "en" });
  assert.match(prompt, /Translate it to Spanish/);
  assert.match(prompt, /sourceLanguage/);
  assert.match(prompt, /targetLanguage/);
  assert.match(prompt, /Castilian Spanish/);
  assert.match(prompt, /Where is the train station\?/);
});

test("translator response parser accepts fenced JSON and normalizes fields", () => {
  const parsed = parseTranslatorResponse('```json\n{"sourceLanguage":"es","targetLanguage":"en","translation":"Good morning"}\n```');
  assert.deepEqual(parsed, { sourceLanguage: "es", targetLanguage: "en", translation: "Good morning" });
});

test("translator response parser can infer target from fallback source", () => {
  const parsed = parseTranslatorResponse('{"translation":"Hola"}', "en");
  assert.deepEqual(parsed, { sourceLanguage: "en", targetLanguage: "es", translation: "Hola" });
});

test("translator language guessing covers accented Spanish and common English", () => {
  assert.equal(guessTranslatorSourceLanguage("¿Dónde está la estación?"), "es");
  assert.equal(guessTranslatorSourceLanguage("Where is the station?"), "en");
  assert.equal(guessTranslatorSourceLanguage("tren"), undefined);
});

test("translation breakdown prompt includes Leipzig glossing request", () => {
  const prompt = buildTranslationBreakdownPrompt("I want coffee", {
    sourceLanguage: "en",
    targetLanguage: "es",
    translation: "Quiero café",
  });
  assert.match(prompt, /Leipzig glossing/);
  assert.match(prompt, /original, morpheme-by-morpheme gloss, and idiomatic translation/);
  assert.match(prompt, /I want coffee/);
  assert.match(prompt, /Quiero café/);
});

test("translator TTS locale uses English and Castilian Spanish", () => {
  assert.equal(getTranslatorTtsLocale("en"), "en-US");
  assert.equal(getTranslatorTtsLocale("es"), "es-ES");
});
