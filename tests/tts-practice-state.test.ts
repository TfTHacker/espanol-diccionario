import test from "node:test";
import assert from "node:assert/strict";

import {
	pushPracticeHistoryEntry,
	sanitizePracticeHistory,
	normalizePracticeDraft,
	normalizePracticeAutoRepeat,
	getPracticePlaybackText,
	getPracticePauseButtonLabel,
	getPracticePauseButtonTitle,
	getNextPracticeHistorySelectionIndex,
	insertImportedText,
	shouldQueuePracticeRepeat,
} from "../src/ui/tts-practice-state";
import { TTS_PRACTICE_COMMAND_PAUSE_MS } from "../src/constants";
import { splitSpanishTtsPlaybackItems, splitSpanishTtsText, stripSpanishTtsMarkdown } from "../src/audio/provider";

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

test("splitSpanishTtsText keeps short single-line text in one chunk", () => {
	assert.deepEqual(splitSpanishTtsText("Hola. Qué tal?", 50), ["Hola. Qué tal?"]);
});

test("splitSpanishTtsText keeps line-break-separated sentences in separate chunks for paced playback", () => {
	assert.deepEqual(splitSpanishTtsText("Hola amigo\n¿Cómo estás?", 50), ["Hola amigo", "¿Cómo estás?"]);
});

test("splitSpanishTtsText removes ignored spans wrapped in dashes before chunking", () => {
	assert.deepEqual(splitSpanishTtsText("—english—: hola amigo", 50), [": hola amigo"]);
	assert.deepEqual(splitSpanishTtsText("--meta-- hola\n—nota— adiós", 50), ["hola", "adiós"]);
});

test("splitSpanishTtsPlaybackItems converts standalone ** commands into one-second pause items", () => {
	assert.deepEqual(splitSpanishTtsPlaybackItems("Hola ** seguimos", 50), [
		{ type: "speech", text: "Hola" },
		{ type: "pause", durationMs: TTS_PRACTICE_COMMAND_PAUSE_MS },
		{ type: "speech", text: "seguimos" },
	]);
});

test("splitSpanishTtsText omits standalone ** pause commands from Google TTS chunks", () => {
	assert.deepEqual(splitSpanishTtsText("Hola ** seguimos", 50), ["Hola", "seguimos"]);
});

test("splitSpanishTtsPlaybackItems preserves line-break chunking around pause commands", () => {
	assert.deepEqual(splitSpanishTtsPlaybackItems("Hola\n**\nAdiós", 50), [
		{ type: "speech", text: "Hola" },
		{ type: "pause", durationMs: TTS_PRACTICE_COMMAND_PAUSE_MS },
		{ type: "speech", text: "Adiós" },
	]);
});

test("splitSpanishTtsPlaybackItems still accepts legacy [[pause]] commands", () => {
	assert.deepEqual(splitSpanishTtsPlaybackItems("Hola [[pause]] seguimos", 50), [
		{ type: "speech", text: "Hola" },
		{ type: "pause", durationMs: TTS_PRACTICE_COMMAND_PAUSE_MS },
		{ type: "speech", text: "seguimos" },
	]);
});

test("splitSpanishTtsText strips copied markdown while preserving readable text", () => {
	assert.deepEqual(
		splitSpanishTtsText("# Título\n- **Hola** [amigo](https://example.com)\n> [[Casa|la casa]] y `gracias`", 80),
		["Título", "Hola amigo", "la casa y gracias"],
	);
});

test("standalone ** pauses do not conflict with markdown bold markers", () => {
	assert.deepEqual(splitSpanishTtsPlaybackItems("**Hola** ** seguimos", 50), [
		{ type: "speech", text: "Hola" },
		{ type: "pause", durationMs: TTS_PRACTICE_COMMAND_PAUSE_MS },
		{ type: "speech", text: "seguimos" },
	]);
});

test("stripSpanishTtsMarkdown removes markdown syntax without removing plain words", () => {
	assert.equal(stripSpanishTtsMarkdown("## Hola\n1. *uno* y __dos__\n~~tres~~"), "Hola\nuno y dos\ntres");
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

test("pause button label and title switch between pause and resume states", () => {
	assert.equal(getPracticePauseButtonLabel(false), "⏸");
	assert.equal(getPracticePauseButtonTitle(false), "Pause audio");
	assert.equal(getPracticePauseButtonLabel(true), "▶");
	assert.equal(getPracticePauseButtonTitle(true), "Resume audio");
});

test("history selection moves with arrow keys and wraps through entries", () => {
	assert.equal(getNextPracticeHistorySelectionIndex(-1, 3, 1), 0);
	assert.equal(getNextPracticeHistorySelectionIndex(-1, 3, -1), 2);
	assert.equal(getNextPracticeHistorySelectionIndex(0, 3, 1), 1);
	assert.equal(getNextPracticeHistorySelectionIndex(2, 3, 1), 0);
	assert.equal(getNextPracticeHistorySelectionIndex(0, 3, -1), 2);
	assert.equal(getNextPracticeHistorySelectionIndex(1, 3, -1), 0);
});

test("history selection returns no active entry when history is empty", () => {
	assert.equal(getNextPracticeHistorySelectionIndex(-1, 0, 1), -1);
	assert.equal(getNextPracticeHistorySelectionIndex(2, 0, -1), -1);
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
