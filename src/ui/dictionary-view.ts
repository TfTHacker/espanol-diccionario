// src/ui/dictionary-view.ts — Main dictionary tab/view
// Delegates to SearchController, NavHistory, and ChatController

import { ItemView, WorkspaceLeaf, Notice, Platform } from "obsidian";
import type EspañolDiccionarioPlugin from "../main";
import { fullLookup } from "../dictionary/lookup";
import { isDatabaseReady } from "../dictionary/db";
import { playAudio } from "../audio/provider";
import type { DictionaryResult } from "../dictionary/data";
import { renderResult, renderNotFound, renderLoading, renderDbLoading, renderDbError, EMPTY_STATE_HTML } from "./result-renderer";
import { VIEW_TYPE_DICTIONARY } from "../constants";
import { SearchController } from "./search-controller";
import { NavHistory } from "./nav-history";
import { ChatController } from "./chat-controller";

export { VIEW_TYPE_DICTIONARY as VIEW_TYPE_ESPANOL_DICCIONARIO } from "../constants";

export class DictionaryView extends ItemView {
	plugin: EspañolDiccionarioPlugin;

	// Delegated controllers
	private search: SearchController;
	private nav: NavHistory;
	private chat: ChatController;

	// Result state
	private currentResult: DictionaryResult | null = null;
	private currentWord: string = "";

	// UI element references
	private chatSuggestionsContainer!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: EspañolDiccionarioPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Initialize controllers with callbacks
		this.search = new SearchController((word) => this.onSearch(word));
		this.nav = new NavHistory((word) => this.onNavigate(word));
		this.chat = new ChatController(
			this.app,
			this,
			() => this.plugin.settings,
			() => this.plugin.saveSettings(),
			() => this.currentResult,
		);
	}

	getViewType(): string {
		return VIEW_TYPE_DICTIONARY;
	}

	getDisplayText(): string {
		return "Español Diccionario";
	}

	getIcon(): string {
		return "languages";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("espanol-diccionario");

		// === Search bar with navigation ===
		const searchDiv = container.createDiv({ cls: "ed-search-container" });

		const navDiv = searchDiv.createDiv({ cls: "ed-nav-buttons" });
		const navButtons = {
			back: navDiv.createEl("button", { cls: "ed-nav-btn ed-nav-back", attr: { type: "button", title: "Back (Alt+←)" } }),
			forward: navDiv.createEl("button", { cls: "ed-nav-btn ed-nav-forward", attr: { type: "button", title: "Forward (Alt+→)" } }),
		};
		navButtons.back.setText("←");
		navButtons.forward.setText("→");
		navButtons.back.disabled = true;
		navButtons.forward.disabled = true;

		const recentsBtn = navDiv.createEl("button", { cls: "ed-nav-btn ed-nav-recents-btn", attr: { type: "button", title: "Recent words" } });
		recentsBtn.setText("🕐");
		recentsBtn.disabled = true;

		const chatToggleBtn = navDiv.createEl("button", { cls: "ed-nav-btn ed-chat-toggle-btn", attr: { type: "button", title: "Toggle chat" } });
		chatToggleBtn.setText("💬");
		chatToggleBtn.addEventListener("click", () => this.chat.toggleChat());

		const recentsDropdown = searchDiv.createDiv({ cls: "ed-recents ed-hidden" });

		const searchForm = searchDiv.createEl("form", { cls: "ed-search-form" });
		const searchInput = searchForm.createEl("input", {
			type: "text",
			cls: "ed-search-input",
			attr: { placeholder: "Search a word (Spanish or English)...", autocomplete: "off", spellcheck: "false" },
		});
		const searchBtn = searchForm.createEl("button", { cls: "ed-search-btn", attr: { type: "submit" } });
		searchBtn.setText("🔍");

		const typeaheadList = searchDiv.createDiv({ cls: "ed-typeahead ed-hidden" });

		// Initialize SearchController
		this.search.init(searchInput, typeaheadList, searchForm);

		// Initialize NavHistory
		this.nav.init(navButtons, recentsBtn, recentsDropdown);
		this.nav.loadFromSettings(this.plugin.settings.navHistory);

		// === Result area ===
		const resultArea = container.createDiv({ cls: "ed-result-area", attr: { id: "ed-result-area" } });

		// Suggestion links (below definition)
		this.chatSuggestionsContainer = container.createDiv({ cls: "ed-suggestion-links" });

		// Show loading or initial state
		if (!isDatabaseReady()) {
			resultArea.innerHTML = renderDbLoading();
		} else {
			resultArea.innerHTML = EMPTY_STATE_HTML;
		}

		// === Chat area ===
		const chatSection = container.createDiv({ cls: "ed-chat-section" });
		const chatContainer = chatSection.createDiv({ cls: "ed-chat-container ed-hidden" });

		// Model label + clear button toolbar
		const chatToolbar = chatContainer.createDiv({ cls: "ed-chat-toolbar" });
		const chatModelLabel = chatToolbar.createDiv({ cls: "ed-chat-model-label" });
		const clearBtn = chatToolbar.createEl("button", { cls: "ed-chat-clear-btn", attr: { type: "button", title: "Clear chat" } });
		clearBtn.setText("\u{1F5D1} Clear");
		clearBtn.addEventListener("click", () => this.chat.clearChat());

		const chatMessages = chatContainer.createDiv({ cls: "ed-chat-messages", attr: { id: "ed-chat-messages" } });

		const chatForm = chatContainer.createEl("form", { cls: "ed-chat-form" });
		const chatInput = chatForm.createEl("input", {
			type: "text",
			cls: "ed-chat-input",
			attr: { placeholder: "Ask a question about this word or Spanish grammar..." },
		});

		const chatActions = chatForm.createDiv({ cls: "ed-chat-actions" });
		const chatRecentsBtn = chatActions.createEl("button", {
			cls: "ed-chat-recents-btn",
			attr: { type: "button", title: "Prompt history" },
		});
		chatRecentsBtn.setText("\u{1F552}");

		const chatSendBtn = chatActions.createEl("button", { cls: "ed-chat-send-btn", attr: { type: "submit" } });
		chatSendBtn.setText("Send");

		// Chat recents dropdown (in chatSection, not chatContainer, to avoid clipping)
		const chatRecentsDropdown = chatSection.createDiv({ cls: "ed-chat-recents-dropdown ed-hidden" });

		// Initialize ChatController
		this.chat.init(chatContainer, chatInput, chatModelLabel, chatRecentsDropdown, chatToggleBtn, this.chatSuggestionsContainer, chatForm, chatRecentsBtn);

		// Update chat model label
		this.chat.updateChatModelLabel();

		// === Delegated click handler ===
		container.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement;
			// Close recents if clicking outside the dropdown
			if (!target.closest(".ed-recents") && !target.closest(".ed-nav-recents-btn")) {
				this.nav.hideRecents();
			}
			if (!target.closest(".ed-chat-recents-dropdown") && !target.closest(".ed-chat-recents-btn")) {
				this.chat.hideChatRecents();
			}
			if (target.closest("[data-action='play-audio']")) {
				this.handlePlayAudio(target.closest("[data-action='play-audio']") as HTMLElement);
			} else if (target.closest(".ed-clickable-word")) {
				this.handleWordClick(target.closest(".ed-clickable-word") as HTMLElement);
			} else if (target.closest(".ed-ext-link")) {
				this.handleExtLink(target.closest(".ed-ext-link") as HTMLElement);
			} else if (target.closest("[data-action='ask-ai']")) {
				this.handleAskAi(target.closest("[data-action='ask-ai']") as HTMLElement);
			}
		});

		// Global keyboard shortcut for back/forward navigation
		this.containerEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.altKey && evt.key === "ArrowLeft") {
				evt.preventDefault();
				this.nav.navigateBack();
			} else if (evt.altKey && evt.key === "ArrowRight") {
				evt.preventDefault();
				this.nav.navigateForward();
			}
		});

		// Focus search input
		this.search.focus();
	}

	async onClose() {
		this.search.cleanup();
	}

	/** Focus the search input (public, for plugin commands) */
	public focusSearch() {
		this.search.focus();
	}

	/** Open the dictionary and look up a word (public, for URI handler / links) */
	public lookupWord(word: string) {
		this.search.setSearchText(word);
		this.search.hideTypeahead();
		this.doLookup(word, true);
		this.search.focus();
	}

	/** Update the chat model label (public, called by model-selector) */
	public updateChatModelLabel() {
		this.chat.updateChatModelLabel();
	}

	/** Update the view when database becomes ready */
	public notifyDatabaseReady() {
		const resultArea = this.containerEl.querySelector("#ed-result-area");
		if (resultArea) {
			const emptyState = resultArea.querySelector(".ed-loading");
			if (emptyState) {
				resultArea.innerHTML = EMPTY_STATE_HTML;
			}
		}
	}

	/** Notify the view of a database error */
	public notifyDatabaseError(error: string) {
		const resultArea = this.containerEl.querySelector("#ed-result-area");
		if (resultArea) {
			resultArea.innerHTML = renderDbError(error);
		}
	}

	// ============================================================
	// Search callbacks (wired to controllers)
	// ============================================================

	/** Called by SearchController when user submits a search or selects typeahead */
	private onSearch(word: string) {
		if (!word) {
			const resultArea = this.containerEl.querySelector("#ed-result-area");
			if (resultArea) {
				resultArea.innerHTML = EMPTY_STATE_HTML;
			}
			return;
		}
		this.doLookup(word, true);
	}

	/** Called by NavHistory when navigating back/forward or selecting a recent word */
	private onNavigate(word: string) {
		this.search.setSearchText(word);
		this.search.hideTypeahead();
		this.doLookup(word, true);
	}

	// ============================================================
	// Core lookup
	// ============================================================

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

				// Update chat suggestion chips for this word
				this.chat.renderChatSuggestions();

				if (pushHistory) {
					this.nav.push(word);
					this.nav.setCurrentWord(word);
				}

				// Auto-play audio for Spanish words
				if (result.word.lang === "es" && this.plugin.settings.autoPlayAudio) {
					this.handlePlayAudio(resultArea.querySelector("[data-action='play-audio']") as HTMLElement);
				}
			} else {
				this.currentResult = null;
				this.currentWord = word;
				// Best-guess language detection for the not-found prompt
				const langGuess = /[áéíóúñüÁÉÍÓÚÑÜ]/.test(word) ? "es" : "en";
				resultArea.innerHTML = renderNotFound(word, langGuess);
				this.chatSuggestionsContainer.empty();
				if (pushHistory) {
					this.nav.push(word);
					this.nav.setCurrentWord(word);
				}
			}
		} catch (err) {
			resultArea.innerHTML = renderDbError(
				err instanceof Error ? err.message : "An error occurred during lookup"
			);
		}
	}

	// ============================================================
	// Click handlers
	// ============================================================

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

		this.search.setSearchText(word);
		this.search.hideTypeahead();
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

	/** Handle "Ask AI about this word" click on not-found results */
	private handleAskAi(el: HTMLElement | null) {
		if (!el) return;
		const word = el.dataset.word || "";
		const lang = el.dataset.lang || "";
		if (!word) return;

		// Check if LLM is configured
		const settings = this.plugin.settings;
		if (!settings.llmModel) {
			new Notice("No LLM model configured. Go to Settings → Español Diccionario → LLM Chat to set up a model.");
			return;
		}

		// Build the prompt from settings template
		const prompt = settings.notFoundPrompt
			.replace(/{word}/g, word)
			.replace(/{source}/g, lang === "es" ? "Spanish" : lang === "en" ? "English" : "Spanish")
			.replace(/{target}/g, lang === "es" ? "English" : lang === "en" ? "Spanish" : "Spanish");

		this.chat.sendChatSuggestion(prompt);
	}
}
