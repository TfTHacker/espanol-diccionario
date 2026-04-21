// src/constants.ts — Shared constants for the plugin

// Plugin identification
export const PLUGIN_ID = "espanol-diccionario";
export const VIEW_TYPE_DICTIONARY = "espanol-diccionario-view";
export const VIEW_TYPE_SPANISH_CHAT = "espanol-diccionario-spanish-chat";
export const VIEW_TYPE_TTS_PRACTICE = "espanol-diccionario-tts-practice";
export const VIEW_TYPE_WEB = "espanol-diccionario-web";

// GitHub releases URL for auto-downloading database files
export const GITHUB_RELEASES_BASE = "https://github.com/TfTHacker/espanol-diccionario/releases/latest/download";

// UI timing constants (milliseconds)
export const TYPEAHEAD_DEBOUNCE_MS = 150;
export const SEARCH_DEBOUNCE_MS = 300;
export const MARKDOWN_RENDER_DEBOUNCE_MS = 80;
export const AUDIO_LOAD_TIMEOUT_MS = 8000;
export const TTS_PRACTICE_REPEAT_DELAY_MS = 1200;

// UI limits
export const MAX_TYPEAHEAD_RESULTS = 10;
export const MAX_RECENT_WORDS = 20;
export const MAX_TTS_PRACTICE_HISTORY = 50;
export const MAX_CHAT_PROMPT_HISTORY = 100;
export const MAX_CHAT_MODELS_SHOWN = 50;
export const MAX_ENGLISH_REFS_PER_WORD = 8;

// Chat/streaming
export const OLLAMA_LOCAL_HOSTS = ["localhost:11434", "127.0.0.1:11434"] as const;