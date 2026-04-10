// src/audio/provider.ts — Audio resolution & playback (Spanish only)
// Resolves audio from Wikimedia Commons (Spain Spanish priority) with Google TTS fallback

import type { AudioRef } from "../dictionary/data";
import type { PluginSettings } from "../settings";

interface ResolvedAudio {
	url: string;
	source: "wikimedia" | "google-tts";
	region: string | null;
}

/**
 * Resolve the best audio URL for a Spanish word.
 * Priority: Wikimedia Commons (Spain) > Wikimedia Commons (Andalusia) > Google TTS
 */
export async function resolveAudio(
	word: string,
	audioRefs: AudioRef[],
	settings: PluginSettings
): Promise<ResolvedAudio | null> {
	// If user prefers Google TTS only, skip Wikimedia
	if (settings.audioSource === "google-tts-only") {
		return getGoogleTtsUrl(word);
	}

	// Sort audio refs: Spain first, then Andalusia, then others
	const sorted = [...audioRefs].sort((a, b) => {
		const priority = (region: string | null) => {
			if (region === "Spain") return 0;
			if (region === "Andalusia") return 1;
			if (region === null) return 2; // default often Spain
			return 3;
		};
		return priority(a.region) - priority(b.region);
	});

	// Try each Wikimedia audio ref
	for (const ref of sorted) {
		const url = await resolveWikimediaUrl(ref.filename);
		if (url) {
			return {
				url,
				source: "wikimedia",
				region: ref.region,
			};
		}
	}

	// Fallback to Google TTS
	return getGoogleTtsUrl(word);
}

/**
 * Resolve a Wikimedia Commons filename to a direct audio URL.
 * Uses the Wikimedia API to get the actual file URL.
 */
async function resolveWikimediaUrl(filename: string): Promise<string | null> {
	try {
		const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;

		const response = await fetch(apiUrl);
		if (!response.ok) return null;

		const data = await response.json();
		const pages = data?.query?.pages;
		if (!pages) return null;

		for (const pageId of Object.keys(pages)) {
			const imageInfo = pages[pageId]?.imageinfo?.[0];
			if (imageInfo?.url) {
				return imageInfo.url;
			}
		}
		return null;
	} catch (err) {
		console.warn("[espanol-diccionario] Failed to resolve Wikimedia URL for", filename, err);
		return null;
	}
}

/**
 * Generate Google TTS URL for Castilian Spanish
 */
function getGoogleTtsUrl(word: string): ResolvedAudio {
	return {
		url: `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=es-ES&client=tw-ob`,
		source: "google-tts",
		region: "Spain",
	};
}

/**
 * Play audio for a Spanish word. Returns an HTMLAudioElement or null if playback fails.
 */
export async function playAudio(audio: ResolvedAudio): Promise<HTMLAudioElement | null> {
	try {
		const audioEl = new Audio(audio.url);
		audioEl.preload = "auto";

		await new Promise<void>((resolve, reject) => {
			audioEl.addEventListener("canplaythrough", () => resolve(), { once: true });
			audioEl.addEventListener("error", () => reject(new Error(`Failed to load audio from ${audio.source}`)), { once: true });
			// Timeout after 5 seconds
			setTimeout(() => reject(new Error("Audio load timeout")), 5000);
			audioEl.load();
		});

		await audioEl.play();
		return audioEl;
	} catch (err) {
		console.warn("[espanol-diccionario] Audio playback failed:", err);
		// If Wikimedia failed and we're using wikimedia-first, try Google TTS as additional fallback
		if (audio.source === "wikimedia") {
			const ttsUrl = getGoogleTtsUrl("");
			// Already tried and failed, don't recurse
		}
		return null;
	}
}