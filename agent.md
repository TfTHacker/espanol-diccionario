# agent.md — Español Diccionario Obsidian Plugin

> **This file is loaded at the start of every session for this project.**
> It contains project context, resource references, coding standards, and tooling.

---

## Project Overview

**Name:** Español Diccionario
**Plugin ID:** `espanol-diccionario`
**Goal:** An Obsidian plugin for learning **Spain (Castilian) Spanish**, featuring:
- **Bidirectional:** English → Spanish AND Spanish → English lookups
- **Offline core:** Type a word → see definition, IPA, part of speech, example sentences
- **Auto-downloads data:** Database and WASM files are automatically downloaded from GitHub Releases on first launch (no manual install needed; Obsidian Sync doesn't sync these files so the plugin fetches them fresh on each device)
- **Online features:** Spanish audio pronunciation (Wikimedia Commons priority, Google TTS fallback — no English audio needed), LLM chat integration (Ollama or cloud providers) for grammar questions and more examples
- **UI:** Single tab/view opened via ribbon icon or command palette — clean, simple design
- **Mobile support:** Must work on Obsidian mobile (iOS + Android)

---

## ⚠️ Security & Privacy Rules

**This repo will be published to GitHub. NEVER store:**
- API keys (Ollama, Google, or any other service)
- Local system paths, usernames, or machine configuration
- Vault-specific paths or file contents
- Any personally identifiable information
- Obsidian CLI connection details

**Rules for handling secrets:**
- All secrets go in `.env` files, which must be listed in `.gitignore`
- Plugin settings that contain sensitive values (like API keys) are stored at runtime via Obsidian's `loadData()`/`saveData()` — they persist in the vault's `.obsidian/plugins/espanol-diccionario/data.json`, which is local and never committed
- Build scripts read credentials from environment variables only, never hardcoded
- Example `.env.example` files may be committed with placeholder values
- Obsidian CLI connection info (socket path, desktop user, vault name) goes in `.local/obsidian-connection.md` — gitignored, never published

---

## Repository Setup

- **Basis:** [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) — use as scaffold, then strip sample elements
- **Plugin ID:** `espanol-diccionario`
- **Must follow:** [Obsidian Plugin Submission Guidelines](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- **Docs:** [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- **Repo must be GitHub-ready:** proper README, LICENSE, manifest.json, versions.json, .gitignore

### Plugin file structure
```
espanol-diccionario/
├── manifest.json
├── versions.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── .gitignore                  # Must include .env, .env.*, data.json
├── .env.example                # Placeholder secrets template (committed)
├── .env                        # Actual secrets (NEVER committed)
├── src/
│   ├── main.ts                 # Plugin entry, registration, lifecycle
│   ├── settings.ts             # Settings tab & defaults
│   ├── dictionary/
│   │   ├── lookup.ts           # Dictionary search & data access (EN↔ES bidirectional)
│   │   ├── data.ts             # Data model types & interfaces
│   │   └── lemma.ts            # Lemmatization (conjugated form → lemma)
│   ├── audio/
│   │   ├── provider.ts         # Audio resolution & playback (Spanish only)
│   │   └── cache.ts            # Audio file caching in vault
│   ├── chat/
│   │   ├── provider.ts         # OpenAI-compatible chat API integration
│   │   └── prompts.ts          # System prompt & message templates
│   └── ui/
│       ├── dictionary-view.ts  # Main dictionary tab/view
│       └── result-renderer.ts  # Rendering dictionary results to HTML
├── scripts/
│   └── build-db.ts             # Database build pipeline (separate process)
└── data/
    └── dictionary.db           # Built database file (shipped or downloaded)
```

---

## Two Separate Build Processes

### 1. Code Build (fast, frequent)
Standard Obsidian plugin build via esbuild. Produces `main.js` + `styles.css`.
```bash
npm run build          # or npm run dev for watch mode
```
This is what you run during normal development. Does NOT rebuild the database.

### 2. Database Build (slow, infrequent)
A standalone Node.js script that downloads raw data sources and processes them into `data/dictionary.db`.
```bash
npm run build:db       # runs scripts/build-db.ts with Node.js
```
**This is run separately and rarely** — only when:
- The raw data sources are updated (monthly Wiktionary dumps)
- The database schema changes
- We want to add more words or data fields

The resulting `data/dictionary.db` file is committed to the repo as a release asset, or downloaded by the plugin on first run. It is NOT regenerated on every code build.

---

## Offline Dictionary Storage

### Format: SQLite via wa-sqlite (WebAssembly)

**Why wa-sqlite over sql.js:**
- **Mobile compatibility** is the primary reason. Obsidian mobile runs in a WebView (WKWebView on iOS, Chromium WebView on Android) — no Node.js, no Electron, no native binaries.
- `better-sqlite3` requires native Node.js bindings → ❌ no mobile
- `sql.js` is WASM-based and browser-compatible → ✅ works on mobile, but lacks async VFS and persistent storage
- `wa-sqlite` is WASM-based with async API + pluggable VFS → ✅ works on mobile AND supports memory-based VFS for loading `.db` files from the vault → **best choice**
- Verified working in production: [SQLSeal](https://github.com/h-sphere/sql-seal) ⭐143 uses `wa-sqlite` with `isDesktopOnly: false` — confirmed mobile-compatible

**How it works at runtime:**

1. On first launch, the plugin checks for `dictionary.db` and `sql-wasm.wasm` in the plugin directory
2. If missing, they are automatically downloaded from the GitHub Releases URL
3. Files are stored locally in the vault's `.obsidian/plugins/espanol-diccionario/` directory
4. On subsequent launches, the local files are used directly (no re-download)
5. This approach works across all devices (desktop + mobile) and avoids Obsidian Sync limitations

**Database location at runtime:**
```
<vault>/.obsidian/plugins/espanol-diccionario/dictionary.db
<vault>/.obsidian/plugins/espanol-diccionario/sql-wasm.wasm
```

### Database schema

```sql
-- Main word entries (both ES and EN)
CREATE TABLE words (
    id          INTEGER PRIMARY KEY,
    word        TEXT NOT NULL,
    lang        TEXT NOT NULL,           -- 'es' or 'en'
    pos         TEXT,                    -- noun, verb, adj, etc.
    frequency   INTEGER,                -- rank from frequency list
    ipa         TEXT                     -- IPA pronunciation string
);
CREATE INDEX idx_word_lang ON words(word, lang);
CREATE INDEX idx_word_freq ON words(word, frequency);

-- English glosses/definitions for Spanish words, and vice versa
CREATE TABLE definitions (
    id          INTEGER PRIMARY KEY,
    word_id     INTEGER REFERENCES words(id),
    sense_num   INTEGER,
    definition  TEXT NOT NULL,
    tags        TEXT,                    -- JSON array: ["feminine", "plural", etc.]
    context     TEXT                     -- usage context if any
);
CREATE INDEX idx_def_word ON definitions(word_id);

-- Example sentences for a word
CREATE TABLE sentences (
    id          INTEGER PRIMARY KEY,
    word_id     INTEGER REFERENCES words(id),
    sentence_es TEXT,
    sentence_en TEXT,
    source      TEXT DEFAULT 'tatoeba'
);
CREATE INDEX idx_sent_word ON sentences(word_id);

-- Lemma map: inflected form → lemma
CREATE TABLE lemmas (
    inflected   TEXT NOT NULL,          -- e.g. "hablamos"
    lemma       TEXT NOT NULL,           -- e.g. "hablar"
    pos         TEXT,                    -- verb, noun, etc.
    lang        TEXT NOT NULL            -- 'es'
);
CREATE INDEX idx_lemma_inflected ON lemmas(inflected, lang);

-- Audio file references (for online resolution)
CREATE TABLE audio_refs (
    id          INTEGER PRIMARY KEY,
    word_id     INTEGER REFERENCES words(id),
    filename    TEXT NOT NULL,           -- e.g. "Es-hola.oga"
    region      TEXT,                    -- "Spain", "Andalusia", "Latin America", etc.
    source      TEXT                     -- "wikimedia" or "lingualibre"
);
CREATE INDEX idx_audio_word ON audio_refs(word_id);

-- Full-text search index for autocomplete
CREATE VIRTUAL TABLE words_fts USING fts5(word, lang, pos);
```

### Size estimate

| Component | Estimated size |
|-----------|---------------|
| Word entries + definitions | ~10-15MB |
| Lemma map | ~15MB |
| Sentences | ~10-15MB |
| Audio refs | ~1MB |
| Indexes | ~5-10MB |
| **Total** | **~40-55MB** |

---

## Coding Standards

### Modular Architecture

**Do NOT put everything in `main.ts`.** Code must be organized into discrete, atomic modules that are easy to maintain and update through AI.

Follow this pattern:
- `main.ts` — Lean entry point. Instantiates plugin, registers commands/views, delegates to modules.
- Each module handles one concern (dictionary lookup, audio, chat, UI, etc.)
- Modules export typed interfaces; depend on abstractions, not concrete implementations.
- Keep files under ~200 lines. If a file grows beyond that, split it.

### Module boundaries

| Module | Responsibility |
|--------|---------------|
| `src/main.ts` | Plugin entry, registration, lifecycle |
| `src/settings.ts` | Settings tab & defaults |
| `src/dictionary/lookup.ts` | Dictionary search & data access (EN↔ES bidirectional) |
| `src/dictionary/data.ts` | Data model types & interfaces |
| `src/dictionary/lemma.ts` | Lemmatization (conjugated form → lemma) |
| `src/audio/provider.ts` | Audio resolution & playback (Spanish only, Wikimedia + Google TTS) |
| `src/audio/cache.ts` | Audio file caching in vault |
| `src/chat/provider.ts` | OpenAI-compatible chat API integration |
| `src/chat/prompts.ts` | System prompt & message templates (customizable Spanish tutor prompt) |
| `src/ui/dictionary-view.ts` | Main dictionary tab/view |
| `src/ui/result-renderer.ts` | Rendering dictionary results to HTML |
| `scripts/build-db.ts` | Database build pipeline (separate, NOT part of plugin bundle) |

---

## Data Resources

See `RESEARCH.md` for full details. Summary of primary sources:

### Offline Data (bundled or first-run download)

| Resource | Source | License | What it provides |
|----------|--------|---------|------------------|
| Dictionary definitions | [kaikki.org](https://kaikki.org/dictionary/Spanish/) Wiktionary extract (CC BY-SA) | CC BY-SA | Word → definitions, IPA, POS, synonyms |
| Example sentences | [doozan/spanish_data](https://github.com/doozan/spanish_data) `sentences.tsv` (Tatoeba) | CC BY 2.0 FR | EN↔ES sentence pairs with POS tags |
| Lemmatization | [doozan/spanish_data](https://github.com/doozan/spanish_data) `es_allforms.csv` | CC BY 4.0 | Every inflected form → lemma mapping |
| Frequency ranking | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) `es_50k.txt` | MIT | Word frequency for prioritization |
| Conjugation tables | [bretttolbert/verbecc](https://github.com/bretttolbert/verbecc) | LGPL v3 | Full Spanish verb conjugations |
| Frequency + POS | [doozan/spanish_data](https://github.com/doozan/spanish_data) `frequency.csv` | CC BY 4.0 | Lemma frequency with merged forms |

### Online Features

| Resource | Source | License | What it provides |
|----------|--------|---------|------------------|
| Pronunciation audio | [Wikimedia Commons](https://commons.wikimedia.org) `Es-*.oga`, `Es-ES-*`, `LL-Q1321(spa)-*` with `<a:Spain>` tag | PD/CC | Native speaker recordings, Spain Spanish preferred |
| Audio resolution | Wiktionary API `es-pr` template parsing | CC BY-SA | Maps word → audio filenames with region tags |
| Chat/AI | OpenAI-compatible API (Ollama, cloud, etc.) | Free / self-hosted or paid | Grammar explanations, practice sentences, usage help |
| TTS fallback | Google Translate TTS `tl=es-ES` | ⚠️ Personal use | Synthesized Castilian pronunciation when no Wikimedia recording exists |

### Audio region tagging strategy

Wiktionary `es-pr` template contains region-tagged audio:
```
<audio:LL-Q1321 (spa)-Rodelar-comer.wav<a:Spain>>       ← ✅ Use this
<audio:Es-bo-casa.oga<a:Bolivia>>                         ← ❌ Skip
<audio:Es-am-lat-casa.ogg<a:Latin America>>              ← ❌ Skip
<audio:Es-ES-AN-estar.ogg<a:Andalusia>>                  ← ✅ Accept (Spain)
```
Priority order for Spain Spanish: `Spain` > `Andalusia` > no tag (default often Spain) > Latin America

---

## Obsidian Development Skills

### obsidian-cli
**Location:** `/srv/shared_data/hermes/skills/obsidian/obsidian-cli`
**Use for:** Vault operations, plugin reload, error checking, screenshots, JS eval, DOM inspection.
**Connection details:** See `.local/obsidian-connection.md` (gitignored, not in repo)

```bash
# Connection details are in .local/obsidian-connection.md
# Quick test (full command with env vars is in the .local file)
obsidian plugin:reload id=espanol-diccionario
obsidian dev:errors
obsidian dev:screenshot path=screenshot.png
obsidian eval code="app.plugins.getPlugin('espanol-diccionario')"
```

### obsidian-plugin-dev
**Location:** `/srv/shared_data/hermes/skills/obsidian/obsidian-plugin-dev`
**Use for:** Full plugin dev loop — identify, edit, build, deploy, reload, verify, commit.
**Connection details:** See `.local/obsidian-connection.md` (gitignored, not in repo)

Key workflow:
1. Read existing source before editing
2. Make smallest reliable change
3. Build → deploy to `.obsidian/plugins/espanol-diccionario/` → reload → verify
4. Reference: `references/obsidian-plugin-patterns.md`

### obsidian-ux-controller
**Location:** `/srv/shared_data/hermes/skills/obsidian/obsidian-ux-controller`
**Use for:** Live UI control — panes, views, screenshots, CDP, command palette, DOM inspection.
**Connection details:** See `.local/obsidian-connection.md` (gitignored, not in repo)

---

## Design Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-10 | Wiktionary (kaikki.org) as primary dictionary source | Most comprehensive, open license, includes IPA, structured data |
| 2026-04-10 | doozan/spanish_data for sentences & lemmatization | Pre-processed, CC-licensed, includes POS-tagged Tatoeba sentences and all-forms→lemma table |
| 2026-04-10 | Wikimedia Commons for audio, not Forvo | Commons is free/open, has ~6.7K Spain-tagged recordings; Forvo requires paid API |
| 2026-04-10 | Hybrid offline/online architecture | Offline for core lookups; online for audio streaming + chat |
| 2026-04-10 | Bidirectional EN↔ES dictionary | User can look up English words for Spanish translations and vice versa |
| 2026-04-10 | Audio only for Spanish, not English | Focus is learning Spanish pronunciation; English audio not needed |
| 2026-04-10 | Google TTS as fallback | Works well, simpler than VoicePoweredAI, good enough for this project |
| 2026-04-10 | Plugin ID: `espanol-diccionario` | Finalized ID for manifest and repo |
| 2026-04-10 | OpenAI-compatible API for chat/AI | Supports local Ollama OR cloud providers (OpenAI, Groq, etc.). User configures server URL and optional API key in settings. |
| 2026-04-10 | Single view/tab UI with ribbon + command palette | Simple UX: one view, not multiple sidebars. Open via ribbon icon or command |
| 2026-04-10 | Modular code architecture | User requirement: atomic modules easy to maintain via AI |
| 2026-04-10 | sql.js over wa-sqlite for in-memory DB | sql.js is simpler, proven in browser WebView (Obsidian mobile), and handles WASM loading reliably. wa-sqlite's VFS complexity wasn't needed since we load the entire DB into memory anyway. |
| 2026-04-10 | Separate database build process | Database build is slow (downloads + processing). Code build is fast. Keeping them separate means normal dev cycle doesn't rebuild the DB. `npm run build` for code, `npm run build:db` for data. |
| 2026-04-10 | Auto-download DB + WASM from GitHub Releases | Obsidian Sync doesn't sync binary files in plugin dirs. Instead of requiring manual install, the plugin auto-downloads `dictionary.db` and `sql-wasm.wasm` on first launch using `requestUrl`. Works on all platforms. |

---

## UI Design

### Layout: Single Dictionary View (Tab)

The plugin opens as a **single tab view** (not a sidebar). The view contains:

```
┌─────────────────────────────────────────┐
│  🔍 [Search input________________________] │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  RESULT AREA                        │ │
│  │                                     │ │
│  │  Word: casa                         │ │
│  │  IPA: /ˈka.sa/                      │ │
│  │  POS: noun (feminine)               │ │
│  │  🔊 Play pronunciation             │ │
│  │                                     │ │
│  │  ── Definitions ──                  │ │
│  │  1. house                           │ │
│  │  2. home, household                 │ │
│  │                                     │ │
│  │  ── Example Sentences ──            │ │
│  │  • La casa es grande.              │ │
│  │    The house is big.                │ │
│  │  • Me voy a casa.                  │ │
│  │    I'm going home.                 │ │
│  │                                     │ │
│  │  ── Forms ──                        │ │
│  │  Plural: casas                      │ │
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  CHAT AREA (collapsible)            │ │
│  │                                     │ │
│  │  Ask about this word or grammar...  │ │
│  │  [Input_________________________] 📤 │ │
│  │                                     │ │
│  │  💬 Can you explain ser vs estar?  │ │
│  │  🤖 "Ser" is for essence...        │ │
│  │                                     │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### UI Elements

1. **Search bar** — Always at top. Type any English or Spanish word. Supports conjugated forms (lemmatization).
2. **Result area** — Shows word, IPA, POS, definitions, example sentences, word forms. Play button for audio.
3. **Chat area** — Collapsible section below results. Chat with the LLM about the word or grammar. Pre-filled with the looked-up word as context.
4. **Ribbon icon** — Opens the dictionary view tab.
5. **Command palette** — `Español Diccionario: Open dictionary` command.

### Interaction flow

- User types a word in the search bar
- Results appear immediately (offline data lookup)
- If the word is Spanish, a 🔊 button appears; clicking plays audio (Wikimedia first, Google TTS fallback)
- User can expand the chat area and ask follow-up questions; the currently looked-up word is included as context by default
- The system prompt for the LLM is customizable in settings and tailored for Spanish language tutoring

---

## LLM Chat Integration

### Settings (in plugin settings tab)

- **LLM Server URL** — Default: `http://localhost:11434` (Ollama default). User can point this at any OpenAI-compatible API endpoint (e.g., OpenAI, Anthropic proxy, Groq, Together, etc.) for cloud-based models.
- **API Key** — Optional. Required for cloud providers; leave empty for local Ollama (which has no auth). Stored securely in vault's `data.json` (never committed to repo).
- **Model** — Default: `llama3` (user can enter any model name supported by their chosen server)
- **System prompt** — Editable; defaults to a Spanish tutor prompt
- **Temperature** — Default: 0.7

**Design notes:**
- The chat provider uses an OpenAI-compatible chat completions API (`/v1/chat/completions`), which is supported by Ollama, OpenAI, Groq, Together, LM Studio, and many other providers
- This lets users choose between a free local model (Ollama) or a paid cloud model (OpenAI, etc.) depending on their needs and budget
- The API key field should be a password-type input in the settings UI to prevent accidental exposure

### System prompt (default, customizable)

```
You are a helpful Spanish language tutor specializing in Castilian (Spain) Spanish.
When the user looks up a word, provide additional context, usage notes, and example
sentences. Always use Spain Spanish conventions (vosotros, distinción, etc.).
When explaining grammar, be clear and give practical examples. Respond in the same
language the user writes in (English or Spanish).
```

### Chat behavior

- When a word is looked up, it's injected into the chat as context
- User can type freeform questions
- Chat history persists within the session (cleared on view close, or configurable)
- Responses stream in if the server supports it

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│           Obsidian Plugin                       │
│           espanol-diccionario                    │
│                                                 │
│  ┌──────────────┐  ┌────────────────────────┐  │
│  │  LOCAL DATA  │  │  ONLINE FEATURES       │  │
│  │  (wa-sqlite) │  │                        │  │
│  │              │  │  Audio Provider         │  │
│  │  • Dictionary│  │  ├─ Wikimedia Commons  │  │
│  │  • Lemma map │  │  └─ Google TTS fallback│  │
│  │  • Sentences │  │                        │  │
│  │  • Frequency │  │  Chat Provider            │  │
│  │  • IPA       │  │  ├─ OpenAI-compat API     │  │
│  └──────────────┘  │  │  (Ollama, cloud, etc.)  │  │
│                     │  └─ Custom prompt         │  │
│                     └────────────────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │              UI Layer                    │   │
│  │  ├─ Dictionary View (tab, ribbon+command)│   │
│  │  ├─ Chat Panel (inline in view)           │   │
│  │  └─ Settings Tab                          │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Runtime data flow

```
User types word
    │
    ▼
Lemmatizer ──► resolves conjugated form to lemma
    │
    ▼
wa-sqlite query ──► words + definitions + sentences + audio_refs
    │
    ▼
Result renderer ──► HTML in view
    │
    ├──► Audio: Wikimedia filename → Commons API → play | Google TTS fallback
    │
    └──► Chat: word context → OpenAI-compatible API → stream response
```

---

## Settings Schema (Planned)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| llmServerUrl | string | `http://localhost:11434` | LLM server URL (Ollama, OpenAI-compatible API, etc.) |
| llmApiKey | string | (empty) | API key (required for cloud providers, optional for local Ollama) |
| llmModel | string | `llama3` | LLM model name (must match a model available on the configured server) |
| llmTemperature | number | 0.7 | Chat creativity (0–1) |
| systemPrompt | string | (see above) | Custom system prompt for chat |
| audioSource | enum | `wikimedia-first` | `wikimedia-first` or `google-tts-only` |
| maxSentences | number | 5 | Max example sentences to display |
| autoPlayAudio | boolean | false | Auto-play pronunciation on lookup |

---

## Testing Philosophy

**Goal: Minimize manual testing by the user. Verify as much as possible via automated DOM inspection before asking for human review.**

### What to test after every code change

Every feature must be verified through the Obsidian CLI before considering it done:

1. **Functional correctness** — Does it work at all?
   - Can the view be opened? (check DOM for the view container)
   - Does search return results? (eval lookup, check rendered output)
   - Does audio play? (check audio element exists, source URL is set)
   - Does chat send/respond? (check message rendering in DOM)
   - Do settings persist? (change setting, reload plugin, verify value)

2. **UX quality** — Does it feel natural?
   - Is the search input focused on view open? (check `document.activeElement`)
   - Does Enter trigger search? (simulate and check results)
   - Does the result area scroll properly when content overflows?
   - Are loading/error states shown? (test with invalid input, check DOM for error messages)
   - Does the chat area collapse/expand smoothly?
   - Does clicking anywhere outside a dropdown close it?
   - Are there visual artifacts, duplicate elements, or stale DOM nodes?

3. **Edge cases** — Does it handle gracefully?
   - Empty search input → no crash, no stale results
   - Word not found → clear "not found" message
   - Conjugated form → resolves to lemma, shows correct results
   - Offline (no internet) → dictionary works, audio/chat degrade gracefully
   - LLM not configured → chat section shows helpful message, not a crash

### DOM inspection patterns

```bash
# Check if plugin view is open
obsidian eval code="document.querySelectorAll('.espanol-diccionario-view').length"

# Get rendered text content from the view
obsidian eval code="document.querySelector('.espanol-diccionario-view')?.innerText?.slice(0, 500)"

# Check search input state
obsidian eval code="document.querySelector('.espanol-diccionario-search')?.value"

# Check if results are displayed
obsidian eval code="document.querySelector('.espanol-diccionario-results')?.children?.length"

# Check audio element
obsidian eval code="JSON.stringify({src: document.querySelector('audio')?.src, paused: document.querySelector('audio')?.paused})"

# Check for error notices
obsidian eval code="document.querySelectorAll('.notice').length"

# Check plugin errors in console
obsidian dev:errors

# Full view state snapshot
obsidian eval code="JSON.stringify({
  viewExists: !!document.querySelector('.espanol-diccionario-view'),
  searchValue: document.querySelector('.espanol-diccionario-search')?.value,
  resultCount: document.querySelector('.espanol-diccionario-results')?.children?.length,
  audioReady: !!document.querySelector('audio'),
  chatOpen: !!document.querySelector('.espanol-diccionario-chat')
})"
```

### When to ask for human review

After automated DOM testing passes, ask the user to verify:
- ~~Visual design / aesthetics~~ (user tests directly in vault)
- Audio quality / naturalness of pronunciation
- Chat response quality / helpfulness
- Overall "feel" of the interaction

### Visual review

The user tests the vault directly — no need to capture screenshots for them.
Focus DOM inspection on functional correctness and UX quality.

## Current Phase: Planning

The project is in **planning mode**. No code generation yet. Research is complete (see `RESEARCH.md`). Next steps:
- [x] Finalize plugin ID: `espanol-diccionario`
- [x] Design the UI layout
- [x] Design settings schema
- [x] Design offline storage (wa-sqlite, dictionary.db)
- [x] Define two-build-process architecture (code vs. database)
- [x] Establish security/privacy rules for public repo
- [ ] Scaffold the repo from obsidian-sample-plugin
- [ ] Build database pipeline (`npm run build:db`)
- [ ] Implement plugin modules one by one