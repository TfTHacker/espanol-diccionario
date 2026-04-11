// src/dictionary/db.ts — Database layer using sql.js (WebAssembly SQLite)
// Loads dictionary.db from vault and provides query functions
// Auto-downloads missing files (database + WASM) from GitHub releases on first run

import type { WordEntry, Definition, Sentence, LemmaEntry } from "./data";
import { App, requestUrl } from "obsidian";
import initSqlJs, { Database } from "sql.js";
import { GITHUB_RELEASES_BASE } from "../constants";
import { stripAccents } from "../utils/normalize";

let db: Database | null = null;
let dbReady = false;
let initPromise: Promise<void> | null = null;
let cachedStats: DatabaseStats | null = null;

const GITHUB_RELEASES_URL = GITHUB_RELEASES_BASE;

/**
 * Initialize the SQLite database: auto-downloads files if missing, then loads into memory.
 * @param app Obsidian App instance
 * @param pluginDir Vault-relative path to plugin directory (e.g., ".obsidian/plugins/espanol-diccionario")
 */
export async function initDatabase(app: App, pluginDir: string): Promise<void> {
	if (dbReady) return;
	if (initPromise) return initPromise;

	initPromise = _initDatabase(app, pluginDir);
	return initPromise;
}

async function _initDatabase(app: App, pluginDir: string): Promise<void> {
	try {
		console.log("[español-diccionario] Initializing database...");

		// Step 1: Ensure dictionary.db exists locally (download if missing)
		const dbPath = `${pluginDir}/dictionary.db`;
		let dbExists = await app.vault.adapter.exists(dbPath);

		if (!dbExists) {
			console.log("[español-diccionario] dictionary.db not found, downloading...");
			await downloadFile(app, pluginDir, "dictionary.db", `${GITHUB_RELEASES_URL}/dictionary.db`);
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
			await downloadFile(app, pluginDir, "sql-wasm.wasm", `${GITHUB_RELEASES_URL}/sql-wasm.wasm`);
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
async function downloadFile(app: App, pluginDir: string, filename: string, url: string): Promise<void> {
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
async function loadWasmBinary(app: App, pluginDir: string): Promise<ArrayBuffer> {
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
		const adapter = app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
		const resourcePath = adapter.getResourcePath?.(wasmPath);
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

/**
 * Get database statistics (word counts, sizes, etc.)
 */
export interface DatabaseStats {
	esWords: number;
	enWords: number;
	definitions: number;
	sentences: number;
	lemmas: number;
	totalWords: number;
	dbSizeMB: string;
}

export function getDatabaseStats(): DatabaseStats | null {
	if (cachedStats) return cachedStats;
	if (!dbReady || !db) return null;
	try {
		const esWords = db.exec("SELECT COUNT(*) FROM words WHERE lang = 'es'")[0]?.values[0]?.[0] as number ?? 0;
		const enWords = db.exec("SELECT COUNT(*) FROM words WHERE lang = 'en'")[0]?.values[0]?.[0] as number ?? 0;
		const definitions = db.exec("SELECT COUNT(*) FROM definitions")[0]?.values[0]?.[0] as number ?? 0;
		const sentences = db.exec("SELECT COUNT(*) FROM sentences")[0]?.values[0]?.[0] as number ?? 0;
		const lemmas = db.exec("SELECT COUNT(*) FROM lemmas")[0]?.values[0]?.[0] as number ?? 0;
		// Get DB file size from the in-memory database
		const pageSize = db.exec("PRAGMA page_size")[0]?.values[0]?.[0] as number ?? 4096;
		const pageCount = db.exec("PRAGMA page_count")[0]?.values[0]?.[0] as number ?? 0;
		const dbSizeBytes = pageSize * pageCount;
		const dbSizeMB = dbSizeBytes > 0 ? (dbSizeBytes / 1024 / 1024).toFixed(1) : "unknown";
		cachedStats = {
			esWords: Number(esWords),
			enWords: Number(enWords),
			definitions: Number(definitions),
			sentences: Number(sentences),
			lemmas: Number(lemmas),
			totalWords: Number(esWords) + Number(enWords),
			dbSizeMB,
		};
		return cachedStats;
	} catch {
		return null;
	}
}

export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
	dbReady = false;
	initPromise = null;
	cachedStats = null;
}

/**
 * Force re-download of the dictionary database.
 * Deletes the existing DB + WASM files, closes the DB, then re-initializes.
 */
export async function redownloadDatabase(app: App, pluginDir: string): Promise<void> {
	console.log("[español-diccionario] Re-downloading database...");

	// Close existing DB first
	closeDatabase();

	// Delete existing files
	const filesToDelete = ["dictionary.db", "sql-wasm.wasm"];
	for (const filename of filesToDelete) {
		const filePath = `${pluginDir}/${filename}`;
		try {
			const exists = await app.vault.adapter.exists(filePath);
			if (exists) {
				await app.vault.adapter.remove(filePath);
				console.log(`[español-diccionario] Deleted ${filename}`);
			}
		} catch (err) {
			console.warn(`[español-diccionario] Could not delete ${filename}:`, err);
		}
	}

	// Re-initialize (will download fresh copies)
	await initDatabase(app, pluginDir);
	console.log("[español-diccionario] Database re-downloaded successfully");
}

/**
 * Map DB column names (snake_case) to TypeScript property names (camelCase).
 * sql.js getAsObject() returns DB column names like 'word_id', 'sense_num', etc.
 * Our TypeScript interfaces use camelCase like 'wordId', 'senseNum'.
 */
const COLUMN_MAP: Record<string, string> = {
	word_id: "wordId",
	sense_num: "senseNum",
	sentence_es: "sentenceEs",
	sentence_en: "sentenceEn",
};

/**
 * Convert a row from snake_case DB columns to camelCase TypeScript properties.
 */
function toCamelCase(row: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		const mapped = COLUMN_MAP[key] ?? key;
		result[mapped] = value;
	}
	return result;
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
		const row = toCamelCase(stmt.getAsObject() as Record<string, unknown>);
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

	// No lang hint: show Spanish words first, then English
	return queryAll<WordEntry>(
		"SELECT * FROM words WHERE word LIKE ? ORDER BY CASE WHEN lang = 'es' THEN 0 ELSE 1 END, frequency ASC LIMIT ?",
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

// ============================================================
// Accent-insensitive search
// ============================================================

/**
 * Build a SQL expression that strips Spanish diacritics from a column name.
 * Applied inside WHERE clauses for accent-insensitive matching.
 *
 * Maps: á→a, é→e, í→i, ó→o, ú→u, ü→u, ñ→n (and uppercase variants).
 */
function sqlStripAccents(column: string): string {
	return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'), 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'Ü', 'U')`;
}

/**
 * Look up a word with accent-insensitive matching.
 * Strips diacritics from both the search term and stored words,
 * so "arbol" finds "árbol", "estan" finds "están", etc.
 *
 * Uses SQL REPLACE for in-database normalization (acceptable performance
 * since sql.js runs entirely in-memory).
 */
export function lookupWordNormalized(word: string, langHint?: "es" | "en"): WordEntry | null {
	if (!dbReady || !db) return null;
	const normalized = stripAccents(word.toLowerCase().trim());
	if (!normalized) return null;

	const strippedWord = sqlStripAccents("word");

	if (langHint) {
		const result = queryFirst<WordEntry>(
			`SELECT * FROM words WHERE ${strippedWord} = ? AND lang = ? ORDER BY frequency ASC LIMIT 1`,
			[normalized, langHint]
		);
		if (result) return result;
	}

	// Try Spanish first (this is a Spanish dictionary)
	for (const tryLang of ["es", "en"]) {
		const result = queryFirst<WordEntry>(
			`SELECT * FROM words WHERE ${strippedWord} = ? AND lang = ? ORDER BY frequency ASC LIMIT 1`,
			[normalized, tryLang]
		);
		if (result) return result;
	}

	return null;
}

/**
 * Search for words by prefix with accent-insensitive matching.
 * Strips diacritics from both the prefix and stored words,
 * so "arb" finds "árbol", "est" finds "están", etc.
 */
export function searchWordsNormalized(prefix: string, lang?: "es" | "en", limit = 20): WordEntry[] {
	if (!dbReady || !db) return [];
	const normalized = stripAccents(prefix.toLowerCase().trim());
	if (!normalized) return [];

	const strippedWord = sqlStripAccents("word");

	if (lang) {
		return queryAll<WordEntry>(
			`SELECT * FROM words WHERE ${strippedWord} LIKE ? AND lang = ? ORDER BY frequency ASC LIMIT ?`,
			[normalized + "%", lang, limit]
		);
	}

	// No lang hint: show Spanish words first, then English
	return queryAll<WordEntry>(
		`SELECT * FROM words WHERE ${strippedWord} LIKE ? ORDER BY CASE WHEN lang = 'es' THEN 0 ELSE 1 END, frequency ASC LIMIT ?`,
		[normalized + "%", limit]
	);
}

/**
 * Lemmatize a word with accent-insensitive matching.
 * Strips diacritics from both the inflected form and stored lemma entries,
 * so "estan" can find the lemma entry for "están".
 */
export function lemmatizeNormalized(word: string, lang: string = "es"): LemmaEntry[] {
	if (!dbReady || !db) return [];
	const normalized = stripAccents(word.toLowerCase().trim());

	const strippedInflected = sqlStripAccents("inflected");

	return queryAll<LemmaEntry>(
		`SELECT * FROM lemmas WHERE ${strippedInflected} = ? AND lang = ?`,
		[normalized, lang]
	);
}