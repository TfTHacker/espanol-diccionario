// scripts/build-db.ts — Full database build pipeline
// Downloads raw data sources and processes them into data/dictionary.db
//
// Usage:
//   npm run build:db          — build test database (small, for dev)
//   npm run build:db -- --full — build full database from online sources
//
// Data sources:
//   1. Kaikki.org (Wiktionary) — words, IPA, definitions (CC BY-SA)
//   2. doozan/spanish_data — lemmatization, sentences, frequency (CC BY 4.0)
//   3. hermitdave/FrequencyWords — word frequency (MIT)

import Database from "better-sqlite3";
import { mkdirSync, existsSync, writeFileSync, unlinkSync, statSync, createReadStream, readFileSync } from "fs";
import { join, dirname } from "path";
import { createInterface } from "readline";
import { createGunzip } from "zlib";
import { execSync } from "child_process";

const DATA_DIR = join(import.meta.dirname || __dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "dictionary.db");

// Download URLs
const KAIKKI_URL = "https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl";
const FREQUENCY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt";
const SPANISH_DATA_BASE = "https://raw.githubusercontent.com/doozan/spanish_data/master";

mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// Utility: download file with curl
// ============================================================
function downloadFile(url: string, dest: string): void {
	if (existsSync(dest)) {
		console.log(`[build-db] Already exists: ${dest}`);
		return;
	}
	console.log(`[build-db] Downloading ${url}...`);
	execSync(`curl -L -o "${dest}" "${url}"`, { stdio: "inherit" });
	console.log(`[build-db] Saved to ${dest}`);
}

// ============================================================
// Utility: read JSONL file line by line
// ============================================================
async function* readJsonlLines(filePath: string): AsyncGenerator<string> {
	const rl = createInterface({
		input: createReadStream(filePath, { encoding: "utf8" }),
		crlfDelay: Infinity,
	});
	for await (const line of rl) {
		if (line.trim()) yield line;
	}
}

// ============================================================
// Build test database (small, for development)
// ============================================================
function buildTestDatabase() {
	console.log("[build-db] Building test database...");

	if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

	const db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");

	db.exec(`
		CREATE TABLE IF NOT EXISTS words (
			id          INTEGER PRIMARY KEY,
			word        TEXT NOT NULL,
			lang        TEXT NOT NULL,
			pos         TEXT,
			frequency   INTEGER,
			ipa         TEXT
		);
		CREATE TABLE IF NOT EXISTS definitions (
			id          INTEGER PRIMARY KEY,
			word_id     INTEGER REFERENCES words(id),
			sense_num   INTEGER,
			definition  TEXT NOT NULL,
			tags        TEXT,
			context     TEXT
		);
		CREATE TABLE IF NOT EXISTS sentences (
			id          INTEGER PRIMARY KEY,
			word_id     INTEGER REFERENCES words(id),
			sentence_es TEXT,
			sentence_en TEXT,
			source      TEXT DEFAULT 'tatoeba'
		);
		CREATE TABLE IF NOT EXISTS lemmas (
			inflected   TEXT NOT NULL,
			lemma       TEXT NOT NULL,
			pos         TEXT,
			lang        TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_word_lang ON words(word, lang);
		CREATE INDEX IF NOT EXISTS idx_word_freq ON words(word, frequency);
		CREATE INDEX IF NOT EXISTS idx_def_word ON definitions(word_id);
		CREATE INDEX IF NOT EXISTS idx_sent_word ON sentences(word_id);
		CREATE INDEX IF NOT EXISTS idx_lemma_inflected ON lemmas(inflected, lang);
	`);

	const insertWord = db.prepare(
		"INSERT INTO words (id, word, lang, pos, frequency, ipa) VALUES (?, ?, ?, ?, ?, ?)"
	);
	const insertDef = db.prepare(
		"INSERT INTO definitions (id, word_id, sense_num, definition, tags, context) VALUES (?, ?, ?, ?, ?, ?)"
	);
	const insertSentence = db.prepare(
		"INSERT INTO sentences (id, word_id, sentence_es, sentence_en, source) VALUES (?, ?, ?, ?, ?)"
	);
	const insertLemma = db.prepare(
		"INSERT INTO lemmas (inflected, lemma, pos, lang) VALUES (?, ?, ?, ?)"
	);

	const transaction = db.transaction(() => {
		insertWord.run(1, "casa", "es", "noun", 100, "/ˈka.sa/");
		insertWord.run(2, "hablar", "es", "verb", 150, "/a.ˈblaɾ/");
		insertWord.run(3, "hola", "es", "interjection", 50, "/ˈo.la/");
		insertWord.run(4, "gracias", "es", "interjection", 60, "/ˈɡɾa.θjas/");
		insertWord.run(5, "comer", "es", "verb", 200, "/ko.ˈmeɾ/");
		insertWord.run(6, "agua", "es", "noun", 300, "/ˈa.ɣwa/");
		insertWord.run(7, "bueno", "es", "adjective", 180, "/ˈbwe.no/");
		insertWord.run(8, "tiempo", "es", "noun", 250, "/ˈtjem.po/");
		insertWord.run(9, "ser", "es", "verb", 80, "/ˈseɾ/");
		insertWord.run(10, "estar", "es", "verb", 90, "/es.ˈtaɾ/");

		insertWord.run(101, "house", "en", "noun", 100, null);
		insertWord.run(102, "speak", "en", "verb", 150, null);
		insertWord.run(103, "hello", "en", "interjection", 50, null);
		insertWord.run(104, "thank", "en", "verb", 60, null);
		insertWord.run(105, "eat", "en", "verb", 200, null);
		insertWord.run(106, "water", "en", "noun", 300, null);
		insertWord.run(107, "good", "en", "adjective", 180, null);
		insertWord.run(108, "time", "en", "noun", 250, null);
		insertWord.run(109, "be", "en", "verb", 80, null);

		insertDef.run(1, 1, 1, "house", '["feminine"]', null);
		insertDef.run(2, 1, 2, "home, household", null, null);
		insertDef.run(3, 2, 1, "to speak, to talk", '["transitive", "intransitive"]', null);
		insertDef.run(4, 3, 1, "hello, hi", null, "greeting");
		insertDef.run(5, 4, 1, "thank you, thanks", null, null);
		insertDef.run(6, 5, 1, "to eat", '["transitive"]', null);
		insertDef.run(7, 6, 1, "water", '["feminine"]', null);
		insertDef.run(8, 7, 1, "good", '["masculine"]', null);
		insertDef.run(9, 8, 1, "time, weather", '["masculine"]', null);
		insertDef.run(10, 9, 1, "to be (essence, identity)", '["irregular", "intransitive"]', null);
		insertDef.run(11, 10, 1, "to be (state, location)", '["irregular", "intransitive"]', null);

		insertDef.run(50, 101, 1, "casa", '["es"]', null);
		insertDef.run(51, 102, 1, "hablar", '["es"]', null);
		insertDef.run(52, 103, 1, "hola", '["es"]', null);

		insertSentence.run(1, 1, "La casa es grande.", "The house is big.", "tatoeba");
		insertSentence.run(2, 1, "Me voy a casa.", "I'm going home.", "tatoeba");
		insertSentence.run(3, 1, "¿Dónde está tu casa?", "Where is your house?", "tatoeba");
		insertSentence.run(4, 2, "Hablo español.", "I speak Spanish.", "tatoeba");
		insertSentence.run(5, 2, "¿Puedes hablar más despacio?", "Can you speak more slowly?", "tatoeba");
		insertSentence.run(6, 3, "¡Hola! ¿Cómo estás?", "Hello! How are you?", "tatoeba");
		insertSentence.run(7, 5, "Vamos a comer.", "Let's eat.", "tatoeba");
		insertSentence.run(8, 6, "Quiero agua.", "I want water.", "tatoeba");
		insertSentence.run(9, 9, "Yo soy estudiante.", "I am a student.", "tatoeba");
		insertSentence.run(10, 10, "Estoy cansado.", "I am tired.", "tatoeba");

		insertLemma.run("hablo", "hablar", "verb", "es");
		insertLemma.run("hablas", "hablar", "verb", "es");
		insertLemma.run("habla", "hablar", "verb", "es");
		insertLemma.run("hablamos", "hablar", "verb", "es");
		insertLemma.run("habláis", "hablar", "verb", "es");
		insertLemma.run("hablan", "hablar", "verb", "es");
		insertLemma.run("hablé", "hablar", "verb", "es");
		insertLemma.run("hablaste", "hablar", "verb", "es");
		insertLemma.run("habló", "hablar", "verb", "es");
		insertLemma.run("hablaron", "hablar", "verb", "es");
		insertLemma.run("como", "comer", "verb", "es");
		insertLemma.run("comes", "comer", "verb", "es");
		insertLemma.run("come", "comer", "verb", "es");
		insertLemma.run("comemos", "comer", "verb", "es");
		insertLemma.run("coméis", "comer", "verb", "es");
		insertLemma.run("comen", "comer", "verb", "es");
		insertLemma.run("soy", "ser", "verb", "es");
		insertLemma.run("eres", "ser", "verb", "es");
		insertLemma.run("es", "ser", "verb", "es");
		insertLemma.run("somos", "ser", "verb", "es");
		insertLemma.run("sois", "ser", "verb", "es");
		insertLemma.run("son", "ser", "verb", "es");
		insertLemma.run("fui", "ser", "verb", "es");
		insertLemma.run("fuiste", "ser", "verb", "es");
		insertLemma.run("fue", "ser", "verb", "es");
		insertLemma.run("fueron", "ser", "verb", "es");
		insertLemma.run("estoy", "estar", "verb", "es");
		insertLemma.run("estás", "estar", "verb", "es");
		insertLemma.run("está", "estar", "verb", "es");
		insertLemma.run("estamos", "estar", "verb", "es");
		insertLemma.run("estáis", "estar", "verb", "es");
		insertLemma.run("están", "estar", "verb", "es");
		insertLemma.run("casas", "casa", "noun", "es");
	});

	transaction();
	db.close();

	const stats = statSync(DB_PATH);
	console.log(`[build-db] Test database created: ${DB_PATH} (${stats.size} bytes)`);
	console.log("[build-db] Done!");
}

// ============================================================
// Build full database from online sources
// ============================================================
async function buildFullDatabase() {
	console.log("[build-db] Building FULL database from online sources...");
	console.log("[build-db] This will download ~1GB of data and take several minutes.");

	if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

	const db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");

	// Create tables
	db.exec(`
		CREATE TABLE IF NOT EXISTS words (
			id          INTEGER PRIMARY KEY,
			word        TEXT NOT NULL,
			lang        TEXT NOT NULL,
			pos         TEXT,
			frequency   INTEGER,
			ipa         TEXT
		);
		CREATE TABLE IF NOT EXISTS definitions (
			id          INTEGER PRIMARY KEY,
			word_id     INTEGER REFERENCES words(id),
			sense_num   INTEGER,
			definition  TEXT NOT NULL,
			tags        TEXT,
			context     TEXT
		);
		CREATE TABLE IF NOT EXISTS sentences (
			id          INTEGER PRIMARY KEY,
			word_id     INTEGER REFERENCES words(id),
			sentence_es TEXT,
			sentence_en TEXT,
			source      TEXT DEFAULT 'tatoeba'
		);
		CREATE TABLE IF NOT EXISTS lemmas (
			inflected   TEXT NOT NULL,
			lemma       TEXT NOT NULL,
			pos         TEXT,
			lang        TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_word_lang ON words(word, lang);
		CREATE INDEX IF NOT EXISTS idx_word_freq ON words(word, frequency);
		CREATE INDEX IF NOT EXISTS idx_def_word ON definitions(word_id);
		CREATE INDEX IF NOT EXISTS idx_sent_word ON sentences(word_id);
		CREATE INDEX IF NOT EXISTS idx_lemma_inflected ON lemmas(inflected, lang);
	`);

	// ============================================================
	// Step 1: Load frequency data (Spanish 50k)
	// ============================================================
	console.log("\n[build-db] Step 1: Loading word frequency data...");
	const freqPath = join(DATA_DIR, "es_50k.txt");
	downloadFile(FREQUENCY_URL, freqPath);

	const frequencyMap = new Map<string, number>(); // word -> rank (lower = more frequent)
	let freqRank = 0;
	for await (const line of readJsonlLines(freqPath)) {
		freqRank++;
		const parts = line.split(/\s+/);
		if (parts.length >= 1) {
			const word = parts[0].toLowerCase();
			if (!frequencyMap.has(word)) {
				frequencyMap.set(word, freqRank);
			}
		}
	}
	console.log(`[build-db] Loaded ${frequencyMap.size} frequency entries`);

	// ============================================================
	// Step 2: Parse Kaikki.org Spanish dictionary
	// ============================================================
	console.log("\n[build-db] Step 2: Parsing Kaikki.org Spanish dictionary...");
	const kaikkiPath = join(DATA_DIR, "kaikki.org-dictionary-Spanish.jsonl");
	downloadFile(KAIKKI_URL, kaikkiPath);

	interface KaikkiSense {
		glosses?: string[];
		tags?: string[];
		raw_glosses?: string[];
	}

	interface KaikkiSound {
		ipa?: string;
		tags?: string[];
	}

	interface KaikkiEntry {
		word: string;
		lang: string;  // "Spanish"
		pos: string;
		sounds?: KaikkiSound[];
		senses?: KaikkiSense[];
	}

	const insertWord = db.prepare(
		"INSERT INTO words (id, word, lang, pos, frequency, ipa) VALUES (?, ?, ?, ?, ?, ?)"
	);
	const insertDef = db.prepare(
		"INSERT INTO definitions (id, word_id, sense_num, definition, tags, context) VALUES (?, ?, ?, ?, ?, ?)"
	);

	let wordId = 0;
	let defId = 0;
	let entryCount = 0;
	let wordCount = 0;
	let defCount = 0;

	// We'll collect words first, then insert in a transaction
	interface ParsedWord {
		id: number;
		word: string;
		pos: string;
		ipa: string | null;
		frequency: number | null;
		definitions: { senseNum: number; definition: string; tags: string | null; context: string | null }[];
	}

	const words: ParsedWord[] = [];
	const seenWords = new Set<string>(); // "word|pos" to deduplicate

	console.log("[build-db] Parsing Kaikki JSONL (this takes a few minutes)...");

	for await (const line of readJsonlLines(kaikkiPath)) {
		entryCount++;

		let entry: KaikkiEntry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		// Only process Spanish entries
		if (entry.lang !== "Spanish") continue;
		if (!entry.word || !entry.pos) continue;

		// Skip multi-word phrases (focus on single-word lookups)
		// Allow compound words with hyphens but skip phrases with spaces
		if (entry.word.includes(" ") && entry.word.split(" ").length > 2) continue;

		const wordLower = entry.word.toLowerCase();
		const dedupeKey = `${wordLower}|${entry.pos}`;

		// Only keep the first entry for each word+pos combo (they tend to be the best)
		if (seenWords.has(dedupeKey)) continue;
		seenWords.add(dedupeKey);

		// Extract IPA — prefer peninsular Spanish IPA
		let ipa: string | null = null;
		if (entry.sounds) {
			for (const sound of entry.sounds) {
				if (sound.ipa) {
					// Prefer IPA entries tagged as Spain/Europe
					const isEuropean = sound.tags?.some(t =>
						t.toLowerCase().includes("spain") ||
						t.toLowerCase().includes("europe") ||
						t.toLowerCase().includes("castilian")
					);
					if (!ipa || isEuropean) {
						ipa = sound.ipa;
						if (isEuropean) break; // Stop at first European one
					}
				}
			}
		}

		// Extract definitions
		const definitions: ParsedWord["definitions"] = [];
		if (entry.senses) {
			let senseNum = 0;
			for (const sense of entry.senses) {
				senseNum++;
				const gloss = sense.glosses?.[0] || sense.raw_glosses?.[0];
				if (!gloss) continue;

				// Clean up gloss — remove markdown, trim
				const cleanGloss = gloss.replace(/\{[^}]*\}/g, "").trim();
				if (!cleanGloss || cleanGloss.length < 1) continue;

				const tags = sense.tags && sense.tags.length > 0
					? JSON.stringify(sense.tags)
					: null;

				definitions.push({
					senseNum,
					definition: cleanGloss,
					tags,
					context: null,
				});
			}
		}

		// Skip entries with no definitions
		if (definitions.length === 0) continue;

		wordId++;
		const freq = frequencyMap.get(wordLower) || null;

		words.push({
			id: wordId,
			word: wordLower,
			pos: entry.pos,
			ipa,
			frequency: freq,
			definitions,
		});
		wordCount++;
		defCount += definitions.length;

		if (wordCount % 10000 === 0) {
			console.log(`  Parsed ${wordCount} words (${entryCount} entries scanned)...`);
		}
	}

	console.log(`[build-db] Parsed ${wordCount} words with ${defCount} definitions from ${entryCount} entries`);

	// ============================================================
	// Step 2b: Insert Spanish words with frequency-based priority
	// ============================================================
	console.log("\n[build-db] Step 2b: Inserting Spanish words...");

	// Sort by frequency (nulls last) so most common words are first
	words.sort((a, b) => {
		if (a.frequency !== null && b.frequency !== null) return a.frequency - b.frequency;
		if (a.frequency !== null) return -1;
		if (b.frequency !== null) return 1;
		return 0;
	});

	// Re-assign IDs after sort
	const wordInsertTx = db.transaction(() => {
		for (const w of words) {
			insertWord.run(w.id, w.word, "es", w.pos, w.frequency, w.ipa);
			for (const d of w.definitions) {
				insertDef.run(++defId, w.id, d.senseNum, d.definition, d.tags, d.context);
			}
		}
	});
	wordInsertTx();
	console.log(`[build-db] Inserted ${wordCount} Spanish words`);

	// ============================================================
	// Step 3: Build English→Spanish reverse lookup (top 5000 words)
	// ============================================================
	console.log("\n[build-db] Step 3: Building English→Spanish reverse lookup...");

	// For the most common Spanish words, add English entries that map back
	// e.g., "house" → "casa", "speak" → "hablar"
	const englishToSpanish = new Map<string, { spanishWord: string; pos: string }[]>(); // english word -> [spanish words]

	// Read back the top 5000 definitions to build reverse mapping
	const topWords = db.prepare(`
		SELECT w.id, w.word, w.pos, d.definition
		FROM words w
		JOIN definitions d ON d.word_id = w.id
		WHERE w.lang = 'es' AND w.frequency IS NOT NULL AND w.frequency <= 5000
		ORDER BY w.frequency ASC
	`).all() as { id: number; word: string; pos: string; definition: string }[];

	let enWordId = wordId + 10000; // Start English IDs at a high offset
	let enDefId = defId + 10000;

	for (const row of topWords) {
		// Simple approach: use the first definition as the English equivalent
		const enWord = row.definition.toLowerCase().replace(/^to /, "").split(",")[0].split(";")[0].trim();
		if (!enWord || enWord.length < 2 || enWord.includes(" ")) continue;

		if (!englishToSpanish.has(enWord)) {
			englishToSpanish.set(enWord, []);
		}
		englishToSpanish.get(enWord)!.push({ spanishWord: row.word, pos: row.pos });
	}

	const englishInsertTx = db.transaction(() => {
		for (const [enWord, spanishRefs] of englishToSpanish) {
			enWordId++;
			const freq = frequencyMap.get(enWord) || null;
			insertWord.run(enWordId, enWord, "en", spanishRefs[0].pos, freq, null);
			for (let i = 0; i < Math.min(spanishRefs.length, 5); i++) {
				enDefId++;
				insertDef.run(enDefId, enWordId, i + 1, spanishRefs[i].spanishWord, '["es"]', null);
			}
		}
	});
	englishInsertTx();
	console.log(`[build-db] Added ${englishToSpanish.size} English→Spanish reverse entries`);

	// ============================================================
	// Step 4: Load lemmatization data (es_allforms.csv from doozan)
	// ============================================================
	console.log("\n[build-db] Step 4: Loading lemmatization data...");
	const allformsPath = join(DATA_DIR, "es_allforms.csv");
	downloadFile(`${SPANISH_DATA_BASE}/es_allforms.csv`, allformsPath);

	const insertLemma = db.prepare(
		"INSERT INTO lemmas (inflected, lemma, pos, lang) VALUES (?, ?, ?, ?)"
	);

	let lemmaCount = 0;
	// Collect first, then insert in transaction
	const lemmaEntries: [string, string, string | null][] = [];
	const lemmaSeen = new Set<string>();

	console.log("[build-db] Reading lemmatization file (67MB, this takes a minute)...");
	for await (const line of readJsonlLines(allformsPath)) {
		const parts = line.split(",");
		if (parts.length < 3) continue;

		const inflected = parts[0].toLowerCase();
		const pos = parts[1] || null;
		const lemma = parts[2].toLowerCase();

		if (!inflected || !lemma) continue;

		const key = `${inflected}|${lemma}|${pos}`;
		if (lemmaSeen.has(key)) continue;
		lemmaSeen.add(key);

		lemmaEntries.push([inflected, lemma, pos]);
	}

	console.log(`[build-db] Read ${lemmaEntries.length} lemma entries, inserting...`);

	const lemmaBulkInsert = db.transaction(() => {
		for (const [inflected, lemma, pos] of lemmaEntries) {
			try {
				insertLemma.run(inflected, lemma, pos, "es");
				lemmaCount++;
			} catch {
				// Skip duplicates
			}
		}
	});
	lemmaBulkInsert();
	console.log(`[build-db] Inserted ${lemmaCount} lemmatization entries`);

	// ============================================================
	// Step 5: Load example sentences (from doozan/spanish_data)
	// ============================================================
	console.log("\n[build-db] Step 5: Loading example sentences...");
	const sentencesPath = join(DATA_DIR, "sentences.tsv");
	downloadFile(`${SPANISH_DATA_BASE}/sentences.tsv`, sentencesPath);

	interface SentencePair {
		en: string;
		es: string;
		esWords: string[]; // Spanish words in the sentence (for linking)
	}

	const sentencesByWord = new Map<string, SentencePair[]>(); // spanish word -> sentences

	console.log("[build-db] Parsing sentences (40MB, this takes a minute)...");
	let sentencePairCount = 0;

	for await (const line of readJsonlLines(sentencesPath)) {
		// Format: English \t Spanish \t attribution \t en_level \t es_level \t POS tags
		const parts = line.split("\t");
		if (parts.length < 2) continue;

		const en = parts[0].trim();
		const es = parts[1].trim();
		if (!en || !es || en.length < 3 || es.length < 3) continue;

		// Extract Spanish words from the sentence for linking
		const esWords = es.toLowerCase()
			.replace(/[¡!¿?.,;:«»""'()]/g, "")
			.split(/\s+/)
			.filter(w => w.length >= 3); // Only link to words 3+ chars

		for (const w of esWords) {
			if (!sentencesByWord.has(w)) {
				sentencesByWord.set(w, []);
			}
			const arr = sentencesByWord.get(w)!;
			if (arr.length < 5) { // Max 5 sentences per word
				arr.push({ en, es, esWords });
			}
		}
		sentencePairCount++;
	}

	console.log(`[build-db] Parsed ${sentencePairCount} sentence pairs, linking to words...`);

	// Link sentences to words in the database
	const insertSentence = db.prepare(
		"INSERT INTO sentences (id, word_id, sentence_es, sentence_en, source) VALUES (?, ?, ?, ?, ?)"
	);

	// Get word lookup map
	const wordLookup = new Map<string, number>(); // word -> id
	const allWords = db.prepare("SELECT id, word FROM words WHERE lang = 'es'").all() as { id: number; word: string }[];
	for (const w of allWords) {
		if (!wordLookup.has(w.word)) {
			wordLookup.set(w.word, w.id);
		}
	}

	let sentenceId = 0;
	let linkedSentenceCount = 0;

	const sentenceInsertTx = db.transaction(() => {
		for (const [word, sents] of sentencesByWord) {
			const wordId = wordLookup.get(word);
			if (!wordId) continue;

			for (const s of sents) {
				sentenceId++;
				insertSentence.run(sentenceId, wordId, s.es, s.en, "tatoeba");
				linkedSentenceCount++;
			}
		}
	});
	sentenceInsertTx();
	console.log(`[build-db] Inserted ${linkedSentenceCount} linked example sentences`);

	// ============================================================
	// Finalize: VACUUM and stats
	// ============================================================
	console.log("\n[build-db] Optimizing database...");
	db.pragma("optimize");
	db.close();

	// Re-open and VACUUM to reduce size
	{
		const db2 = new Database(DB_PATH);
		db2.exec("VACUUM");
		db2.close();
	}

	const stats = statSync(DB_PATH);
	const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

	console.log(`\n[build-db] ============================================`);
	console.log(`[build-db] Full database created: ${DB_PATH}`);
	console.log(`[build-db] Size: ${sizeMB} MB`);
	console.log(`[build-db] Spanish words: ${wordCount}`);
	console.log(`[build-db] English reverse entries: ${englishToSpanish.size}`);
	console.log(`[build-db] Definitions: ${defId + (enDefId - defId - 10000)}`);
	console.log(`[build-db] Lemmatization entries: ${lemmaCount}`);
	console.log(`[build-db] Example sentences: ${linkedSentenceCount}`);
	console.log(`[build-db] ============================================`);
	console.log(`[build-db] Done!`);
}

// ============================================================
// Main
// ============================================================
const args = process.argv.slice(2);
if (args.includes("--full")) {
	buildFullDatabase().catch(err => {
		console.error("[build-db] Fatal error:", err);
		process.exit(1);
	});
} else {
	buildTestDatabase();
}