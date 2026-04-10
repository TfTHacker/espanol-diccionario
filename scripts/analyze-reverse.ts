// scripts/analyze-reverse.ts — Analyze potential English reverse entries from Spanish definitions

import Database from "better-sqlite3";

const db = new Database("data/dictionary.db");

// Get all first-sense definitions from Spanish entries
const defs = db.prepare(
	"SELECT d.definition, w.word, w.pos, w.id FROM definitions d JOIN words w ON d.word_id = w.id WHERE w.lang = ? AND d.sense_num = 1"
).all("es") as { definition: string; word: string; pos: string; id: number }[];

const englishWords = new Map<string, { spanish: string; pos: string }[]>(); // english word -> [{spanishWord, pos}]

for (const d of defs) {
	// Get the first meaning (before comma/semicolon/paren)
	const clean = d.definition.replace(/"/g, "").replace(/\[.*?\]/g, "").trim();
	const first = clean.split(/[,;(]/)[0].trim();
	// Remove "to " prefix (verbs)
	const word = first.replace(/^to /, "").trim();

	// Only accept single-word or hyphenated English translations
	if (/^[a-zA-Z\-']+$/.test(word) && word.length >= 2 && word.length <= 30) {
		const key = word.toLowerCase();
		if (!englishWords.has(key)) {
			englishWords.set(key, []);
		}
		const arr = englishWords.get(key)!;
		if (arr.length < 3) {
			// Don't add duplicates
			if (!arr.some(e => e.spanish === d.word)) {
				arr.push({ spanish: d.word, pos: d.pos });
			}
		}
	}
}

console.log("Potential English reverse entries:", englishWords.size);

// Show some examples
const samples = ["dream", "house", "water", "speak", "eat", "big", "old", "run", "take", "find", "book", "city", "good", "time", "work"];
for (const s of samples) {
	if (englishWords.has(s)) {
		console.log(`  ${s} → ${englishWords.get(s)!.map(x => `${x.spanish} (${x.pos})`).join(", ")}`);
	} else {
		console.log(`  ${s} → NOT FOUND`);
	}
}

db.close();