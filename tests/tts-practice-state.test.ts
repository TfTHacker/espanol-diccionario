import test from "node:test";
import assert from "node:assert/strict";

import {
	pushPracticeHistoryEntry,
	sanitizePracticeHistory,
	normalizePracticeDraft,
} from "../src/ui/tts-practice-state";
import { splitSpanishTtsText } from "../src/audio/provider";

test("pushPracticeHistoryEntry deduplicates matching entries and moves newest to front", () => {
	const history = ["hola", "adiós", "gracias"];
	assert.deepEqual(pushPracticeHistoryEntry(history, "adiós", 5), ["adiós", "hola", "gracias"]);
});

test("pushPracticeHistoryEntry trims input and ignores blank values", () => {
	const history = ["hola"];
	assert.deepEqual(pushPracticeHistoryEntry(history, "   ", 5), ["hola"]);
	assert.deepEqual(pushPracticeHistoryEntry(history, "  buenos días  ", 5), ["buenos días", "hola"]);
});

test("pushPracticeHistoryEntry enforces max history length", () => {
	const history = ["uno", "dos", "tres"];
	assert.deepEqual(pushPracticeHistoryEntry(history, "cuatro", 3), ["cuatro", "uno", "dos"]);
});

test("sanitizePracticeHistory filters non-strings, trims values, deduplicates, and caps length", () => {
	const input = [" hola ", null, "adiós", "hola", 123, "  gracias  ", ""] as unknown[];
	assert.deepEqual(sanitizePracticeHistory(input, 2), ["hola", "adiós"]);
});

test("normalizePracticeDraft preserves text content but rejects non-strings", () => {
	assert.equal(normalizePracticeDraft("  hola\nqué tal  "), "  hola\nqué tal  ");
	assert.equal(normalizePracticeDraft(42), "");
});

test("splitSpanishTtsText keeps short text in one chunk", () => {
	assert.deepEqual(splitSpanishTtsText("Hola. Qué tal?", 50), ["Hola. Qué tal?"]);
});

test("splitSpanishTtsText splits long multi-sentence text into bounded chunks", () => {
	const chunks = splitSpanishTtsText(
		"Primera frase corta. Segunda frase también corta. Tercera frase con más palabras para obligar a dividir el texto.",
		40,
	);
	assert.ok(chunks.length >= 2);
	assert.ok(chunks.every((chunk) => chunk.length <= 40));
});

test("splitSpanishTtsText falls back to word-based chunking for very long sentences", () => {
	const chunks = splitSpanishTtsText("uno dos tres cuatro cinco seis siete ocho nueve diez once doce", 15);
	assert.ok(chunks.length > 1);
	assert.ok(chunks.every((chunk) => chunk.length <= 15));
});

test("splitSpanishTtsText hard-splits tokens longer than the maximum chunk size", () => {
	const longWord = "supercalifragilisticoespialidoso".repeat(3);
	const chunks = splitSpanishTtsText(longWord, 20);
	assert.ok(chunks.length > 1);
	assert.ok(chunks.every((chunk) => chunk.length <= 20));
});
