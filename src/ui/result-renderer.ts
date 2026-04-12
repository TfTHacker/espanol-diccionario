// src/ui/result-renderer.ts — Rendering dictionary results to HTML
// Words in definitions and sentences are clickable for drill-down lookup

import type { DictionaryResult, Definition, Sentence } from "../dictionary/data";

/** Shared empty state HTML — used by dictionary-view in multiple places */
export const EMPTY_STATE_HTML = `<div class="ed-empty-state">
	<div class="ed-empty-icon">📖</div>
	<div class="ed-empty-text">Type a word above to look it up</div>
	<div class="ed-empty-hint">Supports Spanish ↔ English, including conjugated forms</div>
</div>`;

/**
 * Render a full dictionary result into HTML
 */
export function renderResult(result: DictionaryResult, maxSentences: number = 5): string {
	const { word, definitions, sentences, resolvedFrom } = result;

	const parts: string[] = [];

	// Resolved from indicator
	if (resolvedFrom) {
		parts.push(`<div class="ed-resolved-from">${escapeHtml(resolvedFrom)} → ${makeClickable(word.word, word.lang)}</div>`);
	}

	// Word header
	const headerParts: string[] = [];
	headerParts.push(`<span class="ed-word">${escapeHtml(word.word)}</span>`);
	if (word.pos) {
		headerParts.push(`<span class="ed-pos">${escapeHtml(word.pos)}</span>`);
	}
	if (word.ipa) {
		headerParts.push(`<span class="ed-ipa">${escapeHtml(word.ipa)}</span>`);
	}
	parts.push(`<div class="ed-header">${headerParts.join(" ")}</div>`);

	// External reference links
	parts.push(renderExternalLinks(word.word, word.lang));

	// Audio button (only for Spanish words)
	if (word.lang === "es") {
		parts.push(renderAudioButton(word.word));
	}

	// Definitions — make definition text clickable based on language
	if (definitions.length > 0) {
		parts.push(renderDefinitions(definitions, word.lang));
	}

	// Example sentences — make words clickable
	if (sentences.length > 0) {
		parts.push(renderSentences(sentences.slice(0, maxSentences)));
	}

	return `<div class="ed-result">${parts.join("")}</div>`;
}

/**
 * Render audio play button
 */
function renderAudioButton(word: string): string {
	return `<div class="ed-audio">
		<button class="ed-audio-btn" data-word="${escapeHtml(word)}" data-action="play-audio" title="Play pronunciation">
			🔊 Listen
		</button>
	</div>`;
}

/**
 * External reference link sites
 */
const EXTERNAL_SITES: { key: string; label: string; icon: string; url: (word: string, lang: string) => string }[] = [
	{
		key: "wr",
		label: "WordReference",
		icon: "WR",
		url: (w, lang) => lang === "es"
			? `https://www.wordreference.com/es/en/translation.asp?spen=${encodeURIComponent(w)}`
			: `https://www.wordreference.com/es/translation.asp?en=${encodeURIComponent(w)}`,
	},
	{
		key: "rae",
		label: "RAE (Real Academia Española)",
		icon: "RAE",
		url: (w) => `https://dle.rae.es/${encodeURIComponent(w)}`,
	},
	{
		key: "sd",
		label: "SpanishDict",
		icon: "SD",
		url: (w) => `https://www.spanishdict.com/translate/${encodeURIComponent(w)}`,
	},
	{
		key: "linguee",
		label: "Linguee",
		icon: "Li",
		url: (w, lang) => lang === "es"
			? `https://www.linguee.com/english-spanish/search?source=auto&query=${encodeURIComponent(w)}`
			: `https://www.linguee.com/spanish-english/search?source=auto&query=${encodeURIComponent(w)}`,
	},
	{
		key: "reverso",
		label: "Reverso Context",
		icon: "RC",
		url: (w, lang) => `https://context.reverso.net/translation/${lang === "es" ? "spanish-english" : "english-spanish"}/${encodeURIComponent(w)}`,
	},
];

function renderExternalLinks(word: string, lang: string): string {
	const links = EXTERNAL_SITES.map(site => {
		// RAE only makes sense for Spanish words
		if (site.key === "rae" && lang !== "es") return "";
		const href = site.url(word, lang);
		return `<a class="ed-ext-link ed-ext-${site.key}" data-url="${escapeHtml(href)}" data-title="${escapeHtml(site.label)}" title="${site.label}" role="button" tabindex="0">${site.icon}</a>`;
	}).filter(Boolean).join("");

	return `<div class="ed-ext-links">${links}</div>`;
}

/**
 * Render definitions list
 * For Spanish entries: definitions are in English → English words clickable (reverse lookup)
 * For English entries: definitions are Spanish words → Spanish words clickable (drill down)
 */
function renderDefinitions(definitions: Definition[], lang: string): string {
	const items = definitions.map((def, i) => {
		const num = def.senseNum || (i + 1);
		const defHtml = lang === "en"
			? makeReverseDefClickable(def.definition)
			: makeEnglishDefClickable(def.definition);
		let html = `<span class="ed-def-num">${num}.</span> <span class="ed-def-text">${defHtml}</span>`;
		if (def.tags) {
			try {
				const tags = JSON.parse(def.tags);
				if (Array.isArray(tags) && tags.length > 0) {
					// For English entries, tags contain "es" — skip that
					const displayTags = tags.filter((t: string) => t !== "es" && t.length > 1);
					if (displayTags.length > 0) {
						html += ` <span class="ed-def-tags">${displayTags.map((t: string) => escapeHtml(t)).join(", ")}</span>`;
					}
				}
			} catch {
				if (def.tags !== '["es"]') {
					html += ` <span class="ed-def-tags">${escapeHtml(def.tags)}</span>`;
				}
			}
		}
		if (def.context) {
			html += ` <span class="ed-def-context">(${escapeHtml(def.context)})</span>`;
		}
		return `<li class="ed-def-item">${html}</li>`;
	}).join("");

	return `<div class="ed-definitions">
		<div class="ed-section-title">Definitions</div>
		<ol class="ed-def-list">${items}</ol>
	</div>`;
}

/**
 * Make a reverse-definition clickable.
 * English entries show Spanish translations like "sueño (noun)" or "hablar (verb)"
 * We want the Spanish word to be clickable.
 */
function makeReverseDefClickable(text: string): string {
	// Match pattern: "word" or "word (pos)" — the word part is clickable
	const result = text.replace(/\b([a-záéíóúñüÁÉÍÓÚÑÜ]+(?:[a-záéíóúñüÁÉÍÓÚÑÜ]*))\s*(?:\(([^)]*)\))?/gi,
		(_fullMatch, word, pos) => {
			return makeClickable(word, "es") + (pos ? ` <span class="ed-def-tags">${escapeHtml(pos)}</span>` : "");
		}
	);
	return result;
}

/**
 * Make an English definition text clickable.
 * Spanish entries have English definitions like "house, dwelling" or "to speak, to talk".
 * Each English word is clickable (looks up English→Spanish reverse entry).
 */
function makeEnglishDefClickable(text: string): string {
	// Strip leading "to " for verb forms — we want "to" as plain text, "speak" clickable
	// Split on commas, semicolons, and parenthetical tags to identify individual words
	// General approach: make each alphabetic word (3+ chars) clickable as English
	return text.replace(/\b([a-zA-Z]{3,})\b/g, (match, word) => {
		// Don't link common English function words
		const skip = new Set(["the","and","that","this","with","from","for","not","but","who","whom","whose","which","what","where","when","how","than","then","also","very","much","more","most","some","such","only","own","same","will","shall","may","might","can","could","would","should","has","have","had","been","being","does","did","done","made","make","like","just","over","into","also","back","because","through","between","before","after","while","during","without","within","about","above","below","under","these","those","other","another","each","every","both","few","many","several","there","here","where","when","why","still","even","too","yet","nor","either","neither","though","although","except","since","until","upon"]);
		if (skip.has(word.toLowerCase())) return escapeHtml(match);
		return makeClickable(word, "en");
	});
}

/**
 * Render example sentences
 * Spanish words in sentences are clickable
 */
function renderSentences(sentences: Sentence[]): string {
	const items = sentences.map((s) => {
		let html = "";
		if (s.sentenceEs) {
			html += `<div class="ed-sentence-es">${makeSentenceClickable(s.sentenceEs, "es")}</div>`;
		}
		if (s.sentenceEn) {
			html += `<div class="ed-sentence-en">${makeSentenceClickable(s.sentenceEn, "en")}</div>`;
		}
		return `<li class="ed-sentence-item">${html}</li>`;
	}).join("");

	return `<div class="ed-sentences">
		<div class="ed-section-title">Example Sentences</div>
		<ul class="ed-sentence-list">${items}</ul>
	</div>`;
}

/**
 * Make a single word clickable — wraps in a span with data attributes
 */
function makeClickable(word: string, lang: string): string {
	return `<span class="ed-clickable-word" data-lookup="${escapeHtml(word)}" data-lang="${escapeHtml(lang)}" title="Look up: ${escapeHtml(word)}">${escapeHtml(word)}</span>`;
}

/**
 * Make words in a sentence clickable.
 * Only words 3+ characters are made clickable to avoid linking particles.
 */
function makeSentenceClickable(sentence: string, lang: string): string {
	// Split the sentence into tokens (words and punctuation/whitespace)
	return sentence.replace(/[a-záéíóúñüÁÉÍÓÚÑÜ]+[a-záéíóúñüÁÉÍÓÚÑÜ']*/gi, (match) => {
		if (match.length >= 3) {
			return makeClickable(match, lang);
		}
		return escapeHtml(match);
	});
}

/**
 * Render "not found" message with an "Ask AI about this word" link.
 * The link has data attributes with the word and language for click handling.
 */
export function renderNotFound(word: string, lang?: string): string {
	const langLabel = lang === "es" ? "Spanish" : lang === "en" ? "English" : "";
	return `<div class="ed-not-found">
		<div class="ed-not-found-word">${escapeHtml(word)}</div>
		<div class="ed-not-found-msg">${langLabel ? `${langLabel} word` : "Word"} not found in the dictionary.</div>
		<div class="ed-not-found-hint">Try a different spelling or the dictionary form (infinitive for verbs, singular for nouns).</div>
		<div class="ed-not-found-ask-ai"><a class="ed-ask-ai-link" data-action="ask-ai" data-word="${escapeHtml(word)}" data-lang="${escapeHtml(lang || "")}" role="button" tabindex="0">💬 Ask AI about this word</a></div>
	</div>`;
}

/**
 * Render loading state
 */
export function renderLoading(word: string): string {
	return `<div class="ed-loading">
		<div class="ed-spinner"></div>
		<div>Looking up <strong>${escapeHtml(word)}</strong>...</div>
	</div>`;
}

/**
 * Render database loading state
 */
export function renderDbLoading(): string {
	return `<div class="ed-loading">
		<div class="ed-spinner"></div>
		<div>Loading dictionary database...</div>
	</div>`;
}

/**
 * Render database error
 */
export function renderDbError(error: string): string {
	return `<div class="ed-error">
		<div class="ed-error-title">Dictionary Error</div>
		<div class="ed-error-msg">${escapeHtml(error)}</div>
	</div>`;
}

/**
 * HTML escape helper
 */
function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}