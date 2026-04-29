import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type EspañolDiccionarioPlugin from "../main";
import { sendChatMessage } from "../chat/provider";
import { VIEW_TYPE_TRANSLATOR } from "../constants";
import { playTextAudio } from "../audio/provider";
import { renderFeatureShortcuts } from "./feature-shortcuts";
import { getFeatureShortcutNumber, isPlainAltShortcut, SHORTCUT_LABELS, titleWithShortcut } from "./keyboard-shortcuts";
import { normalizeInputFontSize } from "./input-font-size-state";
import {
	buildTranslationBreakdownPrompt,
	buildTranslatorPrompt,
	getTranslatorLanguageName,
	getTranslatorTtsLocale,
	guessTranslatorSourceLanguage,
	parseTranslatorResponse,
	type TranslatorLanguage,
	type TranslatorResult,
} from "./translator-state";

export class TranslatorView extends ItemView {
	private plugin: EspañolDiccionarioPlugin;
	private inputEl!: HTMLTextAreaElement;
	private translateBtnEl!: HTMLButtonElement;
	private inputTtsBtnEl!: HTMLButtonElement;
	private outputTtsBtnEl!: HTMLButtonElement;
	private chatBtnEl!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private resultEl!: HTMLElement;
	private currentResult: TranslatorResult | null = null;
	private currentInputText = "";
	private isTranslating = false;
	private currentAudio: HTMLAudioElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EspañolDiccionarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TRANSLATOR;
	}

	getDisplayText(): string {
		return "Translator";
	}

	getIcon(): string {
		return "languages";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("espanol-diccionario", "ed-translator-view");
		container.style.setProperty("--ed-input-font-size", `${normalizeInputFontSize(this.plugin.settings.inputFontSize)}px`);

		const headerEl = container.createDiv({ cls: "ed-translator-header" });
		headerEl.createEl("h2", { text: "Translator" });
		headerEl.createDiv({ cls: "ed-translator-subtitle", text: "Type English or Spanish. Translate it, play either side, then send it to chat for a learner breakdown with Leipzig glossing." });

		const toolbar = container.createDiv({ cls: "ed-translator-toolbar" });
		renderFeatureShortcuts(toolbar, this.plugin, VIEW_TYPE_TRANSLATOR);

		const form = container.createEl("form", { cls: "ed-translator-form" });
		this.inputEl = form.createEl("textarea", {
			cls: "ed-translator-input",
			attr: {
				rows: "5",
				placeholder: "Enter English or Spanish text...",
				spellcheck: "true",
			},
		}) as HTMLTextAreaElement;
		this.inputEl.addEventListener("input", () => this.handleInputChanged());
		this.inputEl.addEventListener("keydown", (evt) => {
			if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") {
				evt.preventDefault();
				void this.translateCurrentInput();
			}
		});
		this.translateBtnEl = form.createEl("button", { cls: "ed-nav-btn ed-translator-translate-btn", attr: { type: "submit", title: titleWithShortcut("Translate", SHORTCUT_LABELS.translatorTranslate) } });
		this.translateBtnEl.setText("↔ Translate");
		form.addEventListener("submit", (evt) => {
			evt.preventDefault();
			void this.translateCurrentInput();
		});

		this.resultEl = container.createDiv({ cls: "ed-translator-result ed-translator-empty" });
		this.resultEl.setText("Translation will appear here.");

		const bottomActions = container.createDiv({ cls: "ed-translator-bottom-actions" });
		this.inputTtsBtnEl = bottomActions.createEl("button", { cls: "ed-nav-btn ed-translator-input-tts-btn", attr: { type: "button", title: titleWithShortcut("Play input text", SHORTCUT_LABELS.translatorPlayInput) } });
		this.inputTtsBtnEl.setText("▶ Input");
		this.inputTtsBtnEl.addEventListener("click", () => void this.playInputAudio());

		this.outputTtsBtnEl = bottomActions.createEl("button", { cls: "ed-nav-btn ed-translator-output-tts-btn", attr: { type: "button", title: titleWithShortcut("Play translation", SHORTCUT_LABELS.translatorPlayTranslation) } });
		this.outputTtsBtnEl.setText("▶ Translation");
		this.outputTtsBtnEl.disabled = true;
		this.outputTtsBtnEl.addEventListener("click", () => void this.playTranslationAudio());

		this.chatBtnEl = bottomActions.createEl("button", { cls: "ed-nav-btn ed-translator-chat-btn", attr: { type: "button", title: titleWithShortcut("Open in Spanish Chat for learner breakdown", SHORTCUT_LABELS.translatorOpenChat) } });
		this.chatBtnEl.setText("💬 Breakdown");
		this.chatBtnEl.disabled = true;
		this.chatBtnEl.addEventListener("click", () => void this.openBreakdownChat());

		this.statusEl = container.createDiv({ cls: "ed-translator-status", text: "Ready." });

		container.addEventListener("keydown", (evt: KeyboardEvent) => this.handleShortcut(evt), true);
		this.inputEl.focus();
	}

	async onClose() {
		this.stopAudio();
	}

	focusInput() {
		this.inputEl?.focus();
	}

	setInputText(text: string) {
		if (!this.inputEl) return;
		this.inputEl.value = text;
		this.handleInputChanged();
		this.focusInput();
	}

	private handleInputChanged() {
		this.currentResult = null;
		this.currentInputText = "";
		this.outputTtsBtnEl.disabled = true;
		this.chatBtnEl.disabled = true;
		this.resultEl.empty();
		this.resultEl.addClass("ed-translator-empty");
		this.resultEl.setText("Translation will appear here.");
		this.setStatus("Ready.");
	}

	private handleShortcut(evt: KeyboardEvent) {
		const featureShortcut = getFeatureShortcutNumber(evt);
		if (featureShortcut === 1) {
			this.consume(evt);
			void this.plugin.activateView();
		} else if (featureShortcut === 2) {
			this.consume(evt);
			void this.plugin.activateSpanishChatView();
		} else if (featureShortcut === 3) {
			this.consume(evt);
			void this.plugin.activateTtsPracticeView();
		} else if (featureShortcut === 4) {
			this.consume(evt);
			void this.plugin.activateTranslatorView();
		} else if (isPlainAltShortcut(evt, "t")) {
			this.consume(evt);
			this.translateBtnEl.click();
		} else if (isPlainAltShortcut(evt, "i")) {
			this.consume(evt);
			this.inputTtsBtnEl.click();
		} else if (isPlainAltShortcut(evt, "o")) {
			this.consume(evt);
			this.outputTtsBtnEl.click();
		} else if (isPlainAltShortcut(evt, "b")) {
			this.consume(evt);
			this.chatBtnEl.click();
		}
	}

	private consume(evt: KeyboardEvent) {
		evt.preventDefault();
		evt.stopPropagation();
	}

	private async translateCurrentInput() {
		const input = this.inputEl.value.trim();
		if (!input || this.isTranslating) return;
		this.stopAudio();
		this.isTranslating = true;
		this.translateBtnEl.disabled = true;
		this.outputTtsBtnEl.disabled = true;
		this.chatBtnEl.disabled = true;
		this.currentResult = null;
		this.currentInputText = input;
		this.renderLoading(input);
		this.setStatus("Translating…");

		const guessedLanguage = guessTranslatorSourceLanguage(input);
		try {
			const response = await sendChatMessage(
				[{ role: "user", content: buildTranslatorPrompt({ text: input, sourceLanguage: guessedLanguage }) }],
				{ ...this.plugin.settings, llmTemperature: 0.1 },
			);
			if (response.error) throw new Error(response.error);
			const parsed = parseTranslatorResponse(response.message, guessedLanguage);
			if (!parsed) throw new Error("Translation response was not valid JSON.");
			this.currentResult = parsed;
			this.renderResult(input, parsed);
			this.setStatus(`${getTranslatorLanguageName(parsed.sourceLanguage)} → ${getTranslatorLanguageName(parsed.targetLanguage)}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.resultEl.empty();
			this.resultEl.addClass("ed-translator-empty");
			this.resultEl.setText("Translation failed.");
			this.setStatus(`Error: ${message}`);
			new Notice("Translator failed. Check the configured LLM server/model.");
		} finally {
			this.isTranslating = false;
			this.translateBtnEl.disabled = false;
		}
	}

	private renderLoading(input: string) {
		this.resultEl.empty();
		this.resultEl.removeClass("ed-translator-empty");
		this.resultEl.createDiv({ cls: "ed-translator-label", text: "Input" });
		this.resultEl.createDiv({ cls: "ed-translator-text ed-translator-source", text: input });
		this.resultEl.createDiv({ cls: "ed-translator-label", text: "Translation" });
		this.resultEl.createDiv({ cls: "ed-translator-text ed-translator-target", text: "Translating…" });
	}

	private renderResult(input: string, result: TranslatorResult) {
		this.resultEl.empty();
		this.resultEl.removeClass("ed-translator-empty");
		this.resultEl.createDiv({ cls: "ed-translator-label", text: `Input · ${getTranslatorLanguageName(result.sourceLanguage)}` });
		this.resultEl.createDiv({ cls: "ed-translator-text ed-translator-source", text: input });
		this.resultEl.createDiv({ cls: "ed-translator-label", text: `Translation · ${getTranslatorLanguageName(result.targetLanguage)}` });
		this.resultEl.createDiv({ cls: "ed-translator-text ed-translator-target", text: result.translation });
		this.outputTtsBtnEl.disabled = false;
		this.chatBtnEl.disabled = false;
	}

	private async playInputAudio() {
		const input = this.inputEl.value.trim();
		if (!input) return;
		const language = this.currentResult?.sourceLanguage ?? guessTranslatorSourceLanguage(input) ?? "es";
		await this.playAudio(input, language, "Playing input…");
	}

	private async playTranslationAudio() {
		if (!this.currentResult) return;
		await this.playAudio(this.currentResult.translation, this.currentResult.targetLanguage, "Playing translation…");
	}

	private async playAudio(text: string, language: TranslatorLanguage, status: string) {
		this.stopAudio();
		this.setStatus(status);
		const audio = await playTextAudio(text, getTranslatorTtsLocale(language));
		if (!audio) {
			this.setStatus("Audio failed to play.");
			return;
		}
		this.currentAudio = audio;
		audio.addEventListener("ended", () => {
			if (this.currentAudio === audio) {
				this.currentAudio = null;
				if (this.currentResult) {
					this.setStatus(`${getTranslatorLanguageName(this.currentResult.sourceLanguage)} → ${getTranslatorLanguageName(this.currentResult.targetLanguage)}`);
				} else {
					this.setStatus("Ready.");
				}
			}
		}, { once: true });
	}

	private stopAudio() {
		if (!this.currentAudio) return;
		this.currentAudio.pause();
		this.currentAudio.currentTime = 0;
		this.currentAudio = null;
	}

	private async openBreakdownChat() {
		if (!this.currentResult || !this.currentInputText) return;
		const prompt = buildTranslationBreakdownPrompt(this.currentInputText, this.currentResult);
		await this.plugin.activateSpanishChatView(prompt);
	}

	private setStatus(text: string) {
		this.statusEl?.setText(text);
	}
}
