# Spanish Dictionary Obsidian Plugin — Research Report

## Project Goal
An **Obsidian plugin** for Spanish language learners focused on **Spain (Castilian) Spanish**, with:
- **Offline**: word lookup → definition + example sentences
- **Online**: audio pronunciation + chat AI integration

---

## 1. Dictionary Data (Offline)

### 🏆 Primary: Wiktionary via Kaikki.org / Wiktextract

| Property | Details |
|----------|---------|
| **Source** | [kaikki.org/dictionary/Spanish](https://kaikki.org/dictionary/Spanish/) |
| **Data extraction tool** | [wiktextract](https://github.com/tatuylonen/wiktextract) ⭐1,134 — parses enwiktionary dump into structured JSONL |
| **Download** | `kaikki.org-dictionary-Spanish.jsonl` (874MB postprocessed, 916MB with all fields) |
| **License** | CC BY-SA (Wiktionary license) |
| **Coverage** | **825,329 pages** with Spanish sections on enwiktionary |
| **Update frequency** | Monthly (from enwiktionary dumps) |
| **Data per entry** | Word, part of speech, IPA, senses/glosses (English), synonyms, hypernyms, hyponyms, translations, derived terms, conjugation info |

**Sample entry structure (from JSONL):**
```json
{
  "word": "casa",
  "lang": "Spanish",
  "pos": "noun",
  "sounds": [
    {"ipa": "/ˈkasa/", "tags": ["phoneme"]},
    {"ipa": "[ˈka.sa]", "tags": ["voicing"]}
  ],
  "senses": [
    {"glosses": ["house"], "tags": ["feminine"]},
    {"glosses": ["home, household"]}
  ],
  "head_templates": [...],
  "inflection_templates": [...]
}
```

**⚠️ Note**: The kaikki.org *postprocessed* JSONL strips audio file references. To get audio metadata, we must either:
1. Process the raw enwiktionary dump directly with wiktextract (preserves audio fields)
2. Query the Wiktionary API at runtime for audio references (online, lightweight)

---

### 🥈 Secondary: doozan/spanish_data ⭐50

| Property | Details |
|----------|---------|
| **Source** | [github.com/doozan/spanish_data](https://github.com/doozan/spanish_data) |
| **License** | CC BY 4.0 |
| **Key files** | `es-en.data` (16.3MB), `sentences.tsv` (40.2MB), `frequency.csv` (2.6MB), `es_allforms.csv` (67MB) |
| **Derived from** | Wiktionary + Tatoeba, processed with FreeLing POS tagger |
| **Also produces** | StarDict/Aard2 dictionary files (in Releases) |

**Strengths:**
- Pre-processed Spanish→English dictionary in compact format
- **40.2MB of English↔Spanish sentence pairs** from Tatoeba with POS tags, lemmas, and proficiency ratings
- **67MB all-forms conjugation/inflection table** (maps every word form to its lemma)
- **Frequency list** with word counts from a large corpus (most frequent 50k lemmas)
- Also used to build the "6001 Spanish Vocab" Anki deck

**Sample data:**
```csv
# frequency.csv
count,spanish,pos,flags,usage
24459038,de,prep,,24459038:de
20081793,ella,pron,,15403031:la|3687944:las|911291:ella|79527:ellas

# sentences.tsv (tab-separated: English \t Spanish \t attribution \t en_level \t es_level \t POS-lemma tags)
Goodnight.	Que tengas una buena noche.	CC-BY 2.0 ...	6	0	:conj,que :v,tengas|tener :art,una|uno :adj,buena|bueno :n,noche
```

---

### 🥉 Supplementary: es.wiktionary.org (Spanish-language definitions)

| Property | Details |
|----------|---------|
| **Source** | [es.wiktionary.org](https://es.wiktionary.org) |
| **Dump size** | 88MB (bz2 compressed) |
| **Language** | Definitions are **in Spanish** (monolingual) |
| **Audio** | Contains `pron-graf` template with audio references for **~7,983 words** |
| **Best for** | Advanced learners who want Spanish-in-Spanish definitions (like a native speaker would use) |

---

### Real Academia Española (RAE)

| Property | Details |
|----------|---------|
| **Source** | [dle.rae.es](https://dle.rae.es) |
| **Status** | ❌ **Not usable** — behind Cloudflare, no public API, scraping is fragile |
| **Alternative** | [javierhonduco/nebrija](https://github.com/javierhonduco/nebrija) ⭐19 — Ruby RAE parser (unofficial, may break) |

---

## 2. Example Sentences

### 🏆 Tatoeba

| Property | Details |
|----------|---------|
| **Source** | [tatoeba.org](https://tatoeba.org) |
| **Download** | `downloads.tatoeba.org/exports/sentences.tar.bz2` (205MB), `links.tar.bz2` (140MB for translations) |
| **License** | CC BY 2.0 FR |
| **Coverage** | Millions of Spanish↔English sentence pairs |
| **Quality** | Community-reviewed; some sentences have self-reported proficiency levels |
| **Format** | `sentence_id \t lang \t text` + `sentence_id \t translation_id` (links file) |

**Alternative**: Use the pre-processed `sentences.tsv` from doozan/spanish_data (40.2MB, already filtered and tagged).

---

## 3. Audio Pronunciation (Online Feature)

### 🏆 Wikimedia Commons Spanish Audio

| Category | Count | Notes |
|----------|-------|-------|
| **`Es-*.oga` files** (traditional naming) | ~3,269 | Older, typically Castilian/Spain Spanish |
| **`LL-Q1321 (spa)-*.wav` files** (Lingua Libre) | ~17,307 | Newer, from many contributors across regions |
| **`Es-ES-*` files** (Spain-specific) | ~6,680 | Explicitly tagged as Spain |
| **`Es-ES-AN-*` files** (Andalusia specifically) | ~14 | Dialect-specific for seseo/ceceo |

**How audio is referenced in Wiktionary entries:**

The `{{es-pr}}` template in enwiktionary entries includes region-tagged audio:

```
{{es-pr|+<audio:LL-Q1321 (spa)-Rodelar-comer.wav<a:Spain>>}}
{{es-pr|+<audio:LL-Q1321 (spa)-Rodrigo5260-hablar.wav<a:Peru>>}}
{{es-pr|+<audio:Es-bo-casa.oga<a:Bolivia>><audio:Es-am-lat-casa.ogg<a:Latin America>><hmp:caza<a:Latin America>>}}
```

**Regional tags found:**
- `<a:Spain>` — Castilian/Spain Spanish ✅
- `<a:Peru>`, `<a:Colombia>`, `<a:Bolivia>`, `<a:Mexico>` — Latin American countries
- `<a:Latin America>` — General Latin American
- `<a:Andalusia>` — Southern Spain dialect
- `<a:Caribbean>`, `<a:Argentina>`, `<a:Uruguay>` — Other regions

**Strategy for Spain Spanish audio:**
1. Parse the `es-pr` template to extract all audio references with `<a:Spain>` or no regional tag (the "default" in many entries is Spain Spanish)
2. Query the Wiktionary API at runtime for a word → parse the es-pr template → get the audio filename
3. Fetch the actual audio file from `upload.wikimedia.org` (verified: works, ~5-10KB per file for .oga)

**Audio file formats:**
- `.oga` / `.ogg` — Ogg Vorbis (most common, ~5-15KB per word)
- `.wav` — uncompressed (from Lingua Libre, larger ~50-200KB)

**Direct URL pattern:**
```
https://upload.wikimedia.org/wikipedia/commons/{hash_prefix}/{filename}
```

Example: `https://upload.wikimedia.org/wikipedia/commons/a/a2/Es-hola.oga` (6.4KB)

To resolve filename→URL, use the Commons API:
```
https://commons.wikimedia.org/w/api.php?action=query&titles=File:{filename}&prop=imageinfo&iiprop=url&format=json
```

---

### 🥈 Google Translate TTS (Online Fallback)

| Property | Details |
|----------|---------|
| **URL pattern** | `https://translate.google.com/translate_tts?ie=UTF-8&q={word}&tl=es-ES&client=tw-ob` |
| **Spain Spanish** | ✅ Use `tl=es-ES` (Castilian) vs `tl=es-419` (Latin American) |
| **Quality** | Good natural-sounding speech |
| **License** | ⚠️ **Not officially licensed for redistribution** — for personal use only |
| **Reliability** | Works but Google can block/scramble if overused |

---

### 🥉 VoicePoweredAI Spanish TTS ⭐82

| Property | Details |
|----------|---------|
| **Source** | [github.com/voicepowered-ai/VoicePoweredAI_Spanish_v1](https://github.com/voicepowered-ai/VoicePoweredAI_Spanish_v1) |
| **Description** | Open-source TTS focused on **Spanish peninsular accent** (Spain!) |
| **License** | Apache 2.0 |
| **Base model** | Fine-tuned F5-TTS |
| **Use case** | Could be bundled for offline TTS generation in the future (requires Python runtime) |

---

### ❌ Forvo

| Property | Details |
|----------|---------|
| **Source** | [forvo.com](https://forvo.com) |
| **Coverage** | Largest collection of native speaker pronunciations |
| **Status** | ❌ **Paid API only** — not viable for an open plugin without cost |

---

## 4. Verb Conjugation

### 🏆 verbecc ⭐102

| Property | Details |
|----------|---------|
| **Source** | [github.com/bretttolbert/verbecc](https://github.com/bretttolbert/verbecc) |
| **Languages** | Catalan, **Spanish**, French, Italian, Portuguese, Romanian |
| **License** | LGPL v3 |
| **Features** | Full conjugation tables + ML prediction for unknown verbs |
| **Has API** | [verbecc-svc](https://github.com/bretttolbert/verbecc-svc) ⭐25 — Dockerized REST API |

### 🥈 doozan/spanish_data (es_allforms.csv)

| Property | Details |
|----------|---------|
| **File** | `es_allforms.csv` (67MB) |
| **Format** | `word_form,pos,lemma` (e.g., `hablamos,v,hablar`) |
| **Coverage** | All inflected forms mapped to their lemma — perfect for looking up conjugated forms |

### 🥉 voldmar/conjugation ⭐19

- Python library for Spanish verb conjugation
- Alternative to verbecc

---

## 5. Word Frequency Data

### 🏆 hermitdave/FrequencyWords ⭐1,468

| Property | Details |
|----------|---------|
| **Source** | [github.com/hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) |
| **License** | MIT |
| **Files** | `es_50k.txt`, `es_full.txt` |
| **Format** | `word\tcount` (e.g., `de\t14459520`) |
| **Use case** | Rank words by frequency — prioritize common words for a learner |

### 🥈 doozan/spanish_data frequency.csv

- 2.6MB, includes POS tags and variant forms merged as lemmas
- Better granularity for learning purposes

---

## 6. Lemmatization (Mapping Inflected Forms → Dictionary Form)

### 🏆 doozan/spanish_data (es_allforms.csv)

- 67MB, maps every word form to its lemma
- Critical for looking up conjugated verbs (`hablamos` → `hablar`) and plural nouns (`casas` → `casa`)

### 🥈 pablodms/spacy-spanish-lemmatizer ⭐40

- Rule-based lemmatization for spaCy
- Could be used at runtime for unknown word forms

---

## 7. Existing Obsidian Plugins (Competition / Inspiration)

### obsidian-dictionary ⭐428

| Property | Details |
|----------|---------|
| **Source** | [github.com/phibr0/obsidian-dictionary](https://github.com/phibr0/obsidian-dictionary) |
| **Spanish support** | ✅ Definitions + synonyms (via Altervista) |
| **Offline** | ✅ Experimental offline support (English/Chinese only, not Spanish) |
| **Audio** | ❌ No audio pronunciation |
| **Limitation** | Uses Free Dictionary API for Spanish — but **that API returns "No Definitions Found" for Spanish words** |
| **Our advantage** | Our plugin would have offline data, audio, and Spain-specific content |

### Spanish Made Easy (SME) ⭐3

| Property | Details |
|----------|---------|
| **Source** | [github.com/PandoraReads/Spanish-Made-Easy](https://github.com/PandoraReads/Spanish-Made-Easy) |
| **Features** | Dictionary, FSRS flashcards, video shadowing, highlight notes, AI integration |
| **Dictionary** | Google Translate + offline MDX dictionaries |
| **Audio** | Google TTS |
| **Limitation** | Requires invitation code (not fully open). Made by a Chinese company targeting Chinese speakers learning Spanish. No Spain-specific focus. |
| **Our advantage** | Open source, Spain Spanish focus, Wiktionary-based (more accurate than Google Translate) |

---

## 8. Chat / AI Integration (Online Feature)

For the chat feature where learners can ask questions like *"Explain ser vs. estar"* or *"Use casa in a sentence"*, the following APIs can be integrated:

| Provider | API | Cost | Quality | Spain Spanish awareness |
|----------|-----|------|---------|------------------------|
| **OpenAI** | GPT-4o-mini | $0.15/1M input tokens | Excellent | Good (if prompted) |
| **Anthropic** | Claude Haiku | $0.25/1M input tokens | Excellent | Good (if prompted) |
| **Google** | Gemini Flash | Free tier available | Very good | Good |
| **Ollama (local)** | Local LLM | Free | Varies | Limited |
| **DeepSeek** | DeepSeek Chat | Very cheap | Good | Decent |

**Key insight**: With a good system prompt that specifies "You are a Spanish language tutor specializing in Castilian/Spain Spanish", any modern LLM will provide regionally accurate answers. This is a significant advantage — the AI can explain the difference between *vosotros* (Spain) and *ustedes* (Latin America), use *distinción* phonology, etc.

---

## 9. Recommended Architecture & Data Pipeline

### Offline Data (Bundled with/plugin downloads on first use)

```
┌─────────────────────────────────────────────┐
│  Processed Dictionary Data (SQLite)         │
│                                              │
│  • ~30-50MB per 50k most common words        │
│  • Word → definition, POS, IPA, examples     │
│  • Lemma lookup table (from es_allforms.csv) │
│  • Frequency ranking (from FrequencyWords)   │
│  • Example sentences (from Tatoeba/doozan)   │
│  • Conjugation data (from verbecc/es_allforms)│
└─────────────────────────────────────────────┘
```

### Online Features (requires internet)

```
┌─────────────────────────────────────────────┐
│  Runtime Queries                             │
│                                              │
│  • Audio: Parse es-pr template from          │
│    Wiktionary API → get Spain audio file     │
│    → stream from Wikimedia Commons           │
│                                              │
│  • Chat: LLM API integration for             │
│    grammar questions, usage explanations,     │
│    practice sentences                         │
│                                              │
│  • Fallback TTS: Google Translate TTS        │
│    (es-ES locale) if no Wiktionary audio     │
└─────────────────────────────────────────────┘
```

### Data Processing Pipeline

```
1. Download kaikki.org JSONL (916MB)
2. Filter for top 50k Spanish words by frequency
3. Extract: word, POS, IPA, senses (English glosses), synonyms
4. Merge with doozan/spanish_data:
   - es_allforms.csv → lemma lookup table
   - sentences.tsv → example sentences
   - frequency.csv → word frequency ranking
5. Build SQLite database (~30-50MB)
6. For audio: store mapping of word → audio filenames from es-pr template
   (can be extracted from enwiktionary dump at build time)
```

---

## 10. Summary of Recommended Resources

| Need | Resource | License | Size | Quality |
|------|----------|---------|------|---------|
| **Dictionary definitions** | Kaikki/wiktextract (enwiktionary) | CC BY-SA | ~50MB processed | ⭐⭐⭐⭐⭐ |
| **Example sentences** | doozan/spanish_data (Tatoeba) | CC BY 2.0 | ~40MB | ⭐⭐⭐⭐ |
| **Word frequency** | hermitdave/FrequencyWords | MIT | ~1MB | ⭐⭐⭐⭐⭐ |
| **Lemmatization** | doozan/es_allforms.csv | CC BY 4.0 | ~67MB | ⭐⭐⭐⭐⭐ |
| **Conjugation** | verbecc + es_allforms | LGPL / CC BY | ~10MB | ⭐⭐⭐⭐ |
| **Audio (Spain)** | Wikimedia Commons (Es-ES, LL-Q1321 with Spain tag) | PD/CC | ~50-200MB total | ⭐⭐⭐⭐ |
| **Audio (fallback TTS)** | Google Translate TTS (es-ES) | ⚠️ Personal use | N/A (streamed) | ⭐⭐⭐⭐ |
| **Chat/AI** | OpenAI/Anthropic/Google API | Paid/Free | N/A | ⭐⭐⭐⭐⭐ |

All primary data sources are **open source / Creative Commons** and can be legally bundled in an Obsidian plugin.