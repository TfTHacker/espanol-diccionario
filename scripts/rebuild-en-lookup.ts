// scripts/rebuild-en-lookup.ts — Rebuild English→Spanish reverse lookup from existing full DB
// Reads the Kaikki Spanish data and extracts all English headwords from definitions

import Database from "better-sqlite3";
import { existsSync, unlinkSync, statSync, copyFileSync } from "fs";
import { join } from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";

const DATA_DIR = join(import.meta.dirname || __dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "dictionary.db");
const KAIKKI_PATH = join(DATA_DIR, "kaikki.org-dictionary-Spanish.jsonl");
const FREQ_PATH = join(DATA_DIR, "es_50k.txt");

async function main() {
if (!existsSync(DB_PATH)) {
	console.error("[rebuild-en] No dictionary.db found. Run build-db.ts --full first.");
	process.exit(1);
}
if (!existsSync(KAIKKI_PATH)) {
	console.error("[rebuild-en] No kaikki.org JSONL found. Run build-db.ts --full first.");
	process.exit(1);
}

// Load frequency data (reuse for English words too)
const frequencyMap = new Map<string, number>();
if (existsSync(FREQ_PATH)) {
	const rl = createInterface({ input: createReadStream(FREQ_PATH, { encoding: "utf8" }), crlfDelay: Infinity });
	let rank = 0;
	for await (const line of rl) {
		rank++;
		const word = line.split(/\s+/)[0]?.toLowerCase();
		if (word) frequencyMap.set(word, rank);
	}
	console.log(`[rebuild-en] Loaded ${frequencyMap.size} frequency entries`);
}

// Also load English frequency (es_50k won't have English words — we'll use a heuristic)
// Words that appear as translations of many Spanish words are likely important

console.log("[rebuild-en] Opening database...");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Step 1: Remove existing English entries
console.log("[rebuild-en] Removing old English entries...");
const enWordIds = db.prepare("SELECT id FROM words WHERE lang = 'en'").all() as { id: number }[];
if (enWordIds.length > 0) {
	const idList = enWordIds.map(w => w.id);
	db.prepare("DELETE FROM definitions WHERE word_id IN (" + idList.join(",") + ")").run();
	db.prepare("DELETE FROM words WHERE lang = 'en'").run();
	db.prepare("DELETE FROM sentences WHERE word_id IN (" + idList.join(",") + ")").run();
	console.log(`[rebuild-en] Removed ${enWordIds.length} old English entries`);
}

// Step 2: Parse Kaikki and extract English reverse entries
console.log("[rebuild-en] Parsing Kaikki to extract English headwords...");

interface KaikkiSense {
	glosses?: string[];
	tags?: string[];
	raw_glosses?: string[];
}

interface KaikkiEntry {
	word: string;
	lang: string;
	pos: string;
	senses?: KaikkiSense[];
}

const englishToSpanish = new Map<string, { spanishWord: string; pos: string; senseNum: number }[]>();

let entryCount = 0;

for await (const line of createInterface({
	input: createReadStream(KAIKKI_PATH, { encoding: "utf8" }),
	crlfDelay: Infinity,
})) {
	entryCount++;
	if (entryCount % 100000 === 0) {
		console.log(`  Scanned ${entryCount} entries, ${englishToSpanish.size} English headwords so far...`);
	}

	let entry: KaikkiEntry;
	try {
		entry = JSON.parse(line);
	} catch {
		continue;
	}

	if (entry.lang !== "Spanish" || !entry.word || !entry.pos || !entry.senses) continue;

	const spanishWord = entry.word.toLowerCase();

	// Extract from top 5 senses
	const senseLimit = Math.min(entry.senses.length, 5);
	for (let si = 0; si < senseLimit; si++) {
		const sense = entry.senses[si];
		const gloss = sense.glosses?.[0] || sense.raw_glosses?.[0];
		if (!gloss) continue;

		// Skip non-English-looking glosses
		if (!/^[a-zA-Z]/.test(gloss)) continue;

		// Split gloss on commas, semicolons, parens, "or"
		// "to speak, to talk" → ["speak", "talk"]
		// "big, large, great" → ["big", "large", "great"]
		const parts = gloss.split(/[,;()]| or |\band\b/);
		for (const part of parts) {
			let enWord = part.trim().toLowerCase();
			// Strip "to " prefix (verbs)
			enWord = enWord.replace(/^to /, "");
			// Strip trailing notes like "( colloquial )"
			enWord = enWord.replace(/\s+/g, " ").trim();

			if (!enWord || enWord.length < 2) continue;
			if (enWord.length > 25) continue;
			// Must be single alphabetic word (allow hyphens/apostrophes)
			if (!/^[a-z][a-z'\-]*$/.test(enWord)) continue;

			if (!englishToSpanish.has(enWord)) {
				englishToSpanish.set(enWord, []);
			}
			const arr = englishToSpanish.get(enWord)!;
			if (!arr.some(e => e.spanishWord === spanishWord)) {
				arr.push({ spanishWord, pos: entry.pos, senseNum: si + 1 });
			}
		}
	}
}

console.log(`[rebuild-en] Extracted ${englishToSpanish.size} English headwords from ${entryCount} entries`);

// Step 3: Insert English words
console.log("[rebuild-en] Inserting English entries...");

const maxEsId = db.prepare("SELECT MAX(id) as m FROM words WHERE lang = 'es'").get() as { m: number };
let enWordId = (maxEsId.m || 0) + 100000;
let enDefId = (db.prepare("SELECT MAX(id) as m FROM definitions").get() as { m: number }).m + 100000;
let enWordCount = 0;

const insertWord = db.prepare(
	"INSERT INTO words (id, word, lang, pos, frequency, ipa) VALUES (?, ?, ?, ?, ?, ?)"
);
const insertDef = db.prepare(
	"INSERT INTO definitions (id, word_id, sense_num, definition, tags, context) VALUES (?, ?, ?, ?, ?, ?)"
);

const englishInsertTx = db.transaction(() => {
	for (const [enWord, spanishRefs] of englishToSpanish) {
		const freq = frequencyMap.get(enWord) || null;
		// Include if in frequency list OR has 2+ Spanish translations OR is very short (common word)
		if (freq === null && spanishRefs.length < 2 && enWord.length > 5) continue;

		enWordId++;
		insertWord.run(enWordId, enWord, "en", spanishRefs[0].pos, freq, null);
		enWordCount++;
		const maxRefs = Math.min(spanishRefs.length, 8); // Up to 8 translations
		for (let i = 0; i < maxRefs; i++) {
			enDefId++;
			const ref = spanishRefs[i];
			const defText = ref.pos ? `${ref.spanishWord} (${ref.pos})` : ref.spanishWord;
			insertDef.run(enDefId, enWordId, i + 1, defText, '["es"]', null);
		}
	}
});
englishInsertTx();
console.log(`[rebuild-en] Inserted ${enWordCount} English entries`);

// Step 4: Rebuild indexes
console.log("[rebuild-en] Rebuilding indexes...");
db.exec("REINDEX idx_word_lang");
db.exec("REINDEX idx_def_word");

// Step 5: Optimize and vacuum
console.log("[rebuild-en] Optimizing...");
db.pragma("optimize");
db.close();

const db2 = new Database(DB_PATH);
db2.exec("VACUUM");
db2.close();

const stats = statSync(DB_PATH);
console.log(`\n[rebuild-en] Done! Database size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

// Show some sample lookups
const db3 = new Database(DB_PATH, { readonly: true });
const samples = ["dream", "house", "water", "speak", "eat", "big", "old", "run", "take", "find", "book", "city", "good", "time", "work", "love", "think", "need", "want", "know", "see", "come", "make", "say", "tell", "give", "use", "try", "ask", "seem"];
for (const s of samples) {
	const row = db3.prepare("SELECT id, word, pos FROM words WHERE word = ? AND lang = 'en'").get(s) as any;
	if (row) {
		const defs = db3.prepare("SELECT definition FROM definitions WHERE word_id = ? ORDER BY sense_num ASC").all(row.id) as any[];
		console.log(`  ${s} → ${defs.map(d => d.definition).join(", ")}`);
	} else {
		console.log(`  ${s} → NOT FOUND`);
	}
}
db3.close();
}

main().catch(err => { console.error(err); process.exit(1); });