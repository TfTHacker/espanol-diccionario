// src/audio/cache.ts — Audio file caching in vault
// Caches downloaded audio files in the plugin's data directory

import type { App } from "obsidian";

const AUDIO_CACHE_DIR = "audio-cache";

/**
 * Get a cached audio file URL, or download and cache it.
 * Returns a URL suitable for an Audio element.
 */
export async function getCachedAudio(
	app: App,
	pluginDir: string,
	url: string,
	filename: string
): Promise<string | null> {
	const cachePath = `${pluginDir}/${AUDIO_CACHE_DIR}/${filename}`;

	// Check cache
	try {
		const exists = await app.vault.adapter.exists(cachePath);
		if (exists) {
			// Return as a blob URL for the Audio element
			const data = await app.vault.adapter.readBinary(cachePath);
			const blob = new Blob([data], { type: "audio/ogg" });
			return URL.createObjectURL(blob);
		}
	} catch (e) {
		// Not cached, proceed to download
	}

	// Download the audio file
	try {
		const response = await fetch(url);
		if (!response.ok) return null;

		const arrayBuffer = await response.arrayBuffer();
		const uint8 = new Uint8Array(arrayBuffer);

		// Ensure cache directory exists
		const dirPath = `${pluginDir}/${AUDIO_CACHE_DIR}`;
		const dirExists = await app.vault.adapter.exists(dirPath);
		if (!dirExists) {
			await app.vault.adapter.mkdir(dirPath);
		}

		// Save to cache
		await app.vault.adapter.writeBinary(cachePath, uint8.buffer as ArrayBuffer);

		// Create blob URL
		const blob = new Blob([uint8], { type: "audio/ogg" });
		return URL.createObjectURL(blob);
	} catch (err) {
		console.warn("[espanol-diccionario] Failed to cache audio:", err);
		return null;
	}
}

/**
 * Clear the audio cache
 */
export async function clearAudioCache(app: App, pluginDir: string): Promise<void> {
	const cachePath = `${pluginDir}/${AUDIO_CACHE_DIR}`;
	try {
		const exists = await app.vault.adapter.exists(cachePath);
		if (exists) {
			await app.vault.adapter.remove(cachePath);
		}
	} catch (err) {
		console.warn("[espanol-diccionario] Failed to clear audio cache:", err);
	}
}