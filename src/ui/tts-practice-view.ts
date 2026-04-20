import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type EspañolDiccionarioPlugin from "../main";
import { playSpanishAudio, splitSpanishTtsText } from "../audio/provider";
import { MAX_TTS_PRACTICE_HISTORY, VIEW_TYPE_TTS_PRACTICE as VIEW_TYPE_TTS_PRACTICE_CONST } from "../constants";
import { normalizePracticeDraft, pushPracticeHistoryEntry, sanitizePracticeHistory } from "./tts-practice-state";

export const VIEW_TYPE_TTS_PRACTICE_VIEW = VIEW_TYPE_TTS_PRACTICE_CONST;

export class TtsPracticeView extends ItemView {
	private plugin: EspañolDiccionarioPlugin;
	private currentAudio: HTMLAudioElement | null = null;
	private history: string[] = [];
	private draftSaveTimer: number | null = null;
	private playRequestId = 0;
	private playInFlight = false;
	private textAreaEl!: HTMLTextAreaElement;
	private historyDropdownEl!: HTMLElement;
	private historyBtnEl!: HTMLButtonElement;
	private playBtnEl!: HTMLButtonElement;
	private stopBtnEl!: HTMLButtonElement;
	private statusEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: EspañolDiccionarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TTS_PRACTICE_VIEW;
	}

	getDisplayText(): string {
		return "Spanish TTS Practice";
	}

	getIcon(): string {
		return "audio-lines";
	}

	async onOpen() {
		this.history = sanitizePracticeHistory(this.plugin.settings.ttsPracticeHistory, MAX_TTS_PRACTICE_HISTORY);
		const draft = normalizePracticeDraft(this.plugin.settings.ttsPracticeDraft);

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("espanol-diccionario", "ed-tts-practice");

		const toolbar = container.createDiv({ cls: "ed-tts-toolbar" });

		this.playBtnEl = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-play-btn", attr: { type: "button", title: "Play Spanish audio" } });
		this.playBtnEl.setText("▶");
		this.playBtnEl.addEventListener("click", () => {
			void this.handlePlay();
		});

		this.stopBtnEl = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-stop-btn", attr: { type: "button", title: "Stop audio" } });
		this.stopBtnEl.setText("■");
		this.stopBtnEl.disabled = true;
		this.stopBtnEl.addEventListener("click", () => this.handleStop("Stopped."));

		this.historyBtnEl = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-history-btn", attr: { type: "button", title: "Practice history" } });
		this.historyBtnEl.setText("🕐");
		this.historyBtnEl.disabled = this.history.length === 0;
		this.historyBtnEl.addEventListener("click", () => this.toggleHistory());

		const clearHistoryBtn = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-clear-history-btn", attr: { type: "button", title: "Clear history" } });
		clearHistoryBtn.setText("🧹");
		clearHistoryBtn.disabled = this.history.length === 0;
		clearHistoryBtn.addEventListener("click", async () => {
			if (this.history.length === 0) return;
			const shouldClear = window.confirm("Clear Spanish TTS practice history?");
			if (!shouldClear) return;
			this.history = [];
			this.plugin.settings.ttsPracticeHistory = [];
			await this.plugin.saveSettings();
			this.renderHistory();
			this.setStatus("History cleared.");
			this.historyBtnEl.disabled = true;
			clearHistoryBtn.disabled = true;
		});

		const clearTextBtn = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-clear-btn", attr: { type: "button", title: "Clear text" } });
		clearTextBtn.setText("✕");
		clearTextBtn.addEventListener("click", () => {
			this.textAreaEl.value = "";
			void this.persistDraft();
			this.setStatus("Text cleared.");
			this.focusInput();
		});

		this.historyDropdownEl = toolbar.createDiv({ cls: "ed-recents ed-tts-history-dropdown ed-hidden" });

		this.textAreaEl = container.createEl("textarea", {
			cls: "ed-tts-textarea",
			attr: {
				placeholder: "Escribe o pega texto en español para escucharlo...",
				spellcheck: "false",
			},
		});
		this.textAreaEl.value = draft;
		this.textAreaEl.addEventListener("input", () => {
			this.scheduleDraftPersist();
		});
		this.textAreaEl.addEventListener("keydown", (evt) => {
			if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
				evt.preventDefault();
				void this.handlePlay();
			}
		});

		this.statusEl = container.createDiv({ cls: "ed-tts-status" });
		container.createDiv({
			cls: "ed-tts-privacy-note",
			text: "Audio uses Google TTS, so entered text is sent to Google for playback.",
		});
		this.setStatus("Ready.");

		container.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement;
			if (!target.closest(".ed-tts-history-dropdown") && !target.closest(".ed-tts-history-btn")) {
				this.hideHistory();
			}
		});

		this.renderHistory();
		this.focusInput();
	}

	async onClose() {
		this.handleStop();
		this.clearDraftSaveTimer();
		await this.persistDraft();
	}

	focusInput() {
		this.textAreaEl?.focus();
	}

	setPracticeText(text: string) {
		if (!this.textAreaEl) return;
		this.textAreaEl.value = text;
		void this.persistDraft();
	}

	private async handlePlay() {
		if (this.playInFlight || this.playBtnEl.disabled) return;

		const text = this.textAreaEl.value.trim();
		if (!text) {
			new Notice("Enter Spanish text to play.");
			this.setStatus("Add some text first.");
			this.focusInput();
			return;
		}

		this.handleStop();
		const requestId = ++this.playRequestId;
		this.playInFlight = true;
		this.playBtnEl.disabled = true;
		this.stopBtnEl.disabled = false;
		this.setStatus("Loading audio…");

		this.history = pushPracticeHistoryEntry(this.history, text, MAX_TTS_PRACTICE_HISTORY);
		this.plugin.settings.ttsPracticeHistory = [...this.history];
		await this.persistDraft();
		this.renderHistory();

		const chunks = splitSpanishTtsText(text);
		if (chunks.length === 0) {
			this.playInFlight = false;
			this.playBtnEl.disabled = false;
			this.stopBtnEl.disabled = true;
			this.setStatus("Add some text first.");
			return;
		}

		await this.playChunks(chunks, requestId);
	}

	private async playChunks(chunks: string[], requestId: number, chunkIndex = 0): Promise<void> {
		if (requestId !== this.playRequestId) return;

		const audioEl = await playSpanishAudio(chunks[chunkIndex]);
		if (requestId !== this.playRequestId) {
			this.playInFlight = false;
			if (audioEl) {
				audioEl.pause();
				audioEl.src = "";
			}
			return;
		}

		this.playInFlight = false;
		if (!audioEl) {
			this.playBtnEl.disabled = false;
			this.stopBtnEl.disabled = true;
			this.setStatus("Audio failed to load.");
			new Notice("Failed to play Spanish audio. Check your internet connection.");
			return;
		}

		this.currentAudio = audioEl;
		const isMultiChunk = chunks.length > 1;
		this.setStatus(isMultiChunk ? `Playing audio… (${chunkIndex + 1}/${chunks.length})` : "Playing audio…");
		this.historyBtnEl.disabled = this.history.length === 0;

		audioEl.addEventListener("ended", () => {
			if (this.currentAudio !== audioEl) return;
			this.currentAudio = null;
			if (chunkIndex < chunks.length - 1) {
				this.playInFlight = true;
				void this.playChunks(chunks, requestId, chunkIndex + 1);
				return;
			}
			this.playBtnEl.disabled = false;
			this.stopBtnEl.disabled = true;
			this.setStatus("Playback finished.");
		}, { once: true });

		audioEl.addEventListener("error", () => {
			if (this.currentAudio !== audioEl) return;
			this.currentAudio = null;
			this.playBtnEl.disabled = false;
			this.stopBtnEl.disabled = true;
			this.setStatus("Audio playback failed.");
		}, { once: true });
	}

	private handleStop(status = "") {
		this.playRequestId++;
		this.playInFlight = false;
		if (this.currentAudio) {
			this.currentAudio.pause();
			this.currentAudio.currentTime = 0;
			this.currentAudio.src = "";
			this.currentAudio.load();
			this.currentAudio = null;
		}
		if (this.playBtnEl) this.playBtnEl.disabled = false;
		if (this.stopBtnEl) this.stopBtnEl.disabled = true;
		if (status) this.setStatus(status);
	}

	private toggleHistory() {
		if (this.historyDropdownEl.classList.contains("ed-hidden")) {
			this.showHistory();
		} else {
			this.hideHistory();
		}
	}

	private showHistory() {
		this.renderHistory();
		this.historyDropdownEl.classList.remove("ed-hidden");
		this.historyBtnEl.classList.add("ed-nav-btn-active");
	}

	private hideHistory() {
		if (!this.historyDropdownEl) return;
		this.historyDropdownEl.classList.add("ed-hidden");
		this.historyBtnEl?.classList.remove("ed-nav-btn-active");
	}

	private renderHistory() {
		if (!this.historyDropdownEl) return;
		this.historyDropdownEl.empty();
		const clearHistoryBtn = this.containerEl.querySelector<HTMLButtonElement>(".ed-tts-clear-history-btn");
		if (clearHistoryBtn) clearHistoryBtn.disabled = this.history.length === 0;
		this.historyBtnEl.disabled = this.history.length === 0;

		if (this.history.length === 0) {
			this.historyDropdownEl.createDiv({ cls: "ed-recents-empty", text: "No practice history yet" });
			return;
		}

		for (const item of this.history) {
			const row = this.historyDropdownEl.createDiv({ cls: "ed-recents-item ed-tts-history-item" });
			row.createSpan({ cls: "ed-recents-word ed-tts-history-text", text: item });
			row.addEventListener("click", () => {
				this.setPracticeText(item);
				this.hideHistory();
				this.setStatus("Loaded text from history.");
				this.focusInput();
			});
		}
	}

	private setStatus(message: string) {
		if (this.statusEl) {
			this.statusEl.setText(message);
		}
	}

	private async persistDraft() {
		this.plugin.settings.ttsPracticeDraft = this.textAreaEl?.value ?? "";
		await this.plugin.saveSettings();
	}

	private scheduleDraftPersist() {
		this.clearDraftSaveTimer();
		this.draftSaveTimer = window.setTimeout(() => {
			this.draftSaveTimer = null;
			void this.persistDraft();
		}, 250);
	}

	private clearDraftSaveTimer() {
		if (this.draftSaveTimer !== null) {
			window.clearTimeout(this.draftSaveTimer);
			this.draftSaveTimer = null;
		}
	}
}
