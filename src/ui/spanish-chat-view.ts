import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";

import type EspañolDiccionarioPlugin from "../main";
import { streamChatMessage, type ChatMessage } from "../chat/provider";
import { MARKDOWN_RENDER_DEBOUNCE_MS, MAX_CHAT_PROMPT_HISTORY, VIEW_TYPE_SPANISH_CHAT } from "../constants";
import { DEFAULT_SPANISH_CHAT_STARTERS, assistantMessageToPracticeText, shouldSubmitSpanishChatPrompt } from "./spanish-chat-state";
import { scrollMessageTopIntoView } from "./chat-scroll-state";
import { adjustChatFontSize, normalizeChatFontSize } from "./chat-font-size-state";
import { renderFeatureShortcuts } from "./feature-shortcuts";
import { SHORTCUT_LABELS, getFeatureShortcutNumber, isAltBackspace, isPlainAltShortcut, titleWithShortcut } from "./keyboard-shortcuts";
import { normalizeInputFontSize } from "./input-font-size-state";

export class SpanishChatView extends ItemView {
	private plugin: EspañolDiccionarioPlugin;
	private messages: ChatMessage[] = [];
	private isStreaming = false;
	private promptHistoryIndex = -1;
	private promptInputBeforeHistory = "";

	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private chatContainerEl!: HTMLElement;
	private modelLabelEl!: HTMLElement;
	private recentsDropdownEl!: HTMLElement;
	private emptyStateEl!: HTMLElement;
	private clearBtnEl!: HTMLButtonElement;
	private recentsBtnEl!: HTMLButtonElement;
	private fontDownBtnEl!: HTMLButtonElement;
	private fontUpBtnEl!: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, plugin: EspañolDiccionarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SPANISH_CHAT;
	}

	getDisplayText(): string {
		return "Spanish Chat";
	}

	getIcon(): string {
		return "messages-square";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("espanol-diccionario", "ed-spanish-chat-view");
		container.style.setProperty("--ed-input-font-size", `${normalizeInputFontSize(this.plugin.settings.inputFontSize)}px`);

		const headerEl = container.createDiv({ cls: "ed-spanish-chat-header" });
		headerEl.createEl("h2", { text: "Spanish Chat" });
		headerEl.createDiv({
			cls: "ed-spanish-chat-subtitle",
			text: "Practice conversation, ask for corrections, and send useful dialogue straight to TTS.",
		});

		const chatSection = container.createDiv({ cls: "ed-chat-section ed-spanish-chat-section" });
		const chatContainer = chatSection.createDiv({ cls: "ed-chat-container ed-spanish-chat-container" });
		this.chatContainerEl = chatContainer;

		const toolbar = chatContainer.createDiv({ cls: "ed-chat-toolbar ed-spanish-chat-toolbar" });
		this.modelLabelEl = toolbar.createDiv({ cls: "ed-chat-model-label" });
		const toolbarActions = toolbar.createDiv({ cls: "ed-spanish-chat-toolbar-actions" });

		this.recentsBtnEl = toolbarActions.createEl("button", {
			cls: "ed-chat-recents-btn",
			attr: { type: "button", title: titleWithShortcut("Prompt history", SHORTCUT_LABELS.chatHistory) },
		});
		this.recentsBtnEl.setText("🕐");
		this.recentsBtnEl.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.togglePromptHistory();
		});

		this.fontDownBtnEl = toolbarActions.createEl("button", {
			cls: "ed-chat-font-btn ed-chat-font-down-btn",
			attr: { type: "button", title: titleWithShortcut("Decrease chat font size", SHORTCUT_LABELS.chatFontDown) },
		});
		this.fontDownBtnEl.setText("A−");
		this.fontDownBtnEl.addEventListener("click", () => {
			void this.adjustChatFont(-1);
		});

		this.fontUpBtnEl = toolbarActions.createEl("button", {
			cls: "ed-chat-font-btn ed-chat-font-up-btn",
			attr: { type: "button", title: titleWithShortcut("Increase chat font size", SHORTCUT_LABELS.chatFontUp) },
		});
		this.fontUpBtnEl.setText("A+");
		this.fontUpBtnEl.addEventListener("click", () => {
			void this.adjustChatFont(1);
		});

		this.clearBtnEl = toolbarActions.createEl("button", {
			cls: "ed-chat-clear-btn",
			attr: { type: "button", title: titleWithShortcut("Clear conversation", SHORTCUT_LABELS.chatClear) },
		});
		this.clearBtnEl.setText("🗑 Clear");
		this.clearBtnEl.addEventListener("click", () => this.clearConversation());
		renderFeatureShortcuts(toolbarActions, this.plugin, VIEW_TYPE_SPANISH_CHAT);

		this.emptyStateEl = chatContainer.createDiv({ cls: "ed-spanish-chat-empty-state" });
		this.emptyStateEl.createDiv({
			cls: "ed-spanish-chat-empty-copy",
			text: "Start with one of these prompts or type your own below.",
		});
		const startersEl = this.emptyStateEl.createDiv({ cls: "ed-spanish-chat-starters" });
		for (const starter of DEFAULT_SPANISH_CHAT_STARTERS) {
			const btn = startersEl.createEl("button", {
				cls: "ed-spanish-chat-starter-btn",
				attr: { type: "button" },
				text: starter,
			});
			btn.addEventListener("click", () => this.sendPrompt(starter));
		}

		this.messagesEl = chatContainer.createDiv({ cls: "ed-chat-messages ed-spanish-chat-messages" });

		const form = chatContainer.createEl("form", { cls: "ed-chat-form ed-spanish-chat-form" });
		this.inputEl = form.createEl("textarea", {
			cls: "ed-chat-input ed-spanish-chat-input",
			attr: {
				placeholder: "Practice a Spanish conversation, ask for corrections, or generate dialogue...",
				rows: "3",
			},
		});
		this.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "ArrowUp" || evt.key === "ArrowDown") {
				evt.preventDefault();
				this.navigatePromptHistory(evt.key === "ArrowUp" ? -1 : 1);
				return;
			}
			if (shouldSubmitSpanishChatPrompt(evt)) {
				evt.preventDefault();
				void this.sendCurrentInput();
			}
		});

		const actionsEl = form.createDiv({ cls: "ed-chat-actions ed-spanish-chat-actions" });
		actionsEl.createEl("button", { cls: "ed-chat-send-btn", text: "Send", attr: { type: "submit", title: titleWithShortcut("Send", SHORTCUT_LABELS.chatSend) } });
		form.addEventListener("submit", (evt) => {
			evt.preventDefault();
			void this.sendCurrentInput();
		});

		this.recentsDropdownEl = chatSection.createDiv({ cls: "ed-chat-recents-dropdown ed-hidden" });

		container.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement;
			if (!target.closest(".ed-chat-recents-dropdown") && !target.closest(".ed-chat-recents-btn")) {
				this.hidePromptHistory();
			}
		});

		container.addEventListener("keydown", (evt: KeyboardEvent) => {
			const featureShortcut = getFeatureShortcutNumber(evt);
			if (featureShortcut === 1) {
				evt.preventDefault();
				evt.stopPropagation();
				void this.plugin.activateView();
			} else if (featureShortcut === 2) {
				evt.preventDefault();
				evt.stopPropagation();
				void this.plugin.activateSpanishChatView();
			} else if (featureShortcut === 3) {
				evt.preventDefault();
				evt.stopPropagation();
				void this.plugin.activateTtsPracticeView();
			} else if (featureShortcut === 4) {
				evt.preventDefault();
				evt.stopPropagation();
				void this.plugin.activateTranslatorView();
			} else if (isPlainAltShortcut(evt, "r")) {
				evt.preventDefault();
				evt.stopPropagation();
				this.recentsBtnEl.click();
			} else if (isPlainAltShortcut(evt, "-")) {
				evt.preventDefault();
				evt.stopPropagation();
				this.fontDownBtnEl.click();
			} else if (isPlainAltShortcut(evt, "=")) {
				evt.preventDefault();
				evt.stopPropagation();
				this.fontUpBtnEl.click();
			} else if (isAltBackspace(evt)) {
				evt.preventDefault();
				evt.stopPropagation();
				this.clearBtnEl.click();
			}
		}, true);

		this.updateModelLabel();
		this.applyChatFontSize();
		this.syncEmptyState();
		this.inputEl.focus();
	}

	async onClose() {
		this.hidePromptHistory();
	}

	focusInput() {
		this.inputEl?.focus();
	}

	setDraftPrompt(text: string) {
		if (!this.inputEl) return;
		this.inputEl.value = text;
		this.focusInput();
	}

	private updateModelLabel() {
		const settings = this.plugin.settings;
		const model = settings.llmModel || "(no model)";
		const server = settings.llmServerUrl.replace(/\/+$/, "").replace(/^https?:\/\//, "").split("/")[0];
		this.modelLabelEl.setText(`Model: ${model} · ${server}`);
		this.updateFontButtons();
	}

	private syncEmptyState() {
		if (!this.emptyStateEl) return;
		this.emptyStateEl.classList.toggle("ed-hidden", this.messages.length > 0);
		this.clearBtnEl.disabled = this.messages.length === 0;
	}

	private clearConversation() {
		this.messages = [];
		this.messagesEl?.empty();
		this.syncEmptyState();
	}

	private async adjustChatFont(delta: number) {
		this.plugin.settings.chatFontSize = adjustChatFontSize(this.plugin.settings.chatFontSize, delta);
		this.applyChatFontSize();
		await this.plugin.saveSettings();
	}

	private applyChatFontSize() {
		const fontSize = normalizeChatFontSize(this.plugin.settings.chatFontSize);
		this.chatContainerEl?.style.setProperty("--ed-chat-font-size", `${fontSize}px`);
		this.updateFontButtons();
	}

	private updateFontButtons() {
		const fontSize = normalizeChatFontSize(this.plugin.settings.chatFontSize);
		this.fontDownBtnEl?.setAttribute("title", titleWithShortcut(`Decrease chat font size (${fontSize}px)`, SHORTCUT_LABELS.chatFontDown));
		this.fontUpBtnEl?.setAttribute("title", titleWithShortcut(`Increase chat font size (${fontSize}px)`, SHORTCUT_LABELS.chatFontUp));
	}

	private async sendPrompt(prompt: string) {
		this.inputEl.value = prompt;
		await this.sendCurrentInput();
	}

	private async sendCurrentInput() {
		const userText = this.inputEl.value.trim();
		if (!userText || this.isStreaming) return;

		this.inputEl.value = "";
		this.isStreaming = true;
		this.hidePromptHistory();
		this.pushPromptHistory(userText);
		this.promptHistoryIndex = -1;

		this.messages.push({ role: "user", content: userText });
		this.appendUserMessage(userText);
		this.syncEmptyState();

		const assistantShell = this.createAssistantShell();
		let accumulated = "";
		let renderTimeout: ReturnType<typeof setTimeout> | null = null;

		const renderMarkdown = () => {
			assistantShell.contentEl.empty();
			void MarkdownRenderer.render(this.app, accumulated, assistantShell.contentEl, "", this);
		};

		const debouncedRender = () => {
			if (renderTimeout) clearTimeout(renderTimeout);
			renderTimeout = setTimeout(renderMarkdown, MARKDOWN_RENDER_DEBOUNCE_MS);
		};

		const response = await streamChatMessage(
			this.messages,
			{ ...this.plugin.settings, systemPrompt: this.plugin.settings.spanishChatSystemPrompt },
			(text) => {
				accumulated += text;
				assistantShell.contentEl.setText(accumulated);
				this.scrollAssistantMessageToTop(assistantShell.messageEl);
				debouncedRender();
			},
		);

		if (renderTimeout) clearTimeout(renderTimeout);

		if (response.error) {
			assistantShell.contentEl.setText(`Error: ${response.error}`);
			assistantShell.messageEl.classList.add("ed-chat-error");
		} else {
			this.messages.push({ role: "assistant", content: response.message });
			accumulated = response.message;
			renderMarkdown();
			this.appendAssistantActions(assistantShell.actionsEl, response.message);
		}

		this.isStreaming = false;
		this.scrollAssistantMessageToTop(assistantShell.messageEl);
	}

	private appendUserMessage(text: string) {
		const userDiv = this.messagesEl.createDiv({ cls: "ed-chat-msg ed-chat-user" });
		userDiv.setText(text);
		this.scrollMessagesToBottom();
	}

	private createAssistantShell() {
		const wrapperEl = this.messagesEl.createDiv({ cls: "ed-chat-msg ed-chat-assistant ed-spanish-chat-assistant-wrap" });
		const contentEl = wrapperEl.createDiv({ cls: "ed-spanish-chat-assistant-content" });
		contentEl.setText("Thinking...");
		const actionsEl = wrapperEl.createDiv({ cls: "ed-spanish-chat-message-actions" });
		this.scrollAssistantMessageToTop(wrapperEl);
		return { messageEl: wrapperEl, contentEl, actionsEl };
	}

	private appendAssistantActions(actionsEl: HTMLElement, markdown: string) {
		actionsEl.empty();
		const sendToTtsBtn = actionsEl.createEl("button", {
			cls: "ed-spanish-chat-message-btn",
			attr: { type: "button" },
			text: "Send to TTS",
		});
		sendToTtsBtn.addEventListener("click", () => {
			void this.sendAssistantMessageToTts(markdown);
		});
	}

	private async sendAssistantMessageToTts(markdown: string) {
		const text = assistantMessageToPracticeText(markdown);
		if (!text) {
			new Notice("Nothing usable to send to TTS.");
			return;
		}
		await this.plugin.activateTtsPracticeView(text);
		new Notice("Sent assistant message to Spanish TTS practice.");
	}

	private pushPromptHistory(prompt: string) {
		const history = this.plugin.settings.chatPromptHistory;
		if (history[history.length - 1] !== prompt) {
			history.push(prompt);
			if (history.length > MAX_CHAT_PROMPT_HISTORY) history.shift();
			void this.plugin.saveSettings();
		}
	}

	private navigatePromptHistory(direction: -1 | 1) {
		const history = this.plugin.settings.chatPromptHistory;
		if (history.length === 0) return;

		if (this.promptHistoryIndex === -1) {
			this.promptInputBeforeHistory = this.inputEl.value;
		}

		const nextIndex = this.promptHistoryIndex === -1
			? (direction === -1 ? history.length - 1 : -1)
			: this.promptHistoryIndex + direction;

		if (nextIndex < 0 || nextIndex >= history.length) {
			this.promptHistoryIndex = -1;
			this.inputEl.value = this.promptInputBeforeHistory;
		} else {
			this.promptHistoryIndex = nextIndex;
			this.inputEl.value = history[nextIndex];
		}

		this.focusInput();
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private togglePromptHistory() {
		if (!this.recentsDropdownEl.classList.contains("ed-hidden")) {
			this.hidePromptHistory();
			return;
		}
		this.recentsDropdownEl.empty();
		const history = this.plugin.settings.chatPromptHistory;
		if (history.length === 0) {
			this.recentsDropdownEl.createDiv({ cls: "ed-chat-recents-empty", text: "No prompts yet" });
		} else {
			for (let i = history.length - 1; i >= 0; i--) {
				const item = this.recentsDropdownEl.createDiv({ cls: "ed-chat-recents-item" });
				item.setText(history[i]);
				item.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.inputEl.value = history[i];
					this.focusInput();
					this.hidePromptHistory();
				});
			}
			const clearItem = this.recentsDropdownEl.createDiv({ cls: "ed-chat-recents-clear", text: "Clear all prompts" });
			clearItem.addEventListener("click", async (evt) => {
				evt.stopPropagation();
				this.plugin.settings.chatPromptHistory = [];
				await this.plugin.saveSettings();
				this.hidePromptHistory();
			});
		}
		this.recentsDropdownEl.classList.remove("ed-hidden");
	}

	hidePromptHistory() {
		this.recentsDropdownEl?.classList.add("ed-hidden");
	}

	private scrollMessagesToBottom() {
		if (!this.messagesEl) return;
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private scrollAssistantMessageToTop(messageEl: HTMLElement) {
		if (!this.messagesEl) return;
		scrollMessageTopIntoView(this.messagesEl, messageEl);
	}
}
