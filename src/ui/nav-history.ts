// src/ui/nav-history.ts — Navigation history management for DictionaryView

import { MAX_RECENT_WORDS } from "../constants";

/**
 * Manages back/forward/recent navigation for the dictionary view.
 * Decoupled from the view to keep DictionaryView slim.
 */
export class NavHistory {
	private history: string[] = [];
	private index = -1;
	private navButtons!: { back: HTMLButtonElement; forward: HTMLButtonElement };
	private recentsBtn!: HTMLButtonElement;
	private recentsDropdown!: HTMLElement;
	private currentWord = "";

	// Callback to trigger a lookup (without pushing to history again)
	private onNavigate: (word: string) => void;
	private onChange?: (history: string[]) => void;

	constructor(onNavigate: (word: string) => void, onChange?: (history: string[]) => void) {
		this.onNavigate = onNavigate;
		this.onChange = onChange;
	}

	/** Initialize UI element references (called once from onOpen) */
	init(
		navButtons: { back: HTMLButtonElement; forward: HTMLButtonElement },
		recentsBtn: HTMLButtonElement,
		recentsDropdown: HTMLElement,
	) {
		this.navButtons = navButtons;
		this.recentsBtn = recentsBtn;
		this.recentsDropdown = recentsDropdown;

		this.navButtons.back.addEventListener("click", () => this.navigateBack());
		this.navButtons.forward.addEventListener("click", () => this.navigateForward());
		this.recentsBtn.addEventListener("click", () => this.toggleRecents());
	}

	/** Load persisted history from plugin settings */
	loadFromSettings(savedHistory: string[]) {
		if (Array.isArray(savedHistory) && savedHistory.length > 0) {
			this.history = [...savedHistory];
			this.index = savedHistory.length - 1;
			this.updateNavButtons();
		}
	}

	private notifyChange() {
		this.onChange?.([...this.history]);
	}

	/** Update the "current word" tracker (for recents highlighting) */
	setCurrentWord(word: string) {
		this.currentWord = word;
	}

	/** Push a word onto the navigation stack */
	push(word: string) {
		// Truncate any forward history
		if (this.index < this.history.length - 1) {
			this.history = this.history.slice(0, this.index + 1);
		}

		// Don't push duplicate of current entry
		if (this.history.length > 0 && this.history[this.history.length - 1] === word) {
			return;
		}

		this.history.push(word);
		this.index = this.history.length - 1;
		this.updateNavButtons();
		this.notifyChange();
	}

	navigateBack() {
		if (this.index <= 0) return;
		this.index--;
		const word = this.history[this.index];
		this.onNavigate(word);
		this.updateNavButtons();
	}

	navigateForward() {
		if (this.index >= this.history.length - 1) return;
		this.index++;
		const word = this.history[this.index];
		this.onNavigate(word);
		this.updateNavButtons();
	}

	private updateNavButtons() {
		if (!this.navButtons) return;
		this.navButtons.back.disabled = this.index <= 0;
		this.navButtons.forward.disabled = this.index >= this.history.length - 1;
		this.recentsBtn.disabled = this.history.length === 0;
	}

	// ============================================================
	// Recents dropdown
	// ============================================================

	toggleRecents() {
		if (this.recentsDropdown.classList.contains("ed-hidden")) {
			this.showRecents();
		} else {
			this.hideRecents();
		}
	}

	showRecents(onSelect: (word: string) => void = this.onNavigate) {
		this.recentsDropdown.empty();
		// Show last N words, most recent first
		const recent = this.history.slice(-MAX_RECENT_WORDS).reverse();
		if (recent.length === 0) {
			this.recentsDropdown.createDiv({ cls: "ed-recents-empty", text: "No recent words" });
		} else {
			for (const word of recent) {
				const item = this.recentsDropdown.createDiv({ cls: "ed-recents-item" });
				item.createSpan({ cls: "ed-recents-word", text: word });
				// Highlight current word
				if (word === this.currentWord) {
					item.classList.add("ed-recents-current");
				}
				item.addEventListener("click", () => {
					this.hideRecents();
					onSelect(word);
				});
			}
		}
		this.recentsDropdown.classList.remove("ed-hidden");
	}

	hideRecents() {
		if (this.recentsDropdown) {
			this.recentsDropdown.classList.add("ed-hidden");
		}
	}
}