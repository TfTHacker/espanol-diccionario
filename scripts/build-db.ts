// scripts/build-db.ts — Database build pipeline
// Downloads raw data sources and processes them into data/dictionary.db
//
// Usage: npm run build:db
//
// For development, a small test database is created by default.
// Use --full flag to build the complete database from online sources.

import Database from "better-sqlite3";
import { mkdirSync, existsSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join, dirname } from "path";

const DATA_DIR = join(import.meta.dirname || __dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "dictionary.db");

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

function buildTestDatabase() {
	console.log("[build-db] Building test database...");

	// Remove existing database
	if (existsSync(DB_PATH)) {
		unlinkSync(DB_PATH);
	}

	const db = new Database(DB_PATH);

	// Enable WAL mode for better concurrent reads
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

		-- Indexes for fast lookups
		CREATE INDEX IF NOT EXISTS idx_word_lang ON words(word, lang);
		CREATE INDEX IF NOT EXISTS idx_word_freq ON words(word, frequency);
		CREATE INDEX IF NOT EXISTS idx_def_word ON definitions(word_id);
		CREATE INDEX IF NOT EXISTS idx_sent_word ON sentences(word_id);
		CREATE INDEX IF NOT EXISTS idx_lemma_inflected ON lemmas(inflected, lang);
	`);

	// Insert test data
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
		// === Spanish words ===
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

		// === English words (for reverse lookup) ===
		insertWord.run(101, "house", "en", "noun", 100, null);
		insertWord.run(102, "speak", "en", "verb", 150, null);
		insertWord.run(103, "hello", "en", "interjection", 50, null);
		insertWord.run(104, "thank", "en", "verb", 60, null);
		insertWord.run(105, "eat", "en", "verb", 200, null);
		insertWord.run(106, "water", "en", "noun", 300, null);
		insertWord.run(107, "good", "en", "adjective", 180, null);
		insertWord.run(108, "time", "en", "noun", 250, null);
		insertWord.run(109, "be", "en", "verb", 80, null);

		// === Definitions for Spanish words ===
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

		// === Definitions for English words ===
		insertDef.run(50, 101, 1, "casa", '["es"]', null);
		insertDef.run(51, 102, 1, "hablar", '["es"]', null);
		insertDef.run(52, 103, 1, "hola", '["es"]', null);

		// === Example sentences ===
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

		// === Lemmatization entries ===
		// Conjugations of "hablar"
		insertLemma.run("hablo", "hablar", "verb", "es");
		insertLemma.run("hablas", "hablar", "verb", "es");
		insertLemma.run("habla", "hablar", "verb", "es");
		insertLemma.run("hablamos", "hablar", "verb", "es");
		insertLemma.run("habláis", "hablar", "verb", "es");
		insertLemma.run("hablan", "hablar", "verb", "es");
		insertLemma.run("hablé", "hablar", "verb", "es");
		insertLemma.run("hablaste", "hablar", "verb", "es");
		insertLemma.run("habló", "hablar", "verb", "es");
		insertLemma.run("hablamos", "hablar", "verb", "es");
		insertLemma.run("hablasteis", "hablar", "verb", "es");
		insertLemma.run("hablaron", "hablar", "verb", "es");

		// Conjugations of "comer"
		insertLemma.run("como", "comer", "verb", "es");
		insertLemma.run("comes", "comer", "verb", "es");
		insertLemma.run("come", "comer", "verb", "es");
		insertLemma.run("comemos", "comer", "verb", "es");
		insertLemma.run("coméis", "comer", "verb", "es");
		insertLemma.run("comen", "comer", "verb", "es");

		// Conjugations of "ser"
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

		// Conjugations of "estar"
		insertLemma.run("estoy", "estar", "verb", "es");
		insertLemma.run("estás", "estar", "verb", "es");
		insertLemma.run("está", "estar", "verb", "es");
		insertLemma.run("estamos", "estar", "verb", "es");
		insertLemma.run("estáis", "estar", "verb", "es");
		insertLemma.run("están", "estar", "verb", "es");

		// Plural nouns
		insertLemma.run("casas", "casa", "noun", "es");
	});

	transaction();
	db.close();

	const stats = statSync(DB_PATH);
	console.log(`[build-db] Test database created: ${DB_PATH} (${stats.size} bytes)`);
	console.log("[build-db] Done!");
}

buildTestDatabase();