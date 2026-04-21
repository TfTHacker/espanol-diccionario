// src/settings.ts — Plugin settings tab & defaults

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { getDatabaseStats, redownloadDatabase } from "./dictionary/db";
import type EspañolDiccionarioPlugin from "./main";
import { showModelPicker } from "./ui/model-selector";

export interface PluginSettings {
	llmServerUrl: string;
	llmApiKey: string;
	llmModel: string;
	llmTemperature: number;
	systemPrompt: string;
	maxSentences: number;
	autoPlayAudio: boolean;
	navHistory: string[];
	ttsPracticeHistory: string[];
	ttsPracticeDraft: string;
	ttsPracticeAutoRepeat: boolean;
	spanishChatSystemPrompt: string;
	chatPromptHistory: string[];
	chatSuggestions: [string, string, string, string];
	notFoundPrompt: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	llmServerUrl: "https://ollama.com",
	llmApiKey: "",
	llmModel: "gemma3:4b",
	llmTemperature: 0.7,
	systemPrompt: `You are a helpful Spanish language tutor specializing in Castilian (Spain) Spanish.
When the user looks up a word, provide additional context, usage notes, and example
sentences. Always use Spain Spanish conventions (vosotros, distinción, etc.).
When explaining grammar, be clear and give practical examples. Respond in the same
language the user writes in (English or Spanish).`,
	maxSentences: 5,
	autoPlayAudio: false,
	navHistory: [],
	ttsPracticeHistory: [],
	ttsPracticeDraft: "",
	ttsPracticeAutoRepeat: false,
	spanishChatSystemPrompt: `You are a patient Castilian Spanish conversation partner and tutor.
Help the user practice real Spanish dialogue for everyday situations in Spain.
Prefer natural Spain Spanish vocabulary and usage. When helpful, gently correct mistakes,
explain them briefly, and then continue the conversation.
When the user asks for roleplay or sample dialogue, provide a clean Spanish-only dialogue block that sounds natural when read aloud, and keep explanations separate and brief unless the user asks for detailed notes.`,
	chatPromptHistory: [],
	chatSuggestions: [
		"Tell me more about \"{word}\"",
		"Give me example sentences using \"{word}\"",
		"What words are easily confused with \"{word}\"?",
		"Explain the different meanings of \"{word}\"",
	],
	notFoundPrompt: "Translate \"{word}\" from {source} to {target}. Provide the translation, part of speech, and 3 example sentences using the word in context. Use Castilian Spanish",
};

export function cloneDefaultSettings(): PluginSettings {
	return {
		...DEFAULT_SETTINGS,
		navHistory: [...DEFAULT_SETTINGS.navHistory],
		ttsPracticeHistory: [...DEFAULT_SETTINGS.ttsPracticeHistory],
		chatPromptHistory: [...DEFAULT_SETTINGS.chatPromptHistory],
		chatSuggestions: [...DEFAULT_SETTINGS.chatSuggestions],
	};
}

export function normalizeSettings(loaded: unknown): PluginSettings {
	const settings = cloneDefaultSettings();
	if (!loaded || typeof loaded !== "object") return settings;

	const raw = loaded as Partial<PluginSettings>;

	if (typeof raw.llmServerUrl === "string") settings.llmServerUrl = raw.llmServerUrl;
	if (typeof raw.llmApiKey === "string") settings.llmApiKey = raw.llmApiKey;
	if (typeof raw.llmModel === "string") settings.llmModel = raw.llmModel;
	if (typeof raw.llmTemperature === "number") settings.llmTemperature = raw.llmTemperature;
	if (typeof raw.systemPrompt === "string") settings.systemPrompt = raw.systemPrompt;
	if (typeof raw.maxSentences === "number") settings.maxSentences = raw.maxSentences;
	if (typeof raw.autoPlayAudio === "boolean") settings.autoPlayAudio = raw.autoPlayAudio;
	if (typeof raw.notFoundPrompt === "string") settings.notFoundPrompt = raw.notFoundPrompt;
	if (typeof raw.ttsPracticeDraft === "string") settings.ttsPracticeDraft = raw.ttsPracticeDraft;
	if (typeof raw.ttsPracticeAutoRepeat === "boolean") settings.ttsPracticeAutoRepeat = raw.ttsPracticeAutoRepeat;
	if (typeof raw.spanishChatSystemPrompt === "string") settings.spanishChatSystemPrompt = raw.spanishChatSystemPrompt;

	if (Array.isArray(raw.navHistory)) {
		settings.navHistory = raw.navHistory.filter((item): item is string => typeof item === "string");
	}

	if (Array.isArray(raw.ttsPracticeHistory)) {
		settings.ttsPracticeHistory = raw.ttsPracticeHistory.filter((item): item is string => typeof item === "string");
	}

	if (Array.isArray(raw.chatPromptHistory)) {
		settings.chatPromptHistory = raw.chatPromptHistory.filter((item): item is string => typeof item === "string");
	}

	if (Array.isArray(raw.chatSuggestions)) {
		for (let i = 0; i < 4; i++) {
			const suggestion = raw.chatSuggestions[i];
			if (typeof suggestion === "string") {
				settings.chatSuggestions[i] = suggestion;
			}
		}
	}

	return settings;
}

export class EspañolDiccionarioSettingTab extends PluginSettingTab {
	plugin: EspañolDiccionarioPlugin;

	constructor(app: App, plugin: EspañolDiccionarioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── LLM Parameters ───────────────────────────────────────────

		containerEl.createEl("h3", { text: "LLM parameters" });

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("OpenAI-compatible API endpoint. Use http://localhost:11434 for local Ollama, or https://api.openai.com/v1 for OpenAI.")
			.addText((text) =>
				text
					.setPlaceholder("https://ollama.com")
					.setValue(this.plugin.settings.llmServerUrl)
					.onChange(async (value) => {
						this.plugin.settings.llmServerUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Required for cloud providers. Leave empty for local Ollama.")
			.addText((text) => {
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.llmApiKey)
					.onChange(async (value) => {
						this.plugin.settings.llmApiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Type a model name or browse available models from your server.")
			.addText((text) =>
				text
					.setPlaceholder("gemma3:4b")
					.setValue(this.plugin.settings.llmModel)
					.onChange(async (value) => {
						this.plugin.settings.llmModel = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Browse models...")
					.onClick(() => {
						const existing = containerEl.querySelector(".ed-model-picker");
						if (existing) {
							existing.remove();
							return;
						}
						const pickerEl = containerEl.createDiv({ cls: "ed-model-picker" });
						showModelPicker(
							pickerEl,
							this.plugin.settings.llmServerUrl,
							this.plugin.settings.llmApiKey,
							async (modelId: string) => {
								this.plugin.settings.llmModel = modelId;
								await this.plugin.saveSettings();
								pickerEl.remove();
								this.display();
							}
						);
					})
			);

		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("Lower = more deterministic, higher = more creative. (0–1)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.llmTemperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.llmTemperature = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Instructions that shape how the AI responds. Tailored for dictionary lookup chat by default.")
			.addTextArea((text) => {
				text
					.setPlaceholder("You are a helpful Spanish language tutor...")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
				text.inputEl.style.width = "100%";
			});

		containerEl.createEl("h3", { text: "Spanish chat" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "These settings power the dedicated Spanish Chat view for freeform conversation practice and dialogue generation.",
		});

		new Setting(containerEl)
			.setName("Spanish chat system prompt")
			.setDesc("Used by the standalone Spanish Chat view. Tailor it for roleplay, corrections, level-appropriate dialogue, or speaking practice.")
			.addTextArea((text) => {
				text
					.setPlaceholder(DEFAULT_SETTINGS.spanishChatSystemPrompt)
					.setValue(this.plugin.settings.spanishChatSystemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.spanishChatSystemPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 6;
				text.inputEl.style.width = "100%";
			});

		// ── Prompts ──────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Prompts for word lookups" });

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Customize the prompts shown in the chat panel. Use {word} for the current word, {pos} for part of speech, and {defs} for definitions.",
		});

		for (let i = 0; i < 4; i++) {
			new Setting(containerEl)
				.setName(`Suggestion ${i + 1}`)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.chatSuggestions[i])
						.setValue(this.plugin.settings.chatSuggestions[i] || "")
						.onChange(async (value) => {
							this.plugin.settings.chatSuggestions[i] = value;
							await this.plugin.saveSettings();
						})
				);
		}

		containerEl.createEl("h4", { text: "Not-found prompt" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "When a word is not found in the dictionary, an \"Ask AI about this word\" link appears. This prompt is sent to the AI when that link is clicked.",
		});

		new Setting(containerEl)
			.setName("Prompt")
			.setDesc("Use {word} for the searched word, {source} for the detected source language, and {target} for the target language.")
			.addTextArea((text) => {
				text
					.setPlaceholder(DEFAULT_SETTINGS.notFoundPrompt)
					.setValue(this.plugin.settings.notFoundPrompt)
					.onChange(async (value) => {
						this.plugin.settings.notFoundPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.style.width = "100%";
			});

		// ── Display ──────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Display" });

		new Setting(containerEl)
			.setName("Auto-play pronunciation")
			.setDesc("Automatically play audio pronunciation when looking up a Spanish word.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoPlayAudio)
					.onChange(async (value) => {
						this.plugin.settings.autoPlayAudio = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max example sentences")
			.setDesc("Maximum number of example sentences shown per word (1–20).")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxSentences)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxSentences = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Reset ─────────────────────────────────────────────────────

		new Setting(containerEl)
			.setName("Reset chat settings")
			.setDesc("Restore all LLM parameters and prompts to their defaults.")
			.addButton((button) =>
				button
					.setButtonText("Reset to defaults")
					.setClass("mod-warning")
					.onClick(async () => {
						this.plugin.settings.llmServerUrl = DEFAULT_SETTINGS.llmServerUrl;
						this.plugin.settings.llmApiKey = DEFAULT_SETTINGS.llmApiKey;
						this.plugin.settings.llmModel = DEFAULT_SETTINGS.llmModel;
						this.plugin.settings.llmTemperature = DEFAULT_SETTINGS.llmTemperature;
						this.plugin.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
						this.plugin.settings.spanishChatSystemPrompt = DEFAULT_SETTINGS.spanishChatSystemPrompt;
						this.plugin.settings.chatSuggestions = [...DEFAULT_SETTINGS.chatSuggestions];
						this.plugin.settings.notFoundPrompt = DEFAULT_SETTINGS.notFoundPrompt;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Database ──────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Database" });

		const stats = getDatabaseStats();
		if (stats) {
			const statsLines = [
				`🇪🇸 Spanish words: ${stats.esWords.toLocaleString()}`,
				`🇬🇧 English entries: ${stats.enWords.toLocaleString()}`,
				`📖 Definitions: ${stats.definitions.toLocaleString()}`,
				`🔄 Lemmas: ${stats.lemmas.toLocaleString()}`,
				`💬 Sentences: ${stats.sentences.toLocaleString()}`,
				`💾 Database size: ${stats.dbSizeMB} MB`,
			];
			new Setting(containerEl)
				.setName("Dictionary statistics")
				.setDesc(statsLines.join("\n"));
		} else {
			new Setting(containerEl)
				.setName("Dictionary statistics")
				.setDesc("Database not loaded yet. Open the dictionary view first.");
		}

		new Setting(containerEl)
			.setName("Re-download database")
			.setDesc("Delete the local dictionary database and re-download the latest version from GitHub.")
			.addButton((button) => {
				button.setButtonText("Re-download database").setClass("mod-warning").onClick(async () => {
					button.setButtonText("Downloading...");
					button.setDisabled(true);
					try {
						const app = this.app;
						const pluginDir = `.obsidian/plugins/${this.plugin.manifest.id}`;
						await redownloadDatabase(app, pluginDir);
						button.setButtonText("Re-download database");
						button.setDisabled(false);
						new Notice("Dictionary database updated successfully!");
						this.display();
					} catch (err) {
						button.setButtonText("Re-download database");
						button.setDisabled(false);
						const msg = err instanceof Error ? err.message : String(err);
						new Notice(`Failed to re-download database: ${msg}`);
					}
				});
			});
	}
}