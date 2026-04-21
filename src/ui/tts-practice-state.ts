import { MAX_TTS_PRACTICE_HISTORY } from "../constants";

export function pushPracticeHistoryEntry(history: readonly string[], value: string, limit = MAX_TTS_PRACTICE_HISTORY): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [...history];

	const next = [trimmed, ...history.filter((item) => item !== trimmed)];
	return next.slice(0, Math.max(1, limit));
}

export function sanitizePracticeHistory(input: unknown, limit = MAX_TTS_PRACTICE_HISTORY): string[] {
	if (!Array.isArray(input)) return [];

	const result: string[] = [];
	for (const item of input) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed || result.includes(trimmed)) continue;
		result.push(trimmed);
		if (result.length >= Math.max(1, limit)) break;
	}
	return result;
}

export function normalizePracticeDraft(input: unknown): string {
	return typeof input === "string" ? input : "";
}

export function normalizePracticeAutoRepeat(input: unknown): boolean {
	return input === true;
}

export function getPracticePlaybackText(text: string, selectionStart: number, selectionEnd: number): string {
	if (selectionStart !== selectionEnd) {
		return text.slice(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd)).trim();
	}
	return text.trim();
}

export function shouldQueuePracticeRepeat(
	autoRepeat: boolean,
	requestId: number,
	activeRequestId: number,
	chunkIndex: number,
	chunkCount: number,
): boolean {
	return autoRepeat && chunkCount > 0 && requestId === activeRequestId && chunkIndex === chunkCount - 1;
}

export function insertImportedText(current: string, imported: string, selectionStart: number, selectionEnd: number): string {
	if (!imported) return current;

	const start = Math.min(selectionStart, selectionEnd);
	const end = Math.max(selectionStart, selectionEnd);
	const prefix = current.slice(0, start);
	const suffix = current.slice(end);
	const isReplacingSelection = start !== end;
	const spacer = prefix && !prefix.endsWith("\n") && !imported.startsWith("\n") ? "\n\n" : "";
	return `${prefix}${isReplacingSelection ? "" : spacer}${imported}${suffix}`;
}
