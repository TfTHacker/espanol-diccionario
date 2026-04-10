// src/ui/result-renderer.ts — Rendering dictionary results to HTML
// Words in definitions and sentences are clickable for drill-down lookup

import type { DictionaryResult } from "../dictionary/data";

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
 * Render definitions list
 * For Spanish entries: definitions are in English (not clickable)
 * For English entries: definitions are Spanish words (clickable)
 */
function renderDefinitions(definitions: any[], lang: string): string {
	const items = definitions.map((def, i) => {
		const num = def.sense_num || (i + 1);
		const defHtml = lang === "en"
			? makeReverseDefClickable(def.definition)
			: escapeHtml(def.definition);
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
		(fullMatch, word, pos) => {
			return makeClickable(word, "es") + (pos ? ` <span class="ed-def-tags">${escapeHtml(pos)}</span>` : "");
		}
	);
	return result;
}

/**
 * Render example sentences
 * Spanish words in sentences are clickable
 */
function renderSentences(sentences: any[]): string {
	const items = sentences.map((s) => {
		let html = "";
		if (s.sentence_es) {
			html += `<div class="ed-sentence-es">${makeSentenceClickable(s.sentence_es, "es")}</div>`;
		}
		if (s.sentence_en) {
			html += `<div class="ed-sentence-en">${makeSentenceClickable(s.sentence_en, "en")}</div>`;
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
 * Render "not found" message
 */
export function renderNotFound(word: string, lang?: string): string {
	const langLabel = lang === "es" ? "Spanish" : lang === "en" ? "English" : "";
	return `<div class="ed-not-found">
		<div class="ed-not-found-word">${escapeHtml(word)}</div>
		<div class="ed-not-found-msg">${langLabel ? `${langLabel} word` : "Word"} not found in the dictionary.</div>
		<div class="ed-not-found-hint">Try a different spelling or the dictionary form (infinitive for verbs, singular for nouns).</div>
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