// src/dictionary/db.ts — Database layer using sql.js (WebAssembly SQLite)
// Loads dictionary.db from vault and provides query functions
// Auto-downloads missing files (database + WASM) from GitHub releases on first run

import type { WordEntry, Definition, Sentence, AudioRef, LemmaEntry } from "./data";
import initSqlJs, { Database } from "sql.js";

let db: Database | null = null;
let dbReady = false;
let initPromise: Promise<void> | null = null;

// GitHub release URL base — update when releasing new versions
const GITHUB_RELEASES_BASE = "https://github.com/TfTHacker/espanol-diccionario/releases/latest/download";

/**
 * Initialize the SQLite database: auto-downloads files if missing, then loads into memory.
 * @param app Obsidian App instance
 * @param pluginDir Vault-relative path to plugin directory (e.g., ".obsidian/plugins/espanol-diccionario")
 */
export async function initDatabase(app: any, pluginDir: string): Promise<void> {
	if (dbReady) return;
	if (initPromise) return initPromise;

	initPromise = _initDatabase(app, pluginDir);
	return initPromise;
}

async function _initDatabase(app: any, pluginDir: string): Promise<void> {
	try {
		console.log("[español-diccionario] Initializing database...");

		// Step 1: Ensure dictionary.db exists locally (download if missing)
		const dbPath = `${pluginDir}/dictionary.db`;
		let dbExists = await app.vault.adapter.exists(dbPath);

		if (!dbExists) {
			console.log("[español-diccionario] dictionary.db not found, downloading...");
			await downloadFile(app, pluginDir, "dictionary.db", `${GITHUB_RELEASES_BASE}/dictionary.db`);
			dbExists = await app.vault.adapter.exists(dbPath);
			if (!dbExists) {
				throw new Error("Failed to download dictionary.db. Please check your internet connection or manually place the file in the plugin directory.");
			}
			console.log("[español-diccionario] dictionary.db downloaded successfully");
		}

		// Step 2: Ensure sql-wasm.wasm exists locally (download if missing)
		const wasmPath = `${pluginDir}/sql-wasm.wasm`;
		let wasmExists = await app.vault.adapter.exists(wasmPath);

		if (!wasmExists) {
			console.log("[español-diccionario] sql-wasm.wasm not found, downloading...");
			await downloadFile(app, pluginDir, "sql-wasm.wasm", `${GITHUB_RELEASES_BASE}/sql-wasm.wasm`);
			wasmExists = await app.vault.adapter.exists(wasmPath);
			if (!wasmExists) {
				throw new Error("Failed to download sql-wasm.wasm. Please check your internet connection.");
			}
			console.log("[español-diccionario] sql-wasm.wasm downloaded successfully");
		}

		// Step 3: Load the dictionary.db binary data
		console.log("[español-diccionario] Loading dictionary.db...");
		const dbBuffer = await app.vault.adapter.readBinary(dbPath);
		const dbUint8 = new Uint8Array(dbBuffer);
		console.log("[español-diccionario] Loaded dictionary.db, size:", dbUint8.byteLength, "bytes");

		// Step 4: Load the WASM binary
		const wasmBinary = await loadWasmBinary(app, pluginDir);
		console.log("[español-diccionario] WASM binary loaded, size:", wasmBinary.byteLength, "bytes");

		// Step 5: Initialize sql.js
		const SQL = await initSqlJs({
			wasmBinary: wasmBinary,
		});
		console.log("[español-diccionario] sql.js initialized");

		// Step 6: Load the database into memory
		db = new SQL.Database(dbUint8);
		dbReady = true;

		console.log("[español-diccionario] Database initialized successfully");
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : (typeof err === "string" ? err : JSON.stringify(err));
		console.error("[español-diccionario] Failed to initialize database:", errMsg, err);
		throw new Error(errMsg || "Unknown database initialization error");
	}
}

/**
 * Download a file from a URL and save it to the plugin directory.
 * Uses requestUrl (Obsidian API) for cross-platform compatibility (works on mobile too).
 */
async function downloadFile(app: any, pluginDir: string, filename: string, url: string): Promise<void> {
	const { requestUrl } = await import("obsidian");

	console.log("[español-diccionario] Downloading", url);
	const response = await requestUrl({
		url: url,
		method: "GET",
	});

	if (response.status !== 200) {
		throw new Error(`Failed to download ${filename}: HTTP ${response.status}`);
	}

	// requestUrl returns an ArrayBuffer for binary content
	const arrayBuffer = response.arrayBuffer;
	const targetPath = `${pluginDir}/${filename}`;

	// Ensure the plugin directory exists
	const dirExists = await app.vault.adapter.exists(pluginDir);
	if (!dirExists) {
		await app.vault.adapter.mkdir(pluginDir);
	}

	await app.vault.adapter.writeBinary(targetPath, arrayBuffer);
	console.log("[español-diccionario] Saved", filename, "to", targetPath);
}

/**
 * Load the sql.js WASM binary from the vault.
 * Falls back to CDN if the local file is somehow missing.
 */
async function loadWasmBinary(app: any, pluginDir: string): Promise<ArrayBuffer> {
	const wasmPath = `${pluginDir}/sql-wasm.wasm`;

	// Try loading from vault via readBinary
	try {
		const exists = await app.vault.adapter.exists(wasmPath);
		if (exists) {
			console.log("[español-diccionario] Loading WASM from vault:", wasmPath);
			const buffer = await app.vault.adapter.readBinary(wasmPath);
			return buffer;
		}
	} catch (err) {
		console.warn("[español-diccionario] Could not load WASM from vault:", err);
	}

	// Try loading via Obsidian's resource path (for desktop)
	try {
		const resourcePath = (app as any).vault.adapter.getResourcePath?.(wasmPath);
		if (resourcePath) {
			console.log("[español-diccionario] Loading WASM via resource path:", resourcePath);
			const response = await fetch(resourcePath);
			if (response.ok) {
				return await response.arrayBuffer();
			}
		}
	} catch (err) {
		console.warn("[español-diccionario] Could not load WASM via resource path:", err);
	}

	// Fallback: CDN
	console.warn("[español-diccionario] Loading sql-wasm.wasm from CDN as fallback");
	const response = await fetch("https://sql.js.org/dist/sql-wasm.wasm");
	if (!response.ok) {
		throw new Error("Failed to load sql.js WASM from CDN");
	}
	return await response.arrayBuffer();
}

export function isDatabaseReady(): boolean {
	return dbReady;
}

export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
	dbReady = false;
	initPromise = null;
}

/**
 * Execute a query and return all rows as typed objects
 */
function queryAll<T extends Record<string, any>>(sql: string, params: any[] = []): T[] {
	if (!db) return [];

	const stmt = db.prepare(sql);
	if (params.length > 0) {
		stmt.bind(params);
	}

	const results: T[] = [];
	while (stmt.step()) {
		const row = stmt.getAsObject();
		results.push(row as T);
	}
	stmt.free();
	return results;
}

/**
 * Execute a query and return the first row, or null
 */
function queryFirst<T extends Record<string, any>>(sql: string, params: any[] = []): T | null {
	const results = queryAll<T>(sql, params);
	return results.length > 0 ? results[0] : null;
}

/**
 * Detect language of a word (simple heuristic)
 */
function detectLang(word: string): "es" | "en" {
	const spanishChars = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
	if (spanishChars.test(word)) return "es";
	return "en";
}

/**
 * Look up a word (exact match). Tries both languages if no hint provided.
 */
export function lookupWord(word: string, langHint?: "es" | "en"): WordEntry | null {
	if (!dbReady || !db) return null;
	const normalized = word.toLowerCase().trim();

	// Try the hinted language first
	if (langHint) {
		const result = queryFirst<WordEntry>(
			"SELECT * FROM words WHERE word = ? AND lang = ? ORDER BY frequency ASC LIMIT 1",
			[normalized, langHint]
		);
		if (result) return result;
	}

	// Auto-detect: try Spanish first (since this is a Spanish dictionary)
	const detectedLang = langHint || detectLang(normalized);
	for (const tryLang of [detectedLang, detectedLang === "es" ? "en" : "es"]) {
		const result = queryFirst<WordEntry>(
			"SELECT * FROM words WHERE word = ? AND lang = ? ORDER BY frequency ASC LIMIT 1",
			[normalized, tryLang]
		);
		if (result) return result;
	}

	// Last resort: try both languages, most frequent first
	return queryFirst<WordEntry>(
		"SELECT * FROM words WHERE word = ? ORDER BY frequency ASC LIMIT 1",
		[normalized]
	);
}

/**
 * Search for words (prefix match for autocomplete)
 */
export function searchWords(prefix: string, lang?: "es" | "en", limit = 20): WordEntry[] {
	if (!dbReady || !db) return [];
	const normalized = prefix.toLowerCase().trim();

	if (lang) {
		return queryAll<WordEntry>(
			"SELECT * FROM words WHERE word LIKE ? AND lang = ? ORDER BY frequency ASC LIMIT ?",
			[normalized + "%", lang, limit]
		);
	}

	return queryAll<WordEntry>(
		"SELECT * FROM words WHERE word LIKE ? ORDER BY frequency ASC LIMIT ?",
		[normalized + "%", limit]
	);
}

/**
 * Get definitions for a word
 */
export function getDefinitions(wordId: number): Definition[] {
	if (!dbReady || !db) return [];
	return queryAll<Definition>(
		"SELECT * FROM definitions WHERE word_id = ? ORDER BY sense_num ASC",
		[wordId]
	);
}

/**
 * Get example sentences for a word
 */
export function getSentences(wordId: number, limit = 5): Sentence[] {
	if (!dbReady || !db) return [];
	return queryAll<Sentence>(
		"SELECT * FROM sentences WHERE word_id = ? LIMIT ?",
		[wordId, limit]
	);
}

/**
 * Get audio references for a word
 */
export function getAudioRefs(wordId: number): AudioRef[] {
	if (!dbReady || !db) return [];
	return queryAll<AudioRef>(
		"SELECT * FROM audio_refs WHERE word_id = ? ORDER BY CASE WHEN region = 'Spain' THEN 0 WHEN region = 'Andalusia' THEN 1 ELSE 2 END",
		[wordId]
	);
}

/**
 * Lemmatize a word (find the dictionary form)
 */
export function lemmatize(word: string, lang: string = "es"): LemmaEntry[] {
	if (!dbReady || !db) return [];
	const normalized = word.toLowerCase().trim();
	return queryAll<LemmaEntry>(
		"SELECT * FROM lemmas WHERE inflected = ? AND lang = ?",
		[normalized, lang]
	);
}