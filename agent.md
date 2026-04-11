# agent.md — Español Diccionario Obsidian Plugin

> **Loaded at start of every session.** Contains project context, architecture, and key decisions.

---

## Project Overview

**Plugin ID:** `espanol-diccionario`
**Repo:** `TfTHacker/espanol-diccionario` on GitHub
**Goal:** Obsidian plugin for learning Castilian (Spain) Spanish with offline dictionary, audio, and LLM chat.

---

## Architecture & File Map

```
src/
├── main.ts                    # Plugin entry (170 lines): registration, DB init, view lifecycle
├── settings.ts               # Settings tab & PluginSettings (270 lines)
├── dictionary/
│   ├── data.ts                # Type interfaces (WordEntry, Definition, Sentence, etc.)
│   ├── db.ts                  # SQLite via sql.js WASM, auto-download, queries (363 lines)
│   ├── lookup.ts              # fullLookup(), searchDictionary() — core search (60 lines)
│   └── (removed: index.ts)   # DEAD — deleted, was unused barrel export
├── audio/
│   └── provider.ts            # Google TTS audio playback (es-ES locale only)
├── chat/
│   ├── provider.ts            # sendChatMessage(), streamChatMessage() — OpenAI-compat API (310 lines)
│   └── prompts.ts             # DEFAULT_SYSTEM_PROMPT constant only
└── ui/
    ├── dictionary-view.ts     # Main view (910 lines): search, nav, chat, suggestions, typeahead
    ├── result-renderer.ts     # renderResult(), renderNotFound(), etc. — HTML generation (276 lines)
    ├── model-selector.ts      # showModelPicker() + ModelPickerDialog (155 lines)
    └── web-view.ts            # Electron <webview> for external links (desktop only, 115 lines)
```

**Database files** (auto-downloaded from GitHub Releases):
- `dictionary.db` — 172MB SQLite with 284K ES words, 25K EN words, 388K definitions, 1.7M lemmas
- `sql-wasm.wasm` — sql.js WASM binary

**Build:** `node esbuild.config.mjs production` → `main.js` + `styles.css`
**Deploy:** Copy to `.obsidian/plugins/espanol-diccionario/`, then `obsidian plugin:reload`

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| `sql.js` (not `wa-sqlite`) | Simpler WASM, proven in browser webviews, loads entire DB into memory |
| Google TTS only (no Wikimedia) | Wikimedia audio resolution removed — simpler, just works |
| `requestUrl` for LLM calls | `fetch()` fails in Obsidian renderer for cross-origin URLs (CORS). `requestUrl` is Obsidian's built-in that handles this |
| Ollama Cloud URL: `https://ollama.com` | NOT `api.ollama.com` (301 redirects, strips auth headers) |
| Default model: `gemma3:4b` | Available on Ollama Cloud; `llama3` is not |
| Streaming only for local Ollama | `fetch()` streaming works for localhost, fails for cloud (CORS). Cloud always uses `requestUrl` (non-streaming) |
| Static Obsidian imports | Dynamic `import("obsidian")` crashes on Mac. Must use static `import { requestUrl }` |
| Chat uses `MarkdownRenderer.render()` | LLM returns markdown — rendered with Obsidian's built-in renderer |
| External links: `<webview>` on desktop | Electron `<webview>` tag for in-Obsidian browsing; `window.open()` on mobile |
| `navHistory` in PluginSettings | Previously stored via separate `loadData()`/`saveData()` which got overwritten by `saveSettings()` |

---

## PluginSettings Schema

```typescript
{
  llmServerUrl: string;         // Default: "https://ollama.com"
  llmApiKey: string;            // Optional, for cloud providers
  llmModel: string;             // Default: "gemma3:4b"
  llmTemperature: number;      // Default: 0.7
  systemPrompt: string;         // Spanish tutor system prompt
  maxSentences: number;         // Default: 5
  autoPlayAudio: boolean;       // Default: false
  navHistory: string[];         // Word navigation history
  chatPromptHistory: string[];  // Chat input history (up to 100)
  chatSuggestions: [string, string, string, string]; // 4 prompt templates using {word}, {pos}, {defs}
}
```

---

## UI Layout

```
┌──────────────────────────────────────┐
│ ← → 🕐 💬 [___Search a word___] 🔍 │  ← Nav + Chat toggle
│                                      │
│  ┌─ RESULT AREA ───────────────────┐ │
│  │ casa  📢  noun                   │ │
│  │ IPA: /ˈka.sa/                    │ │
│  │ 1. house, home                    │ │
│  │ 2. household, household affairs   │ │
│  │ [WR] [RAE] [SD] [Li] [RC]        │ │
│  │ • La casa es grande. = The house │ │
│  └──────────────────────────────────┘ │
│  Ask: Tell me more · Examples · ? · ? │  ← Suggestion links
│                                      │
│  ┌─ CHAT (toggled by 💬) ──────────┐ │
│  │ Model: gemma3:4b · ollama.com  🗑│ │
│  │ You: Tell me more about casa     │ │
│  │ Bot: Casa means house...         │ │
│  │                                  │ │
│  │ [Ask...______________] [🕐][Send]│ │
│  └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- **Navigation:** ←/→ back/forward, 🕐 recent words dropdown, 💬 chat toggle
- **External links:** Color-coded badges (WR=blue, RAE=red, SD=green, Li=orange, RC=purple)
- **Suggestion links:** Below definition, use `{word}/{pos}/{defs}` templates, open chat and send
- **Chat:** 50vh height when visible, markdown rendered, prompt history (🕐 up/down), model label
- **Model picker:** Command palette or Settings → Browse models, fetches from `/v1/models`

---

## Dead Code Removed

- `src/dictionary/index.ts` — Barrel export, never imported by anything
- `src/chat/prompts.ts` — `getSystemPrompt()`, `wordContextPrompt()`, `grammarQuestionPrompt()` were all unused. Only `DEFAULT_SYSTEM_PROMPT` export remains
- `src/audio/cache.ts` — Removed earlier (Wikimedia audio caching)
- `src/dictionary/lemma.ts` — Was referenced in build script only, not in plugin code

---

## Known Limitations

- **WordReference not available:** Proprietary, no API, robots.txt blocks scraping
- **172MB DB on mobile:** May be slow to load; no lazy loading yet
- **Cloud LLM: no streaming:** `requestUrl` is non-streaming; only local Ollama gets real-time token display
- **No conjugation tables:** Would need additional data source (verbecc)