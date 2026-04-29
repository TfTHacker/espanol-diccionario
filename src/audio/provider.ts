// src/audio/provider.ts — Audio playback using Google TTS (Castilian Spanish)

import { AUDIO_LOAD_TIMEOUT_MS, TTS_PRACTICE_COMMAND_PAUSE_MS } from "../constants";

const GOOGLE_TTS_MAX_CHARS = 180;
const TTS_IGNORED_SPAN_PATTERN = /(\-\-|—|–)([^\n]*?)\1/g;
const TTS_PAUSE_SENTINEL = "\uE000TTS_PAUSE\uE000";
const TTS_PAUSE_COMMAND_PATTERN = /(^|\s)(?:\*\*|\[\[\s*pause\s*\]\])(?=$|\s)/gi;
const TTS_PAUSE_SENTINEL_PATTERN = /(\uE000TTS_PAUSE\uE000)/g;

export type SpanishTtsPlaybackItem =
	| { type: "speech"; text: string }
	| { type: "pause"; durationMs: number };

/**
 * Get the Google TTS URL for a Spanish word.
 * Uses es-ES locale for Castilian Spanish pronunciation.
 */
export function getTtsUrl(text: string, locale: "es-ES" | "en-US" = "es-ES"): string {
	return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(locale)}&client=tw-ob`;
}

export function getSpanishTtsUrl(text: string): string {
	return getTtsUrl(text, "es-ES");
}

export function stripIgnoredSpanishTtsText(text: string): string {
	return text.replace(TTS_IGNORED_SPAN_PATTERN, "");
}

function markSpanishTtsPauseCommands(text: string): string {
	return text.replace(TTS_PAUSE_COMMAND_PATTERN, (_match, prefix: string) => `${prefix}${TTS_PAUSE_SENTINEL}`);
}

export function stripSpanishTtsMarkdown(text: string): string {
	return text
		.replace(/^\s*```[\s\S]*?^\s*```/gm, (block) => block.replace(/^\s*```.*$/gm, ""))
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s{0,3}>\s?/gm, "")
		.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+[.)]\s+/gm, "")
		.replace(/<[^>]+>/g, "")
		.replace(/(\*\*|__|~~|==)/g, "")
		.replace(/(^|[^\w])([*_])([^*_]+)\2(?=$|[^\w])/g, "$1$3");
}

function chunkNormalizedSpan(text: string, maxChars: number): string[] {
	const normalized = text.trim().replace(/\s+/g, " ");
	if (!normalized) return [];
	if (normalized.length <= maxChars) return [normalized];

	const segments = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
	const chunks: string[] = [];
	let current = "";

	const flushCurrent = () => {
		const value = current.trim();
		if (value) chunks.push(value);
		current = "";
	};

	for (const segment of segments) {
		const sentence = segment.trim();
		if (!sentence) continue;

		if (sentence.length > maxChars) {
			flushCurrent();
			const words = sentence.split(/\s+/);
			let wordChunk = "";
			for (const word of words) {
				if (word.length > maxChars) {
					if (wordChunk) {
						chunks.push(wordChunk);
						wordChunk = "";
					}
					for (let i = 0; i < word.length; i += maxChars) {
						chunks.push(word.slice(i, i + maxChars));
					}
					continue;
				}

				const candidate = wordChunk ? `${wordChunk} ${word}` : word;
				if (candidate.length <= maxChars) {
					wordChunk = candidate;
				} else {
					if (wordChunk) chunks.push(wordChunk);
					wordChunk = word;
				}
			}
			if (wordChunk) chunks.push(wordChunk);
			continue;
		}

		const candidate = current ? `${current} ${sentence}` : sentence;
		if (candidate.length <= maxChars) {
			current = candidate;
		} else {
			flushCurrent();
			current = sentence;
		}
	}

	flushCurrent();
	return chunks;
}

export function splitSpanishTtsPlaybackItems(text: string, maxChars = GOOGLE_TTS_MAX_CHARS): SpanishTtsPlaybackItem[] {
	const cleaned = stripSpanishTtsMarkdown(markSpanishTtsPauseCommands(stripIgnoredSpanishTtsText(text)))
		.replace(/\r/g, "")
		.trim();
	if (!cleaned) return [];

	const spans = cleaned
		.split(/\n+/)
		.map((span) => span.trim())
		.filter((span) => span.length > 0);

	if (spans.length === 0) return [];

	const items: SpanishTtsPlaybackItem[] = [];
	for (const span of spans) {
		const parts = span.split(TTS_PAUSE_SENTINEL_PATTERN);
		for (const part of parts) {
			if (!part.trim()) continue;
			if (part === TTS_PAUSE_SENTINEL) {
				items.push({ type: "pause", durationMs: TTS_PRACTICE_COMMAND_PAUSE_MS });
				continue;
			}
			items.push(...chunkNormalizedSpan(part, maxChars).map((chunk) => ({ type: "speech" as const, text: chunk })));
		}
	}

	return items;
}

export function splitSpanishTtsText(text: string, maxChars = GOOGLE_TTS_MAX_CHARS): string[] {
	return splitSpanishTtsPlaybackItems(text, maxChars)
		.filter((item): item is Extract<SpanishTtsPlaybackItem, { type: "speech" }> => item.type === "speech")
		.map((item) => item.text);
}

/**
 * Play audio for a Spanish word via Google TTS.
 * Returns the HTMLAudioElement if playback started, or null on failure.
 */
export async function playTextAudio(text: string, locale: "es-ES" | "en-US" = "es-ES"): Promise<HTMLAudioElement | null> {
	try {
		const url = getTtsUrl(text, locale);
		const audioEl = new Audio(url);
		audioEl.preload = "auto";

		await new Promise<void>((resolve, reject) => {
			const onCanPlay = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Audio load failed"));
			};
			const onTimeout = () => {
				cleanup();
				reject(new Error("Audio load timeout"));
			};

			const cleanup = () => {
				audioEl.removeEventListener("canplaythrough", onCanPlay);
				audioEl.removeEventListener("error", onError);
				clearTimeout(timer);
			};

			const timer = setTimeout(onTimeout, AUDIO_LOAD_TIMEOUT_MS);

			audioEl.addEventListener("canplaythrough", onCanPlay, { once: true });
			audioEl.addEventListener("error", onError, { once: true });
			audioEl.load();
		});

		await audioEl.play();
		return audioEl;
	} catch (err) {
		console.warn("[español-diccionario] Audio playback failed:", err);
		return null;
	}
}

export async function playSpanishAudio(text: string): Promise<HTMLAudioElement | null> {
	return playTextAudio(text, "es-ES");
}

export const getAudioUrl = getSpanishTtsUrl;
export const playAudio = playSpanishAudio;