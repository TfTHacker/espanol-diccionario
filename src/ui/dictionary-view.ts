// src/ui/dictionary-view.ts — Main dictionary tab/view

import { ItemView, WorkspaceLeaf, Notice, Platform, MarkdownRenderer } from "obsidian";
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

	// Navigation history
	private navHistory: string[] = [];
	private navIndex = -1;
	private navButtons!: { back: HTMLButtonElement; forward: HTMLButtonElement };
	private recentsBtn!: HTMLButtonElement;
	private recentsDropdown!: HTMLElement;

	// Chat state
	private chatMessages: ChatMessage[] = [];
	private chatInput!: HTMLInputElement;
	private chatContainer!: HTMLElement;
	private chatModelLabel!: HTMLElement;
	private chatHistoryIndex = -1; // -1 means not navigating history
	private chatRecentsDropdown!: HTMLElement;
	private chatInputBeforeHistory = ""; // stores current input when navigating history
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

		// Search bar with navigation buttons
		const searchDiv = container.createDiv({ cls: "ed-search-container" });

		// Back/Forward navigation buttons
		const navDiv = searchDiv.createDiv({ cls: "ed-nav-buttons" });
		this.navButtons = {
			back: navDiv.createEl("button", {
				cls: "ed-nav-btn ed-nav-back",
				attr: { type: "button", title: "Back (Alt+←)" },
			}),
			forward: navDiv.createEl("button", {
				cls: "ed-nav-btn ed-nav-forward",
				attr: { type: "button", title: "Forward (Alt+→)" },
			}),
		};
		this.navButtons.back.setText("←");
		this.navButtons.forward.setText("→");
		this.navButtons.back.disabled = true;
		this.navButtons.forward.disabled = true;
		this.navButtons.back.addEventListener("click", () => this.navigateBack());
		this.navButtons.forward.addEventListener("click", () => this.navigateForward());

		// Recent words dropdown button
		this.recentsBtn = navDiv.createEl("button", {
			cls: "ed-nav-btn ed-nav-recents-btn",
			attr: { type: "button", title: "Recent words" },
		});
		this.recentsBtn.setText("🕐");
		this.recentsBtn.disabled = true;
		this.recentsBtn.addEventListener("click", () => this.toggleRecents());

		// Recents dropdown
		this.recentsDropdown = searchDiv.createDiv({ cls: "ed-recents ed-hidden" });

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
			this.hideRecents();
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

		// Model label + clear button toolbar
		const chatToolbar = this.chatContainer.createDiv({ cls: "ed-chat-toolbar" });
		this.chatModelLabel = chatToolbar.createDiv({ cls: "ed-chat-model-label" });
		const clearBtn = chatToolbar.createEl("button", {
			cls: "ed-chat-clear-btn",
			attr: { type: "button", title: "Clear chat" },
		});
		clearBtn.setText("\u{1F5D1} Clear");
		clearBtn.addEventListener("click", () => this.clearChat());

		const chatMessages = this.chatContainer.createDiv({ cls: "ed-chat-messages", attr: { id: "ed-chat-messages" } });

		const chatForm = this.chatContainer.createEl("form", { cls: "ed-chat-form" });
		this.chatInput = chatForm.createEl("input", {
			type: "text",
			cls: "ed-chat-input",
			attr: {
				placeholder: "Ask a question about this word or Spanish grammar...",
			},
		});

		// Arrow key navigation for prompt history
		this.chatInput.addEventListener("keydown", (evt) => {
			if (evt.key === "ArrowUp" || evt.key === "ArrowDown") {
				evt.preventDefault();
				this.navigateChatHistory(evt.key === "ArrowUp" ? -1 : 1);
			}
		});

		const chatActions = chatForm.createDiv({ cls: "ed-chat-actions" });
		const chatRecentsBtn = chatActions.createEl("button", {
			cls: "ed-chat-recents-btn",
			attr: { type: "button", title: "Prompt history" },
		});
		chatRecentsBtn.setText("\u{1F552}");
		chatRecentsBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.toggleChatRecents();
		});
		const chatSendBtn = chatActions.createEl("button", {
			cls: "ed-chat-send-btn",
			attr: { type: "submit" },
		});
		chatSendBtn.setText("Send");

		// Chat prompt history dropdown
		this.chatRecentsDropdown = this.chatContainer.createDiv({ cls: "ed-chat-recents-dropdown ed-hidden" });

		chatForm.addEventListener("submit", (evt) => {
			evt.preventDefault();
			this.sendChat();
		});

		// Delegated click handler for audio buttons, clickable words, and recents
		container.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement;
			// Close recents if clicking outside the dropdown
			if (!target.closest(".ed-recents") && !target.closest(".ed-nav-recents-btn")) {
				this.hideRecents();
			}
			if (!target.closest(".ed-chat-recents-dropdown") && !target.closest(".ed-chat-recents-btn")) {
				this.chatRecentsDropdown?.classList.add("ed-hidden");
			}
			if (target.closest("[data-action='play-audio']")) {
				this.handlePlayAudio(target.closest("[data-action='play-audio']") as HTMLElement);
			} else if (target.closest(".ed-clickable-word")) {
				this.handleWordClick(target.closest(".ed-clickable-word") as HTMLElement);
			} else if (target.closest(".ed-ext-link")) {
				this.handleExtLink(target.closest(".ed-ext-link") as HTMLElement);
			}
		});

		// Focus search input
		this.searchInput.focus();

		// Restore navigation history from persisted storage
		this.loadHistory();

		// Update model label
		this.updateChatModelLabel();

		// Global keyboard shortcut for back/forward navigation
		this.containerEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.altKey && evt.key === "ArrowLeft") {
				evt.preventDefault();
				this.navigateBack();
			} else if (evt.altKey && evt.key === "ArrowRight") {
				evt.preventDefault();
				this.navigateForward();
			}
		});
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

		this.doLookup(word, true);
	}

	/**
	 * Core lookup logic. pushHistory=true when user initiates search (not from navigation)
	 */
	private doLookup(word: string, pushHistory: boolean) {
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

				if (pushHistory) {
					this.pushNavHistory(word);
				}

				// Auto-play audio for Spanish words
				if (result.word.lang === "es" && this.plugin.settings.autoPlayAudio) {
					this.handlePlayAudio(resultArea.querySelector("[data-action='play-audio']") as HTMLElement);
				}
			} else {
				this.currentResult = null;
				this.currentWord = word;
				resultArea.innerHTML = renderNotFound(word);
				if (pushHistory) {
					this.pushNavHistory(word);
				}
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

	private handleWordClick(el: HTMLElement | null) {
		if (!el) return;
		const word = el.dataset.lookup;
		if (!word) return;

		// Update the search input and trigger lookup
		this.searchInput.value = word;
		this.hideTypeahead();
		this.doLookup(word, true);
	}

	private handleExtLink(el: HTMLElement | null) {
		if (!el) return;
		const url = el.dataset.url;
		const title = el.dataset.title;
		if (!url) return;

		// On mobile, open in OS browser (webview not supported)
		if (Platform.isMobile) {
			window.open(url, "_blank");
			return;
		}

		this.plugin.openWebView(url, title);
	}

	private toggleChat() {
		this.chatContainer.classList.toggle("ed-hidden");
		const toggle = this.containerEl.querySelector(".ed-chat-toggle");
		if (toggle) {
			const isHidden = this.chatContainer.classList.contains("ed-hidden");
			toggle.textContent = isHidden ? "💬 Chat about this word" : "💬 Hide chat";
		}
		if (!this.chatContainer.classList.contains("ed-hidden")) {
			this.updateChatModelLabel();
			this.chatInput.focus();
		}
	}

	private updateChatModelLabel() {
		if (!this.chatModelLabel) return;
		const model = this.plugin.settings.llmModel || "(no model)";
		const server = this.plugin.settings.llmServerUrl.replace(/\/\/+$/, "").replace(/^https?:\/\//, "").split("/")[0];
		this.chatModelLabel.textContent = `Model: ${model} · ${server}`;
	}

	private clearChat() {
		this.chatMessages = [];
		const messagesContainer = this.containerEl.querySelector("#ed-chat-messages");
		if (messagesContainer) {
			messagesContainer.empty();
		}
	}

	private navigateChatHistory(direction: -1 | 1) {
		const history = this.plugin.settings.chatPromptHistory;
		if (history.length === 0) return;

		if (this.chatHistoryIndex === -1) {
			// Save current input before navigating
			this.chatInputBeforeHistory = this.chatInput.value;
		}

		const newIndex = this.chatHistoryIndex === -1
			? (direction === -1 ? history.length - 1 : -1)
			: this.chatHistoryIndex + direction;

		if (newIndex < 0 || newIndex >= history.length) {
			// Went past bounds — restore original input
			this.chatHistoryIndex = -1;
			this.chatInput.value = this.chatInputBeforeHistory;
		} else {
			this.chatHistoryIndex = newIndex;
			this.chatInput.value = history[newIndex];
		}

		// Move cursor to end
		this.chatInput.focus();
		this.chatInput.setSelectionRange(this.chatInput.value.length, this.chatInput.value.length);
	}

	private toggleChatRecents() {
		const dropdown = this.chatRecentsDropdown;
		if (!dropdown.classList.contains("ed-hidden")) {
			dropdown.classList.add("ed-hidden");
			return;
		}

		// Render the prompt history list
		dropdown.empty();
		const history = this.plugin.settings.chatPromptHistory;

		if (history.length === 0) {
			dropdown.createDiv({ cls: "ed-chat-recents-empty", text: "No prompts yet" });
		} else {
			// Show most recent first
			for (let i = history.length - 1; i >= 0; i--) {
				const item = dropdown.createDiv({ cls: "ed-chat-recents-item" });
				item.textContent = history[i];
				item.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.chatInput.value = history[i];
					this.chatInput.focus();
					dropdown.classList.add("ed-hidden");
				});
			}

			// Clear all button
			const clearHistory = dropdown.createDiv({ cls: "ed-chat-recents-clear" });
			clearHistory.textContent = "Clear all prompts";
			clearHistory.addEventListener("click", async (evt) => {
				evt.stopPropagation();
				this.plugin.settings.chatPromptHistory = [];
				await this.plugin.saveSettings();
				dropdown.classList.add("ed-hidden");
			});
		}

		dropdown.classList.remove("ed-hidden");
	}

	private async sendChat() {
		const userText = this.chatInput.value.trim();
		if (!userText || this.isStreaming) return;

		this.chatInput.value = "";
		this.isStreaming = true;

		// Save to prompt history (avoid duplicates at top)
		const hist = this.plugin.settings.chatPromptHistory;
		if (hist[hist.length - 1] !== userText) {
			hist.push(userText);
			if (hist.length > 100) hist.shift(); // cap at 100
			await this.plugin.saveSettings();
		}
		this.chatHistoryIndex = -1; // reset navigation

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
		let accumulated = "";
		const wordContext = this.currentResult?.word?.word;
		let renderTimeout: ReturnType<typeof setTimeout> | null = null;

		const renderMarkdown = () => {
			const md = accumulated;
			const container = assistantDiv;
			container.empty();
			MarkdownRenderer.render(this.app, md, container, "", this);
		};

		const debouncedRender = () => {
			if (renderTimeout) clearTimeout(renderTimeout);
			renderTimeout = setTimeout(renderMarkdown, 80);
			};

		const response = await streamChatMessage(
			this.chatMessages,
			this.plugin.settings,
			(text) => {
				accumulated += text;
				assistantDiv.textContent = accumulated;
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
				debouncedRender();
			},
			wordContext
		);

		// Clear any pending render
		if (renderTimeout) clearTimeout(renderTimeout);

		if (response.error) {
			assistantDiv.textContent = `Error: ${response.error}`;
			assistantDiv.classList.add("ed-chat-error");
		} else {
			this.chatMessages.push({ role: "assistant", content: response.message });
			// Final markdown render
			renderMarkdown();
		}

		this.isStreaming = false;
	}

	// ============================================================
	// Navigation history
	// ============================================================

	private pushNavHistory(word: string) {
		// Truncate any forward history
		if (this.navIndex < this.navHistory.length - 1) {
			this.navHistory = this.navHistory.slice(0, this.navIndex + 1);
		}

		// Don't push duplicate of current entry
		if (this.navHistory.length > 0 && this.navHistory[this.navHistory.length - 1] === word) {
			return;
		}

		this.navHistory.push(word);
		this.navIndex = this.navHistory.length - 1;
		this.updateNavButtons();
		this.saveHistory();
	}

	private navigateBack() {
		if (this.navIndex <= 0) return;
		this.navIndex--;
		const word = this.navHistory[this.navIndex];
		this.searchInput.value = word;
		this.hideTypeahead();
		this.doLookup(word, false);
		this.updateNavButtons();
	}

	private navigateForward() {
		if (this.navIndex >= this.navHistory.length - 1) return;
		this.navIndex++;
		const word = this.navHistory[this.navIndex];
		this.searchInput.value = word;
		this.hideTypeahead();
		this.doLookup(word, false);
		this.updateNavButtons();
	}

	private updateNavButtons() {
		if (!this.navButtons) return;
		this.navButtons.back.disabled = this.navIndex <= 0;
		this.navButtons.forward.disabled = this.navIndex >= this.navHistory.length - 1;
		this.recentsBtn.disabled = this.navHistory.length === 0;
	}

	// ============================================================
	// History persistence
	// ============================================================

	private async loadHistory() {
		const history = this.plugin.settings.navHistory;
		if (Array.isArray(history) && history.length > 0) {
			this.navHistory = history;
			this.navIndex = history.length - 1;
			this.updateNavButtons();
		}
	}

	private async saveHistory() {
		this.plugin.settings.navHistory = this.navHistory;
		await this.plugin.saveSettings();
	}

	/**
	 * Toggle the recents dropdown.
	 */
	private toggleRecents() {
		if (this.recentsDropdown.classList.contains("ed-hidden")) {
			this.showRecents();
		} else {
			this.hideRecents();
		}
	}

	private showRecents() {
		this.recentsDropdown.empty();
		// Show last 20 words, most recent first
		const recent = this.navHistory.slice(-20).reverse();
		if (recent.length === 0) {
			this.recentsDropdown.createDiv({ cls: "ed-recents-empty", text: "No recent words" });
		} else {
			for (const word of recent) {
				const item = this.recentsDropdown.createDiv({ cls: "ed-recents-item" });
				item.createSpan({ cls: "ed-recents-word", text: word });
				// Highlight current word
				if (word === this.currentWord) {
					item.classList.add("ed-recents-current");
				}
				item.addEventListener("click", () => {
					this.searchInput.value = word;
					this.hideRecents();
					this.hideTypeahead();
					this.doLookup(word, true);
				});
			}
		}
		this.recentsDropdown.classList.remove("ed-hidden");
	}

	private hideRecents() {
		this.recentsDropdown.classList.add("ed-hidden");
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