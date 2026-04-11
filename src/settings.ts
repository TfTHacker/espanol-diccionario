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
};

export class EspañolDiccionarioSettingTab extends PluginSettingTab {
	plugin: EspañolDiccionarioPlugin;

	constructor(app: App, plugin: EspañolDiccionarioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Español Diccionario Settings" });

		// LLM / Chat settings
		containerEl.createEl("h3", { text: "LLM Chat" });

		new Setting(containerEl)
			.setName("LLM Server URL")
			.setDesc("OpenAI-compatible API endpoint. Default: Ollama Cloud. For local Ollama use http://localhost:11434. For OpenAI use https://api.openai.com/v1.")
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
			.setDesc("Required for cloud providers. Leave empty for local Ollama (no auth). Stored securely in your vault (never published).")
			.addText((text) => {
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.llmApiKey)
					.onChange(async (value) => {
						this.plugin.settings.llmApiKey = value;
						await this.plugin.saveSettings();
					});
				// Make the input a password field to hide the API key
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Click the button to browse available models from your LLM server, or type a model name manually.")
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
						// Toggle the model picker panel
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
			.setDesc("Controls randomness. Lower = more deterministic, higher = more creative. (0–1)")
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
			.setName("System Prompt")
			.setDesc("Custom system prompt for the LLM chat. Tailored for Spanish tutoring.")
			.addTextArea((text) =>
				text
					.setPlaceholder("You are a helpful Spanish language tutor...")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		// Reset LLM settings to defaults
		new Setting(containerEl)
			.setName("Reset LLM settings")
			.setDesc("Restore server URL, API key, model, temperature, and system prompt to their defaults.")
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
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// Audio settings
		containerEl.createEl("h3", { text: "Audio" });

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

		// Display settings
		containerEl.createEl("h3", { text: "Display" });

		new Setting(containerEl)
			.setName("Max example sentences")
			.setDesc("Maximum number of example sentences to display per word (1–20).")
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

		// Database settings
		containerEl.createEl("h3", { text: "Database" });

		// Show database statistics
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
			.setName("Re-download dictionary database")
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