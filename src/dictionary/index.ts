// src/dictionary/index.ts — Re-exports for convenience

export { fullLookup, searchDictionary } from "./lookup";
export { initDatabase, isDatabaseReady, closeDatabase } from "./db";
export type { WordEntry, Definition, Sentence, LemmaEntry, DictionaryResult, LookupOptions } from "./data";