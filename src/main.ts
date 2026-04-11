// src/main.ts — Plugin entry, registration, lifecycle

import { Notice, Plugin, Platform } from "obsidian";
import { EspañolDiccionarioSettingTab, DEFAULT_SETTINGS, type PluginSettings } from "./settings";
import { DictionaryView, VIEW_TYPE_ESPANOL_DICCIONARIO } from "./ui/dictionary-view";
import { WebView, VIEW_TYPE_WEB } from "./ui/web-view";
import { initDatabase, isDatabaseReady } from "./dictionary/db";

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
		this.addRibbonIcon("book-open", "Español Diccionario", () => {
			this.activateView();
		});

		// Add command palette command
		this.addCommand({
			id: "open-dictionary",
			name: "Open dictionary",
			callback: () => this.activateView(),
		});

		// Settings tab
		this.addSettingTab(new EspañolDiccionarioSettingTab(this.app, this));

		// Initialize database (async, non-blocking)
		this.initDatabaseAsync();
	}

	onunload() {
		// Clean up database
		const { closeDatabase } = require("./dictionary/db");
		closeDatabase();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

			new Notice("Español Diccionario: Dictionary loaded");
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
		return ".obsidian/plugins/espanol-diccionario";
	}
}