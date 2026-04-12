// src/audio/provider.ts — Audio playback using Google TTS (Castilian Spanish)

import { AUDIO_LOAD_TIMEOUT_MS } from "../constants";

/**
 * Get the Google TTS URL for a Spanish word.
 * Uses es-ES locale for Castilian Spanish pronunciation.
 */
export function getAudioUrl(word: string): string {
	return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=es-ES&client=tw-ob`;
}

/**
 * Play audio for a Spanish word via Google TTS.
 * Returns the HTMLAudioElement if playback started, or null on failure.
 */
export async function playAudio(word: string): Promise<HTMLAudioElement | null> {
	try {
		const url = getAudioUrl(word);
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