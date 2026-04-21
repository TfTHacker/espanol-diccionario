import { FuzzySuggestModal, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import type EspañolDiccionarioPlugin from "../main";
import { playSpanishAudio, splitSpanishTtsText } from "../audio/provider";
import { MAX_TTS_PRACTICE_HISTORY, TTS_PRACTICE_REPEAT_DELAY_MS, VIEW_TYPE_TTS_PRACTICE as VIEW_TYPE_TTS_PRACTICE_CONST } from "../constants";
import {
	getPracticePlaybackText,
	insertImportedText,
	normalizePracticeAutoRepeat,
	normalizePracticeDraft,
	pushPracticeHistoryEntry,
	sanitizePracticeHistory,
	shouldQueuePracticeRepeat,
} from "./tts-practice-state";

export const VIEW_TYPE_TTS_PRACTICE_VIEW = VIEW_TYPE_TTS_PRACTICE_CONST;

export class TtsPracticeView extends ItemView {
	private plugin: EspañolDiccionarioPlugin;
	private currentAudio: HTMLAudioElement | null = null;
	private history: string[] = [];
	private draftSaveTimer: number | null = null;
	private playRequestId = 0;
	private playInFlight = false;
	private autoRepeat = false;
	private repeatTimer: number | null = null;
	private textAreaEl!: HTMLTextAreaElement;
	private historyDropdownEl!: HTMLElement;
	private historyBtnEl!: HTMLButtonElement;
	private playBtnEl!: HTMLButtonElement;
	private stopBtnEl!: HTMLButtonElement;
	private repeatBtnEl!: HTMLButtonElement;
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
		this.autoRepeat = normalizePracticeAutoRepeat(this.plugin.settings.ttsPracticeAutoRepeat);

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

		this.repeatBtnEl = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-repeat-btn", attr: { type: "button", title: "Auto-repeat playback: off" } });
		this.repeatBtnEl.setText("🔁");
		this.repeatBtnEl.addEventListener("click", () => {
			void this.toggleAutoRepeat();
		});
		this.syncAutoRepeatButton();

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

		const insertFileBtn = toolbar.createEl("button", { cls: "ed-nav-btn ed-tts-insert-file-btn", attr: { type: "button", title: "Insert file into reader" } });
		insertFileBtn.setText("📄");
		insertFileBtn.addEventListener("click", () => this.openFilePicker());

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
		this.clearRepeatTimer();
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

		const text = getPracticePlaybackText(
			this.textAreaEl.value,
			this.textAreaEl.selectionStart ?? 0,
			this.textAreaEl.selectionEnd ?? 0,
		);
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
			if (shouldQueuePracticeRepeat(this.autoRepeat, requestId, this.playRequestId, chunkIndex, chunks.length)) {
				this.setStatus("Repeating soon…");
				this.queueRepeat(chunks, requestId);
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
		this.clearRepeatTimer();
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

	private queueRepeat(chunks: string[], requestId: number) {
		this.clearRepeatTimer();
		this.repeatTimer = window.setTimeout(() => {
			this.repeatTimer = null;
			if (!this.autoRepeat || requestId !== this.playRequestId) {
				this.playBtnEl.disabled = false;
				this.stopBtnEl.disabled = true;
				this.setStatus("Playback finished.");
				return;
			}
			this.playInFlight = true;
			void this.playChunks(chunks, requestId, 0);
		}, TTS_PRACTICE_REPEAT_DELAY_MS);
	}

	private clearRepeatTimer() {
		if (this.repeatTimer !== null) {
			window.clearTimeout(this.repeatTimer);
			this.repeatTimer = null;
		}
	}

	private async toggleAutoRepeat() {
		this.autoRepeat = !this.autoRepeat;
		this.plugin.settings.ttsPracticeAutoRepeat = this.autoRepeat;
		this.syncAutoRepeatButton();
		if (!this.autoRepeat && this.repeatTimer !== null) {
			this.clearRepeatTimer();
			if (!this.currentAudio && !this.playInFlight) {
				this.playBtnEl.disabled = false;
				this.stopBtnEl.disabled = true;
				this.setStatus("Playback finished.");
			}
		}
		await this.plugin.saveSettings();
		if (this.autoRepeat) {
			this.setStatus(this.currentAudio || this.repeatTimer !== null || this.playInFlight ? "Auto-repeat enabled." : "Auto-repeat enabled for next playback.");
		} else {
			this.setStatus("Auto-repeat disabled.");
		}
	}

	private syncAutoRepeatButton() {
		this.repeatBtnEl?.classList.toggle("ed-nav-btn-active", this.autoRepeat);
		this.repeatBtnEl?.setAttribute("aria-pressed", this.autoRepeat ? "true" : "false");
		this.repeatBtnEl?.setAttribute("title", this.autoRepeat ? "Auto-repeat playback: on" : "Auto-repeat playback: off");
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

	private openFilePicker() {
		new PracticeFileSuggestModal(this.plugin, async (file) => {
			const content = await this.app.vault.cachedRead(file);
			const nextValue = insertImportedText(
				this.textAreaEl.value,
				content,
				this.textAreaEl.selectionStart ?? this.textAreaEl.value.length,
				this.textAreaEl.selectionEnd ?? this.textAreaEl.value.length,
			);
			this.textAreaEl.value = nextValue;
			await this.persistDraft();
			this.setStatus(`Inserted ${file.path}.`);
			this.focusInput();
		}).open();
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

class PracticeFileSuggestModal extends FuzzySuggestModal<TFile> {
	private plugin: EspañolDiccionarioPlugin;
	private onChoose: (file: TFile) => void | Promise<void>;

	constructor(plugin: EspañolDiccionarioPlugin, onChoose: (file: TFile) => void | Promise<void>) {
		super(plugin.app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a Markdown or text file to insert...");
	}

	getItems(): TFile[] {
		return this.plugin.app.vault.getFiles().filter((file) => ["md", "txt"].includes(file.extension));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		void this.onChoose(file);
	}
}
