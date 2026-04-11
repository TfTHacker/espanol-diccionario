# Español Diccionario

An Obsidian plugin for learning **Spain (Castilian) Spanish**, featuring:

- **Bidirectional dictionary** — Look up English → Spanish or Spanish → English
- **Offline core** — Type a word → see definition, IPA, part of speech, example sentences
- **Smart lemmatization** — Conjugated forms (hablamos, están, casas) auto-resolve to the dictionary form
- **Audio pronunciation** — Wikimedia Commons Spain Spanish recordings with Google TTS fallback
- **AI chat** — Ask grammar questions and get more examples via an OpenAI-compatible LLM (Ollama, OpenAI, Groq, etc.)
- **Mobile support** — Works on Obsidian mobile (iOS + Android)

## Installation

### From Release

1. Download the latest release assets (`main.js`, `manifest.json`, `styles.css`, `data/dictionary.db`)
2. Create a folder `.obsidian/plugins/espanol-diccionario/` in your vault
3. Copy all files into that folder
4. Also copy `sql-wasm.wasm` into the same folder (available in releases)
5. Enable the plugin in Obsidian Settings → Community Plugins

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
| System Prompt | (Spanish tutor prompt) | Customizable prompt for chat |

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
5. Expand **💬 Chat** to ask the AI about the word or grammar

### Examples

- `casa` → house (noun, /ˈka.sa/)
- `hablamos` → resolves to `hablar` (to speak)
- `house` → casa (English → Spanish)
- `están` → resolves to `estar` (to be - state/location)

## Privacy & Security

- **API keys** are stored in your vault's `.obsidian/plugins/espanol-diccionario/data.json` — local to your machine, never committed to any repository
- **Dictionary data** is processed offline from open/CC-licensed sources
- **Audio** streams from Wikimedia Commons; no data is sent to third parties
- **Chat** sends your messages to your configured LLM endpoint (local or cloud)

## Data Sources

| Source | License | What it provides |
|--------|---------|------------------|
| [Kaikki/Wiktionary](https://kaikki.org) | CC BY-SA | Definitions, IPA, POS |
| [Tatoeba](https://tatoeba.org) via [doozan/spanish_data](https://github.com/doozan/spanish_data) | CC BY 2.0 | Example sentences |
| [doozan/es_allforms](https://github.com/doozan/spanish_data) | CC BY 4.0 | Lemmatization table |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | MIT | Word frequency ranking |
| [Wikimedia Commons](https://commons.wikimedia.org) | PD/CC | Spain Spanish audio |

## Development

```bash
npm run dev          # Watch mode (auto-rebuild on changes)
npm run build        # Production build
npm run build:db     # Build the full dictionary database
```

## License

MIT