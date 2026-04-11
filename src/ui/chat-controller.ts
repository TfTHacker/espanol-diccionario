// src/ui/chat-controller.ts — Chat UI logic for DictionaryView

import { Notice, MarkdownRenderer, Component } from "obsidian";
import { streamChatMessage } from "../chat/provider";
import type { ChatMessage } from "../chat/provider";
import type { DictionaryResult } from "../dictionary/data";
import type { PluginSettings } from "../settings";
import { MAX_CHAT_PROMPT_HISTORY, MARKDOWN_RENDER_DEBOUNCE_MS } from "../constants";

/**
 * Manages the LLM chat panel within the dictionary view.
 * Decoupled from the view to keep DictionaryView slim.
 */
export class ChatController {
	private messages: ChatMessage[] = [];
	private chatInput!: HTMLInputElement;
	private chatContainer!: HTMLElement;
	private chatModelLabel!: HTMLElement;
	private chatHistoryIndex = -1; // -1 means not navigating history
	private chatRecentsDropdown!: HTMLElement;
	private chatInputBeforeHistory = "";
	private chatToggleBtn!: HTMLButtonElement;
	private chatSuggestionsContainer!: HTMLElement;
	private isStreaming = false;

	// References needed from the view
	private app: any; // Obsidian App
	private component: Component; // For MarkdownRenderer
	private settings: () => PluginSettings;
	private saveSettings: () => Promise<void>;
	private currentResult: () => DictionaryResult | null;

	constructor(
		app: any,
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
		chatContainer: HTMLElement,
		chatInput: HTMLInputElement,
		chatModelLabel: HTMLElement,
		chatRecentsDropdown: HTMLElement,
		chatToggleBtn: HTMLButtonElement,
		chatSuggestionsContainer: HTMLElement,
		chatForm: HTMLFormElement,
		chatRecentsBtn: HTMLButtonElement,
	) {
		this.chatContainer = chatContainer;
		this.chatInput = chatInput;
		this.chatModelLabel = chatModelLabel;
		this.chatRecentsDropdown = chatRecentsDropdown;
		this.chatToggleBtn = chatToggleBtn;
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
	}

	toggleChat() {
		this.chatContainer.classList.toggle("ed-hidden");
		const isHidden = this.chatContainer.classList.contains("ed-hidden");
		if (this.chatToggleBtn) {
			this.chatToggleBtn.classList.toggle("ed-nav-btn-active", !isHidden);
		}
		if (!isHidden) {
			this.updateChatModelLabel();
			this.chatInput.focus();
		}
	}

	updateChatModelLabel() {
		if (!this.chatModelLabel) return;
		const settings = this.settings();
		const model = settings.llmModel || "(no model)";
		const server = settings.llmServerUrl.replace(/\/\/+$/, "").replace(/^https?:\/\//, "").split("/")[0];
		this.chatModelLabel.textContent = `Model: ${model} · ${server}`;
	}

	clearChat() {
		this.messages = [];
		const messagesContainer = this.chatContainer.querySelector("#ed-chat-messages");
		if (messagesContainer) {
			messagesContainer.empty();
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

		const { word } = result;
		const wordStr = word.word;
		const pos = word.pos || "";
		const defs = result.definitions.map(d => d.definition).join("; ");

		const templates = this.settings().chatSuggestions;
		const links: string[] = [];

		for (const template of templates) {
			if (!template.trim()) continue;
			const text = template
				.replace(/{word}/g, wordStr)
				.replace(/{pos}/g, pos)
				.replace(/{defs}/g, defs);
			links.push(text);
		}

		if (links.length === 0) return;

		container.createEl("span", { cls: "ed-suggestion-label", text: "Ask:" });

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

		// Scroll to bottom
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}

		// Stream response
		assistantDiv.textContent = "";
		let accumulated = "";
		const wordContext = this.buildWordContext();
		let renderTimeout: ReturnType<typeof setTimeout> | null = null;

		const chatContainer = this.chatContainer;
		const renderMarkdown = () => {
			const md = accumulated;
			const container = assistantDiv;
			container.empty();
			MarkdownRenderer.render(this.app, md, container, "", this.component);
		};

		const debouncedRender = () => {
			if (renderTimeout) clearTimeout(renderTimeout);
			renderTimeout = setTimeout(renderMarkdown, MARKDOWN_RENDER_DEBOUNCE_MS);
		};

		const response = await streamChatMessage(
			this.messages,
			this.settings(),
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
			this.messages.push({ role: "assistant", content: response.message });
			// Final markdown render
			renderMarkdown();
		}

		this.isStreaming = false;
	}

	/** Hide chat recents dropdown */
	hideChatRecents() {
		this.chatRecentsDropdown?.classList.add("ed-hidden");
	}
}