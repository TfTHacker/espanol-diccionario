// src/ui/model-selector.ts — Model selector for settings & command palette

import { App, Modal, Notice, requestUrl } from "obsidian";
import type EspañolDiccionarioPlugin from "../main";
import type { PluginSettings } from "../settings";

interface ModelInfo {
	id: string;
	owned_by?: string;
}

/**
 * Fetch available models from the LLM server and show a picker UI
 * inside the given container element.
 */
export async function showModelPicker(
	container: HTMLElement,
	serverUrl: string,
	apiKey: string,
	onChoose: (modelId: string) => void
): Promise<void> {
	// Show loading state
	container.empty();
	container.createEl("h4", { text: "Loading models..." });

	try {
		const models = await fetchModels(serverUrl, apiKey);

		if (models.length === 0) {
			container.empty();
			container.createEl("h4", { text: "No models found" });
			container.createEl("p", {
				text: "Check your server URL and API key in the settings above.",
				cls: "ed-model-empty",
			});
			return;
		}

		renderModelList(container, models, onChoose);
	} catch (err) {
		container.empty();
		container.createEl("h4", { text: "Error fetching models" });
		container.createEl("p", {
			text: err instanceof Error ? err.message : String(err),
			cls: "ed-model-error",
		});
	}
}

function renderModelList(
	container: HTMLElement,
	models: ModelInfo[],
	onChoose: (modelId: string) => void
): void {
	container.empty();
	container.createEl("h4", { text: `Select a model (${models.length} available)` });

	// Filter input
	const filterInput = container.createEl("input", {
		type: "text",
		cls: "ed-model-filter",
		attr: { placeholder: "Filter models...", autofocus: "true" },
	});

	// Model list
	const listEl = container.createDiv({ cls: "ed-model-list" });

	function renderFiltered() {
		const query = filterInput.value.toLowerCase().trim();
		listEl.empty();

		const filtered = query
			? models.filter(m => m.id.toLowerCase().includes(query))
			: models;

		if (filtered.length === 0) {
			listEl.createDiv({ cls: "ed-model-empty", text: "No models match your filter." });
			return;
		}

		// Show max ${MAX_CHAT_MODELS_SHOWN} models for performance
		const shown = filtered.slice(0, MAX_CHAT_MODELS_SHOWN);

		for (const model of shown) {
			const item = listEl.createDiv({ cls: "ed-model-item" });
			item.createDiv({ cls: "ed-model-name", text: model.id });
			if (model.owned_by) {
				const meta = item.createDiv({ cls: "ed-model-meta" });
				meta.createSpan({ cls: "ed-model-provider", text: model.owned_by });
			}
			item.addEventListener("click", () => {
				onChoose(model.id);
			});
		}

		if (filtered.length > MAX_CHAT_MODELS_SHOWN) {
			listEl.createDiv({ cls: "ed-model-more", text: `...and ${filtered.length - MAX_CHAT_MODELS_SHOWN} more. Type to narrow results.` });
		}
	}

	// Initial render
	renderFiltered();

	// Filter on input
	filterInput.addEventListener("input", renderFiltered);

	// Focus the filter
	setTimeout(() => filterInput.focus(), 100);
}

/**
 * Fetch available models from the LLM server.
 */
import type { DictionaryView } from "./dictionary-view";
import { OLLAMA_LOCAL_HOSTS, MAX_CHAT_MODELS_SHOWN } from "../constants";

async function fetchModels(serverUrl: string, apiKey: string): Promise<ModelInfo[]> {
	// Build the models URL
	let url = serverUrl.replace(/\/+$/, "");
	// Strip API subpaths to get base URL
	url = url.replace(/\/v1\/chat\/completions$/, "").replace(/\/api\/chat$/, "").replace(/\/chat\/completions$/, "");

	const isLocalOllama = OLLAMA_LOCAL_HOSTS.some(h => url.includes(h));
	const modelsUrl = isLocalOllama
		? `${url}/api/tags`
		: url.includes("/v1")
			? `${url}/models`
			: `${url}/v1/models`;

	const headers: Record<string, string> = {};
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`;
	}

	const response = await requestUrl({
		url: modelsUrl,
		method: "GET",
		headers,
	});

	const data = response.json;
	let models: ModelInfo[] = [];

	if (isLocalOllama && data.models) {
		// Local Ollama /api/tags format
		models = data.models.map((m: any) => ({
			id: m.name || m.model,
			owned_by: "ollama",
		}));
	} else if (data.data && Array.isArray(data.data)) {
		// OpenAI /v1/models format
		models = data.data.map((m: any) => ({
			id: m.id,
			owned_by: m.owned_by || "",
		}));
	}

	models.sort((a, b) => a.id.localeCompare(b.id));
	return models;
}

/**
 * Modal dialog for picking a model (used from command palette).
 */
export class ModelPickerDialog extends Modal {
	private plugin: EspañolDiccionarioPlugin;

	constructor(app: App, plugin: EspañolDiccionarioPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ed-model-picker-modal");

		contentEl.createEl("h2", { text: "Select LLM Model" });

		const pickerEl = contentEl.createDiv({ cls: "ed-model-picker" });

		showModelPicker(
			pickerEl,
			this.plugin.settings.llmServerUrl,
			this.plugin.settings.llmApiKey,
			async (modelId: string) => {
				this.plugin.settings.llmModel = modelId;
				await this.plugin.saveSettings();
				this.close();

				// Notify any open dictionary views to update model label
				const leaves = this.app.workspace.getLeavesOfType("espanol-diccionario-view");
				for (const leaf of leaves) {
					if (leaf.view && typeof (leaf.view as DictionaryView).updateChatModelLabel === "function") {
						(leaf.view as DictionaryView).updateChatModelLabel();
					}
				}
			}
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}