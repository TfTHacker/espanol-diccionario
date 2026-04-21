import test from "node:test";
import assert from "node:assert/strict";

import {
	pushPracticeHistoryEntry,
	sanitizePracticeHistory,
	normalizePracticeDraft,
	normalizePracticeAutoRepeat,
	getPracticePlaybackText,
	insertImportedText,
	shouldQueuePracticeRepeat,
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

test("normalizePracticeAutoRepeat accepts only boolean true and falls back to false otherwise", () => {
	assert.equal(normalizePracticeAutoRepeat(true), true);
	assert.equal(normalizePracticeAutoRepeat(false), false);
	assert.equal(normalizePracticeAutoRepeat("true"), false);
	assert.equal(normalizePracticeAutoRepeat(undefined), false);
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

test("getPracticePlaybackText prefers selected textarea content when present", () => {
	const text = "Primera línea.\nSegunda línea.\nTercera línea.";
	const start = text.indexOf("Segunda");
	const end = start + "Segunda línea.".length;
	assert.equal(getPracticePlaybackText(text, start, end), "Segunda línea.");
});

test("getPracticePlaybackText falls back to the full trimmed block when selection is empty", () => {
	assert.equal(getPracticePlaybackText("  Hola mundo  ", 2, 2), "Hola mundo");
});

test("getPracticePlaybackText does not fall back to the full block for whitespace-only selections", () => {
	assert.equal(getPracticePlaybackText("Hola mundo", 4, 5), "");
});

test("shouldQueuePracticeRepeat only repeats after the final chunk when auto-repeat is enabled for the active request", () => {
	assert.equal(shouldQueuePracticeRepeat(true, 7, 7, 2, 3), true);
	assert.equal(shouldQueuePracticeRepeat(false, 7, 7, 2, 3), false);
	assert.equal(shouldQueuePracticeRepeat(true, 7, 8, 2, 3), false);
	assert.equal(shouldQueuePracticeRepeat(true, 7, 7, 1, 3), false);
	assert.equal(shouldQueuePracticeRepeat(true, 7, 7, 0, 0), false);
});

test("insertImportedText replaces the current selection with imported file text", () => {
	const current = "Uno\nDos\nTres";
	const start = current.indexOf("Dos");
	const end = start + "Dos".length;
	assert.equal(insertImportedText(current, "Archivo\nImportado", start, end), "Uno\nArchivo\nImportado\nTres");
});

test("insertImportedText appends imported file text when there is no selection", () => {
	assert.equal(insertImportedText("Uno", "Dos", 3, 3), "Uno\n\nDos");
	assert.equal(insertImportedText("", "Dos", 0, 0), "Dos");
});

test("insertImportedText inserts imported text at the caret when there is no selection", () => {
	assert.equal(insertImportedText("Uno Tres", "Dos", 4, 4), "Uno \n\nDosTres");
});

test("insertImportedText preserves imported whitespace and indentation", () => {
	const imported = "  código\n    bloque\n";
	assert.equal(insertImportedText("Base", imported, 4, 4), "Base\n\n  código\n    bloque\n");
});
