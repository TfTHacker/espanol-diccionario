// src/ui/search-controller.ts — Typeahead and search UI logic for DictionaryView

import { isDatabaseReady } from "../dictionary/db";
import { searchDictionary } from "../dictionary/lookup";
import { TYPEAHEAD_DEBOUNCE_MS, SEARCH_DEBOUNCE_MS, MAX_TYPEAHEAD_RESULTS } from "../constants";

export interface TypeaheadItem {
	word: string;
	pos: string;
	lang: string;
}

/**
 * Manages typeahead/autocomplete for the dictionary search input.
 * Decoupled from the view to keep DictionaryView slim.
 */
export class SearchController {
	private searchInput!: HTMLInputElement;
	private typeaheadList!: HTMLElement;
	private typeaheadTimeout: ReturnType<typeof setTimeout> | null = null;
	private typeaheadIndex = -1;
	private typeaheadItems: TypeaheadItem[] = [];
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Callbacks
	private onSearch: (word: string) => void;

	constructor(onSearch: (word: string) => void) {
		this.onSearch = onSearch;
	}

	/** Initialize UI elements and event handlers (called once from onOpen) */
	init(searchInput: HTMLInputElement, typeaheadList: HTMLElement, searchForm: HTMLFormElement) {
		this.searchInput = searchInput;
		this.typeaheadList = typeaheadList;

		searchForm.addEventListener("submit", (evt) => {
			evt.preventDefault();
			this.onSearch(this.searchInput.value.trim());
			this.hideTypeahead();
		});

		// Keyboard navigation for typeahead
		this.searchInput.addEventListener("keydown", (evt) => {
			if (!this.typeaheadList.classList.contains("ed-hidden")) {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					this.navigateTypeahead(1);
					return;
				}
				if (evt.key === "ArrowUp") {
					evt.preventDefault();
					this.navigateTypeahead(-1);
					return;
				}
				if (evt.key === "Enter" && this.typeaheadIndex >= 0) {
					evt.preventDefault();
					this.selectTypeaheadItem(this.typeaheadIndex);
					return;
				}
				if (evt.key === "Escape") {
					this.hideTypeahead();
					return;
				}
			}
		});

		// Hide typeahead when clicking outside
		this.searchInput.addEventListener("blur", () => {
			setTimeout(() => this.hideTypeahead(), 200);
		});

		// Typeahead / autocomplete on input
		this.searchInput.addEventListener("input", () => {
			if (this.searchTimeout) clearTimeout(this.searchTimeout);
			this.searchTimeout = setTimeout(() => this.onSearch(this.searchInput.value.trim()), SEARCH_DEBOUNCE_MS);
			this.updateTypeahead();
		});
	}

	/** Set the search input value (e.g., from navigation or word click) */
	setSearchText(word: string) {
		this.searchInput.value = word;
	}

	/** Focus the search input */
	focus() {
		if (this.searchInput) {
			this.searchInput.focus();
		}
	}

	/** Trigger an immediate search (debounced) */
	triggerSearch() {
		if (this.searchTimeout) clearTimeout(this.searchTimeout);
		this.searchTimeout = setTimeout(() => this.onSearch(this.searchInput.value.trim()), 0);
	}

	/** Clean up pending timeouts */
	cleanup() {
		if (this.searchTimeout) clearTimeout(this.searchTimeout);
		if (this.typeaheadTimeout) clearTimeout(this.typeaheadTimeout);
	}

	// ============================================================
	// Typeahead / autocomplete
	// ============================================================

	private updateTypeahead() {
		if (this.typeaheadTimeout) clearTimeout(this.typeaheadTimeout);

		const text = this.searchInput.value.trim();
		if (text.length < 2) {
			this.hideTypeahead();
			return;
		}

		// Debounce: wait before querying
		this.typeaheadTimeout = setTimeout(() => {
			if (!isDatabaseReady()) return;

			const results = searchDictionary(text, undefined, MAX_TYPEAHEAD_RESULTS);
			// Deduplicate by word+pos
			const seen = new Set<string>();
			const unique = results.filter(w => {
				const key = `${w.word}|${w.pos}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
			if (unique.length === 0) {
				this.hideTypeahead();
				return;
			}

			this.typeaheadItems = unique.map(w => ({ word: w.word, pos: w.pos || "", lang: w.lang }));
			this.typeaheadIndex = -1;

			this.typeaheadList.empty();
			for (let i = 0; i < this.typeaheadItems.length; i++) {
				const item = this.typeaheadItems[i];
				const div = this.typeaheadList.createDiv({ cls: "ed-typeahead-item" });
				div.createSpan({ cls: "ed-typeahead-word", text: item.word });

				const meta = div.createSpan({ cls: "ed-typeahead-meta" });
				if (item.pos) meta.createSpan({ cls: "ed-typeahead-pos", text: item.pos });
				meta.createSpan({ cls: `ed-typeahead-flag ed-lang-${item.lang}` });

				div.addEventListener("mousedown", (evt) => {
					evt.preventDefault();
					this.selectTypeaheadItem(i);
				});
			}

			this.typeaheadList.classList.remove("ed-hidden");
		}, TYPEAHEAD_DEBOUNCE_MS);
	}

	private navigateTypeahead(direction: number) {
		const items = this.typeaheadList.querySelectorAll(".ed-typeahead-item");
		if (items.length === 0) return;

		// Remove highlight from current
		if (this.typeaheadIndex >= 0 && this.typeaheadIndex < items.length) {
			items[this.typeaheadIndex].classList.remove("ed-typeahead-active");
		}

		// Move index
		this.typeaheadIndex += direction;
		if (this.typeaheadIndex < 0) this.typeaheadIndex = items.length - 1;
		if (this.typeaheadIndex >= items.length) this.typeaheadIndex = 0;

		// Apply highlight
		items[this.typeaheadIndex].classList.add("ed-typeahead-active");

		// Update input value preview
		const item = this.typeaheadItems[this.typeaheadIndex];
		if (item) {
			this.searchInput.value = item.word;
		}
	}

	private selectTypeaheadItem(index: number) {
		const item = this.typeaheadItems[index];
		if (!item) return;

		this.searchInput.value = item.word;
		this.hideTypeahead();
		this.onSearch(item.word);
	}

	hideTypeahead() {
		if (this.typeaheadList) {
			this.typeaheadList.classList.add("ed-hidden");
		}
		this.typeaheadIndex = -1;
		this.typeaheadItems = [];
	}
}