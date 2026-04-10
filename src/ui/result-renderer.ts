// src/ui/result-renderer.ts — Rendering dictionary results to HTML

import type { DictionaryResult } from "../dictionary/data";
import type { PluginSettings } from "../settings";

/**
 * Render a full dictionary result into HTML
 */
export function renderResult(result: DictionaryResult, settings: PluginSettings): string {
	const { word, definitions, sentences, audioRefs, resolvedFrom } = result;

	const parts: string[] = [];

	// Resolved from indicator
	if (resolvedFrom) {
		parts.push(`<div class="ed-resolved-from">${escapeHtml(resolvedFrom)} → ${escapeHtml(word.word)}</div>`);
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
	if (word.lang === "es" && (audioRefs.length > 0 || settings.audioSource === "wikimedia-first")) {
		parts.push(renderAudioButton(word.word, audioRefs));
	}

	// Definitions
	if (definitions.length > 0) {
		parts.push(renderDefinitions(definitions));
	}

	// Example sentences
	if (sentences.length > 0) {
		parts.push(renderSentences(sentences));
	}

	return `<div class="ed-result">${parts.join("")}</div>`;
}

/**
 * Render audio play button
 */
function renderAudioButton(word: string, audioRefs: any[]): string {
	const audioId = `ed-audio-${Date.now()}`;
	return `<div class="ed-audio">
		<button class="ed-audio-btn" data-word="${escapeHtml(word)}" data-action="play-audio" title="Play pronunciation">
			🔊 Listen
		</button>
		<audio id="${audioId}" preload="none"></audio>
	</div>`;
}

/**
 * Render definitions list
 */
function renderDefinitions(definitions: any[]): string {
	const items = definitions.map((def, i) => {
		const num = def.sense_num || (i + 1);
		let html = `<span class="ed-def-num">${num}.</span> <span class="ed-def-text">${escapeHtml(def.definition)}</span>`;
		if (def.tags) {
			try {
				const tags = JSON.parse(def.tags);
				if (Array.isArray(tags) && tags.length > 0) {
					html += ` <span class="ed-def-tags">${tags.map((t: string) => escapeHtml(t)).join(", ")}</span>`;
				}
			} catch {
				// tags is not valid JSON, just display as-is
				html += ` <span class="ed-def-tags">${escapeHtml(def.tags)}</span>`;
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
 * Render example sentences
 */
function renderSentences(sentences: any[]): string {
	const items = sentences.map((s) => {
		let html = "";
		if (s.sentence_es) {
			html += `<div class="ed-sentence-es">${escapeHtml(s.sentence_es)}</div>`;
		}
		if (s.sentence_en) {
			html += `<div class="ed-sentence-en">${escapeHtml(s.sentence_en)}</div>`;
		}
		return `<li class="ed-sentence-item">${html}</li>`;
	}).join("");

	return `<div class="ed-sentences">
		<div class="ed-section-title">Example Sentences</div>
		<ul class="ed-sentence-list">${items}</ul>
	</div>`;
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