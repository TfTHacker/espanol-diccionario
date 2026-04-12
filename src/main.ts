// src/main.ts — Plugin entry, registration, lifecycle

import { Plugin, Platform, Notice, MarkdownView, type ObsidianProtocolData } from "obsidian";
import { EspañolDiccionarioSettingTab, DEFAULT_SETTINGS, type PluginSettings } from "./settings";
import { DictionaryView, VIEW_TYPE_ESPANOL_DICCIONARIO } from "./ui/dictionary-view";
import { WebView, VIEW_TYPE_WEB } from "./ui/web-view";
import { showModelPicker, ModelPickerDialog } from "./ui/model-selector";
import { initDatabase, isDatabaseReady, closeDatabase } from "./dictionary/db";
import { PLUGIN_ID, VIEW_TYPE_DICTIONARY } from "./constants";

export default class EspañolDiccionarioPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the dictionary view
		this.registerView(VIEW_TYPE_ESPANOL_DICCIONARIO, (leaf) => {
			return new DictionaryView(leaf, this);
		});

		// Register the web viewer (desktop only — uses Electron webview)
		if (!Platform.isMobile) {
			this.registerView(VIEW_TYPE_WEB, (leaf) => {
				return new WebView(leaf);
			});
		}

		// Add ribbon icon
		this.addRibbonIcon("languages", "Español Diccionario", () => {
			this.activateView();
		});

		// Add command palette commands
		this.addCommand({
			id: "open-dictionary",
			name: "Open dictionary",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "change-llm-model",
			name: "Change LLM model",
			callback: () => this.openModelPicker(),
		});

		this.addCommand({
			id: "insert-dictionary-link",
			name: "Insert dictionary link",
			callback: () => this.insertDictionaryLink(),
		});

		// URI handler: obsidian://espanol-diccionario?word=casa
		this.registerObsidianProtocolHandler("espanol-diccionario", (params) => this.handleProtocol(params));

		// Settings tab
		this.addSettingTab(new EspañolDiccionarioSettingTab(this.app, this));

		// Initialize database (async, non-blocking)
		this.initDatabaseAsync();
	}

	onunload() {
		closeDatabase();
	}

	async loadSettings() {
		const loaded = await this.loadData();
		if (loaded) {
			this.settings = { ...DEFAULT_SETTINGS };
			for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PluginSettings)[]) {
				if (key in loaded) {
					(this.settings as unknown as Record<string, unknown>)[key] = loaded[key];
				}
			}
			// Ensure chatSuggestions tuple has all 4 entries
			for (let i = 0; i < 4; i++) {
				if (!this.settings.chatSuggestions[i]) {
					this.settings.chatSuggestions[i] = DEFAULT_SETTINGS.chatSuggestions[i];
				}
			}
		} else {
			this.settings = { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Open a model picker dialog (command palette)
	 */
	async openModelPicker() {
		// Create a temporary dialog
		const modal = new ModelPickerDialog(this.app, this);
		modal.open();
	}

	/**
	 * Handle obsidian://espanol-diccionario URIs
	 * Supports: obsidian://espanol-diccionario?word=casa
	 */
	private async handleProtocol(params: ObsidianProtocolData) {
		const word = params.word?.trim();
		if (word) {
			await this.activateViewWithWord(word);
		} else {
			await this.activateView();
		}
	}

	/**
	 * Open or focus the dictionary view and look up a word
	 */
	private async activateViewWithWord(word: string) {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_ESPANOL_DICCIONARIO)[0];

		if (!leaf) {
			const newLeaf = workspace.getLeaf("tab");
			if (newLeaf) {
				await newLeaf.setViewState({
					type: VIEW_TYPE_ESPANOL_DICCIONARIO,
					active: true,
				});
				leaf = newLeaf;
			}
		} else {
			workspace.revealLeaf(leaf);
		}

		if (leaf && leaf.view instanceof DictionaryView) {
			leaf.view.lookupWord(word);
		}
	}

	/**
	 * Insert a dictionary link at the cursor in the active editor
	 */
	private insertDictionaryLink() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return;

		const view = activeLeaf.view;
		if (!(view instanceof MarkdownView)) {
			new Notice("Please open a Markdown file to insert a dictionary link.");
			return;
		}

		const editor = view.editor;
		if (!editor) return;

		const cursor = editor.getCursor();
		const selected = editor.getSelection();
		const word = selected || "";

		if (word) {
			// Insert link for selected word
			const link = `[🔠 ${word}](obsidian://espanol-diccionario?word=${encodeURIComponent(word)})`;
			editor.replaceSelection(link);
		} else {
			// Insert generic dictionary link
			const link = "[🔠 Español Diccionario](obsidian://espanol-diccionario)";
			editor.replaceRange(link, cursor);
		}
	}

	/**
	 * Open or focus the dictionary view
	 */
	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_ESPANOL_DICCIONARIO)[0];

		if (!leaf) {
			// Open in main area (tab)
			const newLeaf = workspace.getLeaf("tab");
			if (newLeaf) {
				await newLeaf.setViewState({
					type: VIEW_TYPE_ESPANOL_DICCIONARIO,
					active: true,
				});
				leaf = newLeaf;
			}
		} else {
			// Reveal and focus the existing leaf
			workspace.revealLeaf(leaf);
		}

		// Focus the search input
		if (leaf && leaf.view instanceof DictionaryView) {
			leaf.view.focusSearch();
		}
	}

	/**
	 * Open a URL in the embedded web viewer leaf
	 */
	async openWebView(url: string, title?: string) {
		const { workspace } = this.app;

		// Reuse existing web view leaf or create a new one
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_WEB)[0];
		if (!leaf) {
			// Open in a new tab
			leaf = workspace.getLeaf("tab");
		}

		await leaf.setViewState({
			type: VIEW_TYPE_WEB,
			state: { url, title: title || "Web View" },
			active: true,
		});

		workspace.revealLeaf(leaf);

		// Load the URL after the view is ready
		if (leaf.view instanceof WebView) {
			leaf.view.loadUrl(url, title);
		}
	}

	/**
	 * Initialize the database asynchronously.
	 * Notifies the view when ready or on error.
	 */
	private async initDatabaseAsync() {
		try {
			const pluginDir = this.getPluginDir();
			await initDatabase(this.app, pluginDir);

			// Notify any open views
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ESPANOL_DICCIONARIO);
			for (const leaf of leaves) {
				if (leaf.view instanceof DictionaryView) {
					leaf.view.notifyDatabaseReady();
				}
			}

		} catch (err) {
			console.error("[espanol-diccionario] Database init failed:", err);

			// Notify any open views of the error
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ESPANOL_DICCIONARIO);
			for (const leaf of leaves) {
				if (leaf.view instanceof DictionaryView) {
					leaf.view.notifyDatabaseError(
						err instanceof Error ? err.message : "Failed to load dictionary database"
					);
				}
			}

			new Notice("Español Diccionario: Failed to load dictionary. See console for details.");
		}
	}

	/**
	 * Get the plugin's data directory path in the vault (relative to vault root)
	 */
	private getPluginDir(): string {
		return `.obsidian/plugins/${PLUGIN_ID}`;
	}
}