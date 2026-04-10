// src/dictionary/data.ts — Data model types & interfaces

export interface WordEntry {
	id: number;
	word: string;
	lang: "es" | "en";
	pos: string | null;
	frequency: number | null;
	ipa: string | null;
}

export interface Definition {
	id: number;
	wordId: number;
	senseNum: number;
	definition: string;
	tags: string | null; // JSON array
	context: string | null;
}

export interface Sentence {
	id: number;
	wordId: number;
	sentenceEs: string | null;
	sentenceEn: string | null;
	source: string;
}

export interface LemmaEntry {
	inflected: string;
	lemma: string;
	pos: string | null;
	lang: string;
}

export interface DictionaryResult {
	word: WordEntry;
	definitions: Definition[];
	sentences: Sentence[];
	/** If the user searched a conjugated/inflected form, this is the lemma it resolved to */
	resolvedFrom?: string;
}

export interface LookupOptions {
	/** Max example sentences to return */
	maxSentences?: number;
	/** Language hint: 'es', 'en', or undefined for auto-detect */
	langHint?: "es" | "en";
}