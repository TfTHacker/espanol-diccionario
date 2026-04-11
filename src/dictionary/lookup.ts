// src/dictionary/lookup.ts — Dictionary search & data access (EN↔ES bidirectional)
// High-level lookup API that combines lemmatization, accent-insensitive matching, etc.

import { lookupWord, searchWords, getDefinitions, getSentences, lemmatize, isDatabaseReady, lookupWordNormalized, searchWordsNormalized, lemmatizeNormalized } from "./db";
import type { DictionaryResult, LookupOptions } from "./data";

/**
 * Full dictionary lookup: resolves the word through multiple strategies:
 *   1. Exact match
 *   2. Accent-insensitive match (e.g., "arbol" → "árbol")
 *   3. Lemmatization (e.g., "hablamos" → "hablar")
 *   4. Accent-insensitive lemmatization (e.g., "estan" → lemma for "están" → "estar")
 *
 * Then fetches definitions and sentences.
 */
export function fullLookup(word: string, options?: LookupOptions): DictionaryResult | null {
	if (!isDatabaseReady()) {
		console.warn("[español-diccionario] Database not ready for lookup");
		return null;
	}

	const normalized = word.toLowerCase().trim();
	if (!normalized) return null;

	const langHint = options?.langHint;
	const maxSentences = options?.maxSentences ?? 5;

	// Step 1: Try exact word match first
	let wordEntry = lookupWord(normalized, langHint);
	let resolvedFrom: string | undefined;

	// Step 2: If not found, try accent-insensitive match (e.g., "arbol" → "árbol")
	if (!wordEntry) {
		wordEntry = lookupWordNormalized(normalized, langHint);
		if (wordEntry) {
			// The user typed an unaccented form — track this as a resolution
			resolvedFrom = normalized;
		}
	}

	// Step 3: If not found, try lemmatization (e.g., "hablamos" → "hablar")
	if (!wordEntry) {
		const lemmas = lemmatize(normalized, langHint || "es");
		if (lemmas.length > 0) {
			for (const lemma of lemmas) {
				wordEntry = lookupWord(lemma.lemma, (lemma.lang || langHint) as "es" | "en");
				if (wordEntry) {
					resolvedFrom = normalized;
					break;
				}
			}
		}
	}

	// Step 4: If not found, try accent-insensitive lemmatization (e.g., "estan" → lemma for "están" → "estar")
	if (!wordEntry) {
		const lemmas = lemmatizeNormalized(normalized, langHint || "es");
		if (lemmas.length > 0) {
			for (const lemma of lemmas) {
				wordEntry = lookupWord(lemma.lemma, (lemma.lang || langHint) as "es" | "en");
				if (wordEntry) {
					resolvedFrom = normalized;
					break;
				}
			}
		}
	}

	if (!wordEntry) return null;

	// Step 5: Fetch related data
	const definitions = getDefinitions(wordEntry.id);
	const sentences = getSentences(wordEntry.id, maxSentences);

	return {
		word: wordEntry,
		definitions,
		sentences,
		resolvedFrom,
	};
}

/**
 * Search for words by prefix (for autocomplete / typeahead)
 * Uses accent-insensitive matching so "arb" finds "árbol", etc.
 */
export function searchDictionary(prefix: string, lang?: "es" | "en", limit = 20) {
	if (!isDatabaseReady()) return [];

	const normalized = prefix.toLowerCase().trim();

	// First try exact prefix match (faster, uses indexes)
	const exactResults = searchWords(normalized, lang, limit);
	if (exactResults.length > 0) {
		// If we got results with exact match, return them
		// But also check if accent-insensitive search finds additional words
		if (exactResults.length >= limit) return exactResults;

		// Supplement with accent-insensitive results
		const accentResults = searchWordsNormalized(normalized, lang, limit - exactResults.length);
		const seen = new Set(exactResults.map(w => `${w.word}|${w.lang}`));
		const additional = accentResults.filter(w => !seen.has(`${w.word}|${w.lang}`));
		return [...exactResults, ...additional].slice(0, limit);
	}

	// No exact results — try accent-insensitive prefix match
	return searchWordsNormalized(normalized, lang, limit);
}