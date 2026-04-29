// src/ui/chat-controller.ts — Chat UI logic for DictionaryView

import { App, MarkdownRenderer, Component } from "obsidian";
import { streamChatMessage, sendChatMessage } from "../chat/provider";
import type { ChatMessage } from "../chat/provider";
import type { DictionaryResult } from "../dictionary/data";
import type { PluginSettings } from "../settings";
import { MAX_CHAT_PROMPT_HISTORY, MARKDOWN_RENDER_DEBOUNCE_MS } from "../constants";
import { scrollMessageTopIntoView } from "./chat-scroll-state";
import { adjustChatFontSize, normalizeChatFontSize } from "./chat-font-size-state";
import {
	buildChatFollowUpSuggestions,
	buildContinueSuggestionPrompt,
	buildLookupChatSuggestions,
	buildLookupSuggestionPrompt,
	buildStaticLookupQuestion,
	filterNewSuggestions,
	parseLlmSuggestionList,
} from "./chat-follow-up-state";

/**
 * Manages the LLM chat panel within the dictionary view.
 * Decoupled from the view to keep DictionaryView slim.
 */
export class ChatController {
	private messages: ChatMessage[] = [];
	private chatInput!: HTMLInputElement;
	private chatContainer!: HTMLElement;
	private hostContainer!: HTMLElement;
	private chatModelLabel!: HTMLElement;
	private chatHistoryIndex = -1; // -1 means not navigating history
	private chatRecentsDropdown!: HTMLElement;
	private chatInputBeforeHistory = "";
	private chatToggleBtn!: HTMLButtonElement;
	private chatFontDownBtn!: HTMLButtonElement;
	private chatFontUpBtn!: HTMLButtonElement;
	private chatFullscreenBtn!: HTMLButtonElement;
	private chatSuggestionsContainer!: HTMLElement;
	private isStreaming = false;
	private isFullscreen = false;
	private lookupSuggestionRequestId = 0;

	// References needed from the view
	private app: App;
	private component: Component; // For MarkdownRenderer
	private settings: () => PluginSettings;
	private saveSettings: () => Promise<void>;
	private currentResult: () => DictionaryResult | null;

	constructor(
		app: App,
		component: Component,
		getSettings: () => PluginSettings,
		saveSettings: () => Promise<void>,
		getCurrentResult: () => DictionaryResult | null,
	) {
		this.app = app;
		this.component = component;
		this.settings = getSettings;
		this.saveSettings = saveSettings;
		this.currentResult = getCurrentResult;
	}

	/** Initialize UI element references (called once from onOpen) */
	init(
		hostContainer: HTMLElement,
		chatContainer: HTMLElement,
		chatInput: HTMLInputElement,
		chatModelLabel: HTMLElement,
		chatRecentsDropdown: HTMLElement,
		chatToggleBtn: HTMLButtonElement,
		chatFontDownBtn: HTMLButtonElement,
		chatFontUpBtn: HTMLButtonElement,
		chatFullscreenBtn: HTMLButtonElement,
		chatSuggestionsContainer: HTMLElement,
		chatForm: HTMLFormElement,
		chatRecentsBtn: HTMLButtonElement,
	) {
		this.hostContainer = hostContainer;
		this.chatContainer = chatContainer;
		this.chatInput = chatInput;
		this.chatModelLabel = chatModelLabel;
		this.chatRecentsDropdown = chatRecentsDropdown;
		this.chatToggleBtn = chatToggleBtn;
		this.chatFontDownBtn = chatFontDownBtn;
		this.chatFontUpBtn = chatFontUpBtn;
		this.chatFullscreenBtn = chatFullscreenBtn;
		this.chatSuggestionsContainer = chatSuggestionsContainer;

		// Arrow key navigation for prompt history
		this.chatInput.addEventListener("keydown", (evt) => {
			if (evt.key === "ArrowUp" || evt.key === "ArrowDown") {
				evt.preventDefault();
				this.navigateChatHistory(evt.key === "ArrowUp" ? -1 : 1);
			}
		});

		chatForm.addEventListener("submit", (evt) => {
			evt.preventDefault();
			this.sendChat();
		});

		chatRecentsBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.toggleChatRecents();
		});

		this.chatFontDownBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			void this.adjustChatFont(-1);
		});

		this.chatFontUpBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			void this.adjustChatFont(1);
		});

		this.chatFullscreenBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.toggleFullscreen();
		});

		this.chatContainer.addEventListener("keydown", (evt) => {
			if (evt.key === "Escape" && this.isFullscreen) {
				evt.preventDefault();
				this.setFullscreen(false);
			}
		});

		this.applyChatFontSize();
	}

	toggleChat() {
		this.chatContainer.classList.toggle("ed-hidden");
		const isHidden = this.chatContainer.classList.contains("ed-hidden");
		if (this.chatToggleBtn) {
			this.chatToggleBtn.classList.toggle("ed-nav-btn-active", !isHidden);
		}
		if (isHidden) {
			this.setFullscreen(false);
			return;
		}
		this.updateChatModelLabel();
		this.chatInput.focus();
	}

	closeChat() {
		this.chatContainer?.classList.add("ed-hidden");
		this.chatToggleBtn?.classList.remove("ed-nav-btn-active");
		this.setFullscreen(false);
		this.hideChatRecents();
	}

	updateChatModelLabel() {
		if (!this.chatModelLabel) return;
		const settings = this.settings();
		const model = settings.llmModel || "(no model)";
		const server = settings.llmServerUrl.replace(/\/\/+$/, "").replace(/^https?:\/\//, "").split("/")[0];
		this.chatModelLabel.textContent = `Model: ${model} · ${server}`;
		this.updateFontButtons();
	}

	clearChat() {
		this.messages = [];
		const messagesContainer = this.chatContainer.querySelector("#ed-chat-messages");
		if (messagesContainer) {
			messagesContainer.empty();
		}
	}

	private async adjustChatFont(delta: number) {
		const settings = this.settings();
		settings.chatFontSize = adjustChatFontSize(settings.chatFontSize, delta);
		this.applyChatFontSize();
		await this.saveSettings();
	}

	private applyChatFontSize() {
		const fontSize = normalizeChatFontSize(this.settings().chatFontSize);
		this.chatContainer?.style.setProperty("--ed-chat-font-size", `${fontSize}px`);
		this.updateFontButtons();
	}

	private updateFontButtons() {
		const fontSize = normalizeChatFontSize(this.settings().chatFontSize);
		if (this.chatFontDownBtn) {
			this.chatFontDownBtn.setAttribute("title", `Decrease chat font size (${fontSize}px)`);
		}
		if (this.chatFontUpBtn) {
			this.chatFontUpBtn.setAttribute("title", `Increase chat font size (${fontSize}px)`);
		}
	}

	toggleFullscreen() {
		this.setFullscreen(!this.isFullscreen);
	}

	private setFullscreen(enabled: boolean) {
		this.isFullscreen = enabled;
		this.hostContainer?.classList.toggle("ed-chat-fullscreen-active", enabled);
		this.chatFullscreenBtn?.classList.toggle("ed-chat-fullscreen-btn-active", enabled);
		if (this.chatFullscreenBtn) {
			this.chatFullscreenBtn.setText(enabled ? "🗗" : "⛶");
			this.chatFullscreenBtn.setAttribute("title", enabled ? "Exit focused chat" : "Focus chat");
			this.chatFullscreenBtn.setAttribute("aria-label", enabled ? "Exit focused chat" : "Focus chat");
		}
		if (enabled) {
			this.hideChatRecents();
			this.chatInput?.blur();
			const activeElement = document.activeElement;
			if (activeElement instanceof HTMLElement) {
				activeElement.blur();
			}
		}
	}

	/**
	 * Send a chat suggestion (from the suggestion links below definition).
	 * Opens chat if hidden, fills input, and sends.
	 */
	sendChatSuggestion(text: string) {
		// Open chat if hidden
		if (this.chatContainer.classList.contains("ed-hidden")) {
			this.toggleChat();
		}
		// Set input and send
		this.chatInput.value = text;
		this.sendChat();
	}

	/** Build context string for the LLM from the current dictionary result */
	private buildWordContext(): string {
		const result = this.currentResult();
		if (!result) return "";

		const { word, definitions, sentences } = result;
		const lines: string[] = [];
		lines.push(`The user is currently looking up: "${word.word}" (${word.lang === "es" ? "Spanish" : "English"}${word.pos ? ", " + word.pos : ""}).`);

		if (definitions.length > 0) {
			lines.push("Definitions:");
			for (const d of definitions) {
				lines.push(`  ${d.senseNum ?? "•"}. ${d.definition}${d.context ? " (" + d.context + ")" : ""}`);
			}
		}

		if (sentences.length > 0) {
			lines.push("Example sentences:");
			for (const s of sentences.slice(0, 3)) {
				lines.push(`  • ${s.sentenceEs || ""}${s.sentenceEn ? " = " + s.sentenceEn : ""}`);
			}
		}

		if (result.resolvedFrom) {
			lines.push(`(Resolved from inflected form: "${result.resolvedFrom}")`);
		}

		return lines.join("\n");
	}

	/** Render chat suggestion chips for the current word */
	renderChatSuggestions() {
		const container = this.chatSuggestionsContainer;
		if (!container) return;
		container.empty();

		const result = this.currentResult();
		if (!result) return;

		const requestId = ++this.lookupSuggestionRequestId;
		container.createEl("span", { cls: "ed-suggestion-label", text: "Ask:" });
		container.createEl("span", { cls: "ed-suggestion-loading", text: " Generating questions…" });

		void this.generateLookupSuggestions(result).then((links) => {
			if (requestId !== this.lookupSuggestionRequestId) return;
			this.renderSuggestionLinks(container, "Ask:", links);
		});
	}

	private async generateLookupSuggestions(result: DictionaryResult): Promise<string[]> {
		const context = this.getSuggestionContext(result);
		const staticQuestion = buildStaticLookupQuestion(result.word.word);
		const fallback = buildLookupChatSuggestions(context);
		try {
			const response = await sendChatMessage([
				{ role: "user", content: buildLookupSuggestionPrompt(context) },
			], this.settings());
			if (response.error) return fallback;
			const generated = parseLlmSuggestionList(response.message, 3);
			return generated.length === 3 ? [staticQuestion, ...generated] : fallback;
		} catch {
			return fallback;
		}
	}

	private getSuggestionContext(result: DictionaryResult) {
		return {
			word: result.word.word,
			lang: result.word.lang,
			pos: result.word.pos,
			definitions: result.definitions.map((definition) => definition.definition),
		};
	}

	private getPreviousContinueQuestions(): string[] {
		return Array.from(this.chatContainer.querySelectorAll(".ed-chat-followup-link"))
			.map((link) => link.textContent?.trim() ?? "")
			.filter(Boolean);
	}

	private renderSuggestionLinks(container: HTMLElement, label: string, links: string[]) {
		container.empty();
		if (links.length === 0) return;
		container.createEl("span", { cls: "ed-suggestion-label", text: label });

		for (let i = 0; i < links.length; i++) {
			if (i > 0) {
				container.createEl("span", { cls: "ed-suggestion-sep", text: " · " });
			}
			const link = container.createEl("a", {
				cls: "ed-suggestion-link",
				text: links[i],
			});
			link.href = "#";
			const linkText = links[i];
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.sendChatSuggestion(linkText);
			});
		}
	}

	private navigateChatHistory(direction: -1 | 1) {
		const history = this.settings().chatPromptHistory;
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
		const history = this.settings().chatPromptHistory;

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
				this.settings().chatPromptHistory = [];
				await this.saveSettings();
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
		const settings = this.settings();
		const hist = settings.chatPromptHistory;
		if (hist[hist.length - 1] !== userText) {
			hist.push(userText);
			if (hist.length > MAX_CHAT_PROMPT_HISTORY) hist.shift();
			await this.saveSettings();
		}
		this.chatHistoryIndex = -1; // reset navigation

		// Add user message
		this.messages.push({ role: "user", content: userText });

		// Render user message
		const messagesContainer = this.chatContainer.querySelector("#ed-chat-messages");
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

		// Scroll to show the start of the assistant bubble, not the bottom.
		if (messagesContainer) {
			this.scrollAssistantMessageToTop(messagesContainer as HTMLElement, assistantDiv);
		}

		// Stream response
		assistantDiv.textContent = "";
		let accumulated = "";
		const wordContext = this.buildWordContext();
		let renderTimeout: ReturnType<typeof setTimeout> | null = null;

		const renderMarkdown = async () => {
			const md = accumulated;
			const container = assistantDiv;
			container.empty();
			await MarkdownRenderer.render(this.app, md, container, "", this.component);
		};

		const debouncedRender = () => {
			if (renderTimeout) clearTimeout(renderTimeout);
			renderTimeout = setTimeout(() => {
				void renderMarkdown();
			}, MARKDOWN_RENDER_DEBOUNCE_MS);
		};

		const response = await streamChatMessage(
			this.messages,
			this.settings(),
			(text) => {
				accumulated += text;
				assistantDiv.textContent = accumulated;
				if (messagesContainer) {
					this.scrollAssistantMessageToTop(messagesContainer as HTMLElement, assistantDiv);
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
			this.messages.push({ role: "assistant", content: response.message });
			// Final markdown render
			await renderMarkdown();
			await this.appendFollowUpSuggestions(assistantDiv, response.message);
		}

		if (messagesContainer) {
			this.scrollAssistantMessageToTop(messagesContainer as HTMLElement, assistantDiv);
		}

		this.isStreaming = false;
	}

	/** Hide chat recents dropdown */
	hideChatRecents() {
		this.chatRecentsDropdown?.classList.add("ed-hidden");
	}

	private scrollAssistantMessageToTop(messagesContainer: HTMLElement, assistantEl: HTMLElement) {
		scrollMessageTopIntoView(messagesContainer, assistantEl);
	}

	private async appendFollowUpSuggestions(assistantDiv: HTMLElement, assistantMarkdown: string) {
		const result = this.currentResult();
		const context = result ? this.getSuggestionContext(result) : {};
		const previousQuestions = this.getPreviousContinueQuestions();
		const fallback = filterNewSuggestions(buildChatFollowUpSuggestions(assistantMarkdown, context), previousQuestions, 3);

		const followUps = assistantDiv.createDiv({ cls: "ed-chat-followups" });
		followUps.createEl("span", { cls: "ed-chat-followups-label", text: "Continue:" });
		followUps.createEl("span", { cls: "ed-suggestion-loading", text: " Generating questions…" });

		let suggestions = fallback;
		try {
			const response = await sendChatMessage([
				{ role: "user", content: buildContinueSuggestionPrompt(assistantMarkdown, context, previousQuestions) },
			], this.settings());
			if (!response.error) {
				const generated = filterNewSuggestions(parseLlmSuggestionList(response.message, 6), previousQuestions, 3);
				if (generated.length === 3) suggestions = generated;
			}
		} catch {
			// Use deterministic fallback when the suggestion-generation call fails.
		}

		followUps.empty();
		if (suggestions.length === 0) {
			followUps.remove();
			return;
		}
		followUps.createEl("span", { cls: "ed-chat-followups-label", text: "Continue:" });

		for (const suggestion of suggestions) {
			const link = followUps.createEl("a", {
				cls: "ed-chat-followup-link",
				text: suggestion,
			});
			link.href = "#";
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.sendChatSuggestion(suggestion);
			});
		}
	}
}
