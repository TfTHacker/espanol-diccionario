// src/dictionary/lookup.ts — Dictionary search & data access (EN↔ES bidirectional)
// High-level lookup API that combines lemmatization, definition search, etc.

import { lookupWord, searchWords, getDefinitions, getSentences, lemmatize, isDatabaseReady } from "./db";
import type { DictionaryResult, LookupOptions } from "./data";

/**
 * Full dictionary lookup: resolves the word (including lemmatization),
 * then fetches definitions and sentences.
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

	// Step 2: If not found, try lemmatization (e.g., "hablamos" -> "hablar")
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

	if (!wordEntry) return null;

	// Step 3: Fetch related data
	const definitions = getDefinitions(wordEntry.id);
	const sentences = getSentences(wordEntry.id, maxSentences);

	return {
		word: wordEntry as any,
		definitions: definitions as any,
		sentences: sentences as any,
		resolvedFrom,
	};
}

/**
 * Search for words by prefix (for autocomplete / typeahead)
 */
export function searchDictionary(prefix: string, lang?: "es" | "en", limit = 20) {
	if (!isDatabaseReady()) return [];
	return searchWords(prefix, lang, limit);
}