// src/main.ts — Plugin entry, registration, lifecycle

import { Plugin, Platform, Notice, MarkdownView, type ObsidianProtocolData } from "obsidian";
import { EspañolDiccionarioSettingTab, normalizeSettings, cloneDefaultSettings, type PluginSettings } from "./settings";
import { DictionaryView, VIEW_TYPE_ESPANOL_DICCIONARIO } from "./ui/dictionary-view";
import { shouldAutoFocusDictionarySearch } from "./ui/dictionary-focus-state";
import { SpanishChatView } from "./ui/spanish-chat-view";
import { TtsPracticeView, VIEW_TYPE_TTS_PRACTICE_VIEW } from "./ui/tts-practice-view";
import { WebView, VIEW_TYPE_WEB } from "./ui/web-view";
import { ModelPickerDialog } from "./ui/model-selector";
import { initDatabase, closeDatabase } from "./dictionary/db";
import { PLUGIN_ID, VIEW_TYPE_SPANISH_CHAT } from "./constants";

export default class EspañolDiccionarioPlugin extends Plugin {
	settings: PluginSettings = cloneDefaultSettings();

	async onload() {
		await this.loadSettings();

		// Register the dictionary view
		this.registerView(VIEW_TYPE_ESPANOL_DICCIONARIO, (leaf) => {
			return new DictionaryView(leaf, this);
		});

		this.registerView(VIEW_TYPE_SPANISH_CHAT, (leaf) => {
			return new SpanishChatView(leaf, this);
		});

		this.registerView(VIEW_TYPE_TTS_PRACTICE_VIEW, (leaf) => {
			return new TtsPracticeView(leaf, this);
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
			id: "open-spanish-chat",
			name: "Open Spanish chat",
			callback: () => this.activateSpanishChatView(),
		});

		this.addCommand({
			id: "open-tts-practice",
			name: "Open Spanish TTS practice",
			callback: () => this.activateTtsPracticeView(),
		});

		this.addCommand({
			id: "send-selection-to-tts-practice",
			name: "Send selected text to Spanish TTS practice",
			callback: () => void this.sendSelectionToTtsPractice(),
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
		this.settings = normalizeSettings(await this.loadData());
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

		// Focus the search input on desktop only. On mobile, opening the view
		// should not immediately pop the software keyboard.
		if (leaf && leaf.view instanceof DictionaryView && shouldAutoFocusDictionarySearch(Platform.isMobile)) {
			leaf.view.focusSearch();
		}
	}

	async activateSpanishChatView(initialPrompt?: string) {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_SPANISH_CHAT)[0];

		if (!leaf) {
			const newLeaf = workspace.getLeaf("tab");
			if (newLeaf) {
				await newLeaf.setViewState({
					type: VIEW_TYPE_SPANISH_CHAT,
					active: true,
				});
				leaf = newLeaf;
			}
		} else {
			workspace.revealLeaf(leaf);
		}

		if (leaf && leaf.view instanceof SpanishChatView) {
			if (typeof initialPrompt === "string") {
				leaf.view.setDraftPrompt(initialPrompt);
			}
			leaf.view.focusInput();
		}
	}

	async activateTtsPracticeView(initialText?: string) {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TTS_PRACTICE_VIEW)[0];

		if (!leaf) {
			const newLeaf = workspace.getLeaf("tab");
			if (newLeaf) {
				await newLeaf.setViewState({
					type: VIEW_TYPE_TTS_PRACTICE_VIEW,
					active: true,
				});
				leaf = newLeaf;
			}
		} else {
			workspace.revealLeaf(leaf);
		}

		if (leaf && leaf.view instanceof TtsPracticeView) {
			if (typeof initialText === "string") {
				leaf.view.setPracticeText(initialText);
			}
			leaf.view.focusInput();
		}
	}

	private async sendSelectionToTtsPractice() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) {
			new Notice("Open a Markdown file and select text first.");
			return;
		}

		const view = activeLeaf.view;
		if (!(view instanceof MarkdownView)) {
			new Notice("Open a Markdown file and select text first.");
			return;
		}

		const selected = view.editor?.getSelection()?.trim() ?? "";
		if (!selected) {
			new Notice("Select some text first.");
			return;
		}

		await this.activateTtsPracticeView(selected);
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