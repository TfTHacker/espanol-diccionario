# Español Diccionario

An Obsidian plugin for learning **Spain (Castilian) Spanish**, featuring:

- **Bidirectional dictionary** — Look up English → Spanish or Spanish → English
- **Offline core** — Type a word → see definition, IPA, part of speech, example sentences
- **Smart lemmatization** — Conjugated forms (hablamos, están, casas) auto-resolve to the dictionary form
- **Audio pronunciation** — Google TTS with Castilian Spanish (`es-ES`) pronunciation
- **Dedicated Spanish chat** — Practice freeform conversation, roleplay, and dialogue generation in a standalone chat view
- **Translator view** — Translate English ↔ Spanish, play both sides with TTS, and open a learner breakdown with Leipzig glossing
- **AI learner prompts** — Dynamic dictionary follow-up links and translation breakdown prompts for grammar, usage, and examples
- **Chat → TTS handoff** — Send generated assistant dialogue straight into the Spanish TTS practice view
- **Spanish TTS practice view** — Open a dedicated reader/player for arbitrary Spanish text
- **Selection playback** — Play only the highlighted portion of practice text when you want to focus on a phrase
- **Practice history + draft persistence** — Reopen recent listening snippets and keep your in-progress text between sessions
- **Import note/file text** — Pull Markdown or `.txt` file contents into the practice reader for quick listening drills
- **Shared feature shortcuts** — Switch quickly between Dictionary (`Alt+1`), Chat (`Alt+2`), TTS (`Alt+3`), and Translator (`Alt+4`)
- **Input and chat font sizing** — Tune readable input/chat text sizes in settings
- **AI chat** — Ask grammar questions and get more examples via an OpenAI-compatible LLM (Ollama, OpenAI, Groq, etc.)
- **Mobile support** — Works on Obsidian mobile (iOS + Android)

## Installation

### From Release

1. Download the latest release assets (`main.js`, `manifest.json`, `styles.css`, `dictionary.db`, `sql-wasm.wasm`)
2. Create a folder `.obsidian/plugins/espanol-diccionario/` in your vault
3. Copy all files into that folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### From Source

```bash
git clone https://github.com/TfTHacker/espanol-diccionario.git
cd espanol-diccionario
npm install
npm run build
```

## Building the Dictionary Database

The plugin requires a `dictionary.db` SQLite file. A small test database is included. For the full database:

```bash
npm run build:db
```

This downloads raw data sources (Wiktionary, Tatoeba, frequency lists) and processes them into `data/dictionary.db`. See `RESEARCH.md` for data source details.

## Configuration

Open **Settings → Español Diccionario** to configure:

### LLM Chat

| Setting | Default | Description |
|---------|---------|-------------|
| LLM Server URL | `https://ollama.com` | OpenAI-compatible API endpoint |
| API Key | (empty) | Required for cloud providers; optional for local Ollama |
| Model | `gemma3:4b` | Model name as recognized by your server |
| Temperature | `0.7` | Response creativity (0–1) |
| System Prompt | (Spanish tutor prompt) | Customizable prompt for dictionary chat |
| Spanish chat system prompt | (conversation tutor prompt) | Separate prompt for the standalone Spanish Chat view |
| Chat font size | `18px` | Readability setting for embedded and standalone chat |
| Input font size | `18px` | Readability setting for search, chat, TTS, and translator inputs |

**Supported providers:** Ollama, OpenAI, Groq, Together, LM Studio, and any OpenAI-compatible API.

### Audio

| Setting | Default | Description |
|---------|---------|-------------|
| Audio source | Google TTS (es-ES) | Castilian Spanish audio via Google Translate TTS |
| Auto-play | Off | Auto-play pronunciation on lookup |

### Display

| Setting | Default | Description |
|---------|---------|-------------|
| Max sentences | 5 | Max example sentences per word (1–20) |

## Usage

1. Click the 📖 ribbon icon or use the command **"Español Diccionario: Open dictionary"**
2. Type any English or Spanish word in the search bar
3. View definitions, IPA, example sentences
4. Click 🔊 to hear pronunciation (Spanish words only)
5. Use the generated **Ask** links or expand **💬 Chat** to ask the AI about the word or grammar

### Spanish chat

Use the command palette to open **"Español Diccionario: Open Spanish chat"**.

In the dedicated chat view you can:

- practice freeform Spanish conversation without opening the dictionary first
- tailor a separate **Spanish chat system prompt** in settings
- ask for roleplays, level-appropriate dialogues, corrections, or slower phrasing
- reuse recent prompts from the **🕐** prompt history button
- send any useful assistant reply straight to TTS with **Send to TTS**

This is designed to be the easiest workflow for generating dialogue and immediately practicing it as listening material.

### Translator

Use the command palette to open **"Español Diccionario: Open translator"** or press `Alt+4` from any plugin view.

In the translator view you can:

- type English or Spanish and translate it to the other language
- click **↔ Translate** directly under the input field
- play the input or translation with TTS
- open **💬 Breakdown** in Spanish Chat for a concise learner explanation with Leipzig glossing

### Spanish TTS practice

Use the command palette to open **"Español Diccionario: Open Spanish TTS practice"**.

In the practice view you can:

- type or paste arbitrary Spanish text
- press `Ctrl/Cmd+Enter` or click **▶** to play it
- toggle **🔁** to auto-repeat playback with a short pause between loops
- select just part of the text to play only that selection
- reuse recent snippets from the **🕐** history menu
- import a Markdown or text file with **📄**
- send selected text from the active Markdown note with **"Send selected text to Spanish TTS practice"**

The practice view keeps the current draft, auto-repeat preference, and a capped history of recent practice snippets in plugin settings, so you can come back to them later.

### Examples

- `casa` → house (noun, /ˈka.sa/)
- `hablamos` → resolves to `hablar` (to speak)
- `house` → casa (English → Spanish)
- `están` → resolves to `estar` (to be - state/location)

## Privacy & Security

- **API keys** are stored in your vault's `.obsidian/plugins/espanol-diccionario/data.json` — local to your machine, never committed to any repository
- **Dictionary data** is processed offline from open/CC-licensed sources
- **Audio** uses Google Translate TTS for pronunciation, TTS practice, and translator playback
- **Chat and translator** send your messages to your configured LLM endpoint (local or cloud)

## Data Sources

| Source | License | What it provides |
|--------|---------|------------------|
| [Kaikki/Wiktionary](https://kaikki.org) | CC BY-SA | Definitions, IPA, POS |
| [Tatoeba](https://tatoeba.org) via [doozan/spanish_data](https://github.com/doozan/spanish_data) | CC BY 2.0 | Example sentences |
| [doozan/es_allforms](https://github.com/doozan/spanish_data) | CC BY 4.0 | Lemmatization table |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | MIT | Word frequency ranking |
| [Google Translate TTS](https://translate.google.com/) | Proprietary service | Castilian Spanish pronunciation playback |

## Development

```bash
npm run dev          # Watch mode (auto-rebuild on changes)
npm run build        # Production build
npm run build:db     # Build the full dictionary database
```

## Releasing

For maintainer release workflow details, versioning steps, and GitHub Actions behavior, see [`RELEASING.md`](RELEASING.md).

## License

MIT