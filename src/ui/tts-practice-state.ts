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
