// src/ui/dictionary-view.ts — Main dictionary tab/view

import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type EspañolDiccionarioPlugin from "../main";
import { fullLookup, searchDictionary } from "../dictionary/lookup";
import { isDatabaseReady } from "../dictionary/db";
import { playAudio } from "../audio/provider";
import { streamChatMessage } from "../chat/provider";
import type { ChatMessage } from "../chat/provider";
import type { DictionaryResult } from "../dictionary/data";
import { renderResult, renderNotFound, renderLoading, renderDbLoading, renderDbError } from "./result-renderer";

export const VIEW_TYPE_ESPANOL_DICCIONARIO = "espanol-diccionario-view";

export class DictionaryView extends ItemView {
	plugin: EspañolDiccionarioPlugin;

	// Search state
	private searchInput!: HTMLInputElement;
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private typeaheadList!: HTMLElement;
	private typeaheadTimeout: ReturnType<typeof setTimeout> | null = null;
	private typeaheadIndex = -1;
	private typeaheadItems: { word: string; pos: string; lang: string }[] = [];

	// Result state
	private currentResult: DictionaryResult | null = null;
	private currentWord: string = "";

	// Chat state
	private chatMessages: ChatMessage[] = [];
	private chatInput!: HTMLInputElement;
	private chatContainer!: HTMLElement;
	private isStreaming = false;

	constructor(leaf: WorkspaceLeaf, plugin: EspañolDiccionarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_ESPANOL_DICCIONARIO;
	}

	getDisplayText(): string {
		return "Español Diccionario";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("espanol-diccionario");

		// Search bar
		const searchDiv = container.createDiv({ cls: "ed-search-container" });
		const searchForm = searchDiv.createEl("form", { cls: "ed-search-form" });

		this.searchInput = searchForm.createEl("input", {
			type: "text",
			cls: "ed-search-input",
			attr: {
				placeholder: "Search a word (Spanish or English)...",
				autocomplete: "off",
				spellcheck: "false",
			},
		});

		const searchBtn = searchForm.createEl("button", {
			cls: "ed-search-btn",
			attr: { type: "submit" },
		});
		searchBtn.setText("🔍");

		searchForm.addEventListener("submit", (evt) => {
			evt.preventDefault();
			this.doSearch();
		});

		// Typeahead dropdown
		this.typeaheadList = searchDiv.createDiv({ cls: "ed-typeahead ed-hidden" });

		// Keyboard navigation for typeahead
		this.searchInput.addEventListener("keydown", (evt) => {
			if (!this.typeaheadList.classList.contains("ed-hidden")) {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					this.navigateTypeahead(1);
					return;
				}
				if (evt.key === "ArrowUp") {
					evt.preventDefault();
					this.navigateTypeahead(-1);
					return;
				}
				if (evt.key === "Enter" && this.typeaheadIndex >= 0) {
					evt.preventDefault();
					this.selectTypeaheadItem(this.typeaheadIndex);
					return;
				}
				if (evt.key === "Escape") {
					this.hideTypeahead();
					return;
				}
			}
		});

		// Hide typeahead when clicking outside
		this.searchInput.addEventListener("blur", () => {
			setTimeout(() => this.hideTypeahead(), 200);
		});

		// Typeahead / autocomplete on input
		this.searchInput.addEventListener("input", () => {
			if (this.searchTimeout) clearTimeout(this.searchTimeout);
			this.searchTimeout = setTimeout(() => this.doSearch(), 300);
			this.updateTypeahead();
		});

		// Result area
		const resultArea = container.createDiv({ cls: "ed-result-area", attr: { id: "ed-result-area" } });

		// Show loading or initial state
		if (!isDatabaseReady()) {
			resultArea.innerHTML = renderDbLoading();
		} else {
			resultArea.innerHTML = `<div class="ed-empty-state">
				<div class="ed-empty-icon">📖</div>
				<div class="ed-empty-text">Type a word above to look it up</div>
				<div class="ed-empty-hint">Supports Spanish ↔ English, including conjugated forms</div>
			</div>`;
		}

		// Chat area (collapsible)
		const chatSection = container.createDiv({ cls: "ed-chat-section" });
		const chatToggle = chatSection.createEl("button", {
			cls: "ed-chat-toggle",
			attr: { "data-action": "toggle-chat" },
		});
		chatToggle.setText("💬 Chat about this word");
		chatToggle.addEventListener("click", () => this.toggleChat());

		this.chatContainer = chatSection.createDiv({ cls: "ed-chat-container ed-hidden" });
		const chatMessages = this.chatContainer.createDiv({ cls: "ed-chat-messages", attr: { id: "ed-chat-messages" } });

		const chatForm = this.chatContainer.createEl("form", { cls: "ed-chat-form" });
		this.chatInput = chatForm.createEl("input", {
			type: "text",
			cls: "ed-chat-input",
			attr: {
				placeholder: "Ask a question about this word or Spanish grammar...",
			},
		});
		const chatSendBtn = chatForm.createEl("button", {
			cls: "ed-chat-send-btn",
			attr: { type: "submit" },
		});
		chatSendBtn.setText("Send");

		chatForm.addEventListener("submit", (evt) => {
			evt.preventDefault();
			this.sendChat();
		});

		// Delegated click handler for audio buttons
		container.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement;
			if (target.closest("[data-action='play-audio']")) {
				this.handlePlayAudio(target.closest("[data-action='play-audio']") as HTMLElement);
			}
		});

		// Focus search input
		this.searchInput.focus();
	}

	async onClose() {
		// Clean up
	}

	/**
	 * Focus the search input
	 */
	public focusSearch() {
		if (this.searchInput) {
			this.searchInput.focus();
		}
	}

	/**
	 * Update the view when database becomes ready
	 */
	public notifyDatabaseReady() {
		const resultArea = this.containerEl.querySelector("#ed-result-area");
		if (resultArea) {
			const emptyState = resultArea.querySelector(".ed-loading");
			if (emptyState) {
				resultArea.innerHTML = `<div class="ed-empty-state">
					<div class="ed-empty-icon">📖</div>
					<div class="ed-empty-text">Type a word above to look it up</div>
					<div class="ed-empty-hint">Supports Spanish ↔ English, including conjugated forms</div>
				</div>`;
			}
		}
	}

	/**
	 * Notify the view of a database error
	 */
	public notifyDatabaseError(error: string) {
		const resultArea = this.containerEl.querySelector("#ed-result-area");
		if (resultArea) {
			resultArea.innerHTML = renderDbError(error);
		}
	}

	private doSearch() {
		const word = this.searchInput.value.trim();
		if (!word) {
			const resultArea = this.containerEl.querySelector("#ed-result-area");
			if (resultArea) {
				resultArea.innerHTML = `<div class="ed-empty-state">
					<div class="ed-empty-icon">📖</div>
					<div class="ed-empty-text">Type a word above to look it up</div>
				</div>`;
			}
			return;
		}

		const resultArea = this.containerEl.querySelector("#ed-result-area");
		if (!resultArea) return;

		resultArea.innerHTML = renderLoading(word);

		try {
			const result = fullLookup(word, {
				maxSentences: this.plugin.settings.maxSentences,
			});

			if (result) {
				this.currentResult = result;
				this.currentWord = word;
				resultArea.innerHTML = renderResult(result, this.plugin.settings.maxSentences);

				// Auto-play audio for Spanish words
				if (result.word.lang === "es" && this.plugin.settings.autoPlayAudio) {
					this.handlePlayAudio(resultArea.querySelector("[data-action='play-audio']") as HTMLElement);
				}
			} else {
				this.currentResult = null;
				this.currentWord = word;
				resultArea.innerHTML = renderNotFound(word);
			}
		} catch (err) {
			resultArea.innerHTML = renderDbError(
				err instanceof Error ? err.message : "An error occurred during lookup"
			);
		}
	}

	private async handlePlayAudio(btn: HTMLElement | null) {
		if (!btn || !this.currentResult) return;

		const word = btn.dataset.word;
		if (!word) return;

		btn.textContent = "⏳ Loading...";

		try {
			const audioEl = await playAudio(word);
			if (audioEl) {
				btn.textContent = "🔊 Playing";
				audioEl.addEventListener("ended", () => {
					btn.textContent = "🔊 Listen";
				});
				audioEl.addEventListener("error", () => {
					btn.textContent = "🔊 Listen";
				});
			} else {
				btn.textContent = "🔊 Listen";
				new Notice("Failed to play audio. Check your internet connection.");
			}
		} catch (err) {
			btn.textContent = "🔊 Listen";
			new Notice("Failed to load audio.");
		}
	}

	private toggleChat() {
		this.chatContainer.classList.toggle("ed-hidden");
		const toggle = this.containerEl.querySelector(".ed-chat-toggle");
		if (toggle) {
			const isHidden = this.chatContainer.classList.contains("ed-hidden");
			toggle.textContent = isHidden ? "💬 Chat about this word" : "💬 Hide chat";
		}
		if (!this.chatContainer.classList.contains("ed-hidden")) {
			this.chatInput.focus();
		}
	}

	private async sendChat() {
		const userText = this.chatInput.value.trim();
		if (!userText || this.isStreaming) return;

		this.chatInput.value = "";
		this.isStreaming = true;

		// Add user message
		this.chatMessages.push({ role: "user", content: userText });

		// Render user message
		const messagesContainer = this.containerEl.querySelector("#ed-chat-messages");
		if (messagesContainer) {
			const userDiv = document.createElement("div");
			userDiv.className = "ed-chat-msg ed-chat-user";
			userDiv.textContent = userText;
			messagesContainer.appendChild(userDiv);
		}

		// Create assistant message container
		const assistantDiv = document.createElement("div");
		assistantDiv.className = "ed-chat-msg ed-chat-assistant";
		assistantDiv.textContent = "Thinking...";
		messagesContainer?.appendChild(assistantDiv);

		// Scroll to bottom
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}

		// Stream response
		assistantDiv.textContent = "";
		const wordContext = this.currentResult?.word?.word;

		const response = await streamChatMessage(
			this.chatMessages,
			this.plugin.settings,
			(text) => {
				assistantDiv.textContent += text;
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			},
			wordContext
		);

		if (response.error) {
			assistantDiv.textContent = `Error: ${response.error}`;
			assistantDiv.classList.add("ed-chat-error");
		} else {
			this.chatMessages.push({ role: "assistant", content: response.message });
		}

		this.isStreaming = false;
	}

	// ============================================================
	// Typeahead / autocomplete
	// ============================================================

	private updateTypeahead() {
		if (this.typeaheadTimeout) clearTimeout(this.typeaheadTimeout);

		const text = this.searchInput.value.trim();
		if (text.length < 2) {
			this.hideTypeahead();
			return;
		}

		// Debounce: wait 150ms before querying
		this.typeaheadTimeout = setTimeout(() => {
			if (!isDatabaseReady()) return;

			const results = searchDictionary(text, undefined, 10);
			// Deduplicate by word+pos
			const seen = new Set<string>();
			const unique = results.filter(w => {
				const key = `${w.word}|${w.pos}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
			if (unique.length === 0) {
				this.hideTypeahead();
				return;
			}

			this.typeaheadItems = unique.map(w => ({ word: w.word, pos: w.pos || "", lang: w.lang }));
			this.typeaheadIndex = -1;

			this.typeaheadList.empty();
			for (let i = 0; i < this.typeaheadItems.length; i++) {
				const item = this.typeaheadItems[i];
				const div = this.typeaheadList.createDiv({ cls: "ed-typeahead-item" });
				div.createSpan({ cls: "ed-typeahead-word", text: item.word });

				const meta = div.createSpan({ cls: "ed-typeahead-meta" });
				if (item.pos) meta.createSpan({ cls: "ed-typeahead-pos", text: item.pos });
				meta.createSpan({ cls: `ed-typeahead-flag ed-lang-${item.lang}` });

				div.addEventListener("mousedown", (evt) => {
					evt.preventDefault();
					this.selectTypeaheadItem(i);
				});
			}

			this.typeaheadList.classList.remove("ed-hidden");
		}, 150);
	}

	private navigateTypeahead(direction: number) {
		const items = this.typeaheadList.querySelectorAll(".ed-typeahead-item");
		if (items.length === 0) return;

		// Remove highlight from current
		if (this.typeaheadIndex >= 0 && this.typeaheadIndex < items.length) {
			items[this.typeaheadIndex].classList.remove("ed-typeahead-active");
		}

		// Move index
		this.typeaheadIndex += direction;
		if (this.typeaheadIndex < 0) this.typeaheadIndex = items.length - 1;
		if (this.typeaheadIndex >= items.length) this.typeaheadIndex = 0;

		// Apply highlight
		items[this.typeaheadIndex].classList.add("ed-typeahead-active");

		// Update input value preview
		const item = this.typeaheadItems[this.typeaheadIndex];
		if (item) {
			this.searchInput.value = item.word;
		}
	}

	private selectTypeaheadItem(index: number) {
		const item = this.typeaheadItems[index];
		if (!item) return;

		this.searchInput.value = item.word;
		this.hideTypeahead();
		this.doSearch();
	}

	private hideTypeahead() {
		this.typeaheadList.classList.add("ed-hidden");
		this.typeaheadIndex = -1;
		this.typeaheadItems = [];
	}
}