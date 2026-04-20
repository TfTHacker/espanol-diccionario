// src/audio/provider.ts — Audio playback using Google TTS (Castilian Spanish)

import { AUDIO_LOAD_TIMEOUT_MS } from "../constants";

const GOOGLE_TTS_MAX_CHARS = 180;

/**
 * Get the Google TTS URL for a Spanish word.
 * Uses es-ES locale for Castilian Spanish pronunciation.
 */
export function getSpanishTtsUrl(text: string): string {
	return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=es-ES&client=tw-ob`;
}

export function splitSpanishTtsText(text: string, maxChars = GOOGLE_TTS_MAX_CHARS): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.length <= maxChars) return [trimmed];

	const normalized = trimmed.replace(/\s+/g, " ");
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

/**
 * Play audio for a Spanish word via Google TTS.
 * Returns the HTMLAudioElement if playback started, or null on failure.
 */
export async function playSpanishAudio(text: string): Promise<HTMLAudioElement | null> {
	try {
		const url = getSpanishTtsUrl(text);
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

export const getAudioUrl = getSpanishTtsUrl;
export const playAudio = playSpanishAudio;