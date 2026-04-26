export interface ChatFollowUpContext {
  word?: string;
  lang?: "es" | "en";
  pos?: string | null;
  definitions?: string[];
}

const MAX_FOLLOW_UPS = 4;

export function buildChatFollowUpSuggestions(assistantMarkdown: string, context: ChatFollowUpContext = {}): string[] {
  const word = normalizeTopic(context.word ?? "");
  const topic = extractAnswerTopic(assistantMarkdown, word);
  const definitions = (context.definitions ?? []).map(normalizeTopic).filter(Boolean);
  const firstDefinition = definitions[0];
  const secondDefinition = definitions.find((definition) => definition.toLowerCase() !== firstDefinition?.toLowerCase());
  const isSpanishWord = context.lang !== "en";
  const quotedWord = word ? `"${word}"` : "this word";
  const suggestions: string[] = [];

  if (word) {
    suggestions.push(`What might English speakers confuse ${quotedWord} with, and how do I avoid that?`);
  } else if (topic) {
    suggestions.push(`What might English speakers confuse ${topic} with, and how do I avoid that?`);
  }

  if (word && firstDefinition && secondDefinition) {
    suggestions.push(`When does ${quotedWord} mean "${firstDefinition}" vs "${secondDefinition}"?`);
  } else if (word && firstDefinition) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord} meaning "${firstDefinition}"?`);
  } else if (word) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord}?`);
  }

  if (word && topic && topic.toLowerCase() !== word.toLowerCase()) {
    suggestions.push(`How does ${topic} change how I should use ${quotedWord} in real Spanish?`);
  }

  suggestions.push(word
    ? `Show me minimal-pair examples that contrast ${quotedWord} with similar ${isSpanishWord ? "Spanish" : "English/Spanish"} words.`
    : "Show me minimal-pair examples that contrast this with similar Spanish words.");
  suggestions.push(word
    ? `Quiz me on choosing ${quotedWord} vs easy-to-confuse alternatives.`
    : "Quiz me on choosing between easy-to-confuse alternatives.");

  return uniqueNonEmpty(suggestions).slice(0, MAX_FOLLOW_UPS);
}

export function extractAnswerTopic(markdown: string, fallback = ""): string {
  const candidates = [
    ...Array.from(markdown.matchAll(/^#{1,6}\s+(.+)$/gm), (match) => match[1]),
    ...Array.from(markdown.matchAll(/\*\*([^*]{3,60})\*\*/g), (match) => match[1]),
    ...Array.from(markdown.matchAll(/[“"]([^”"]{3,60})[”"]/g), (match) => match[1]),
    ...Array.from(markdown.matchAll(/`([^`]{3,60})`/g), (match) => match[1]),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTopic(candidate);
    if (isUsefulTopic(normalized)) return normalized;
  }

  return normalizeTopic(fallback);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeTopic(value: string): string {
  return value
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.:;,!?)\]]+$/g, "")
    .replace(/^[(\[]+/g, "")
    .trim();
}

function isUsefulTopic(value: string): boolean {
  if (value.length < 3 || value.length > 60) return false;
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value)) return false;
  const lowered = value.toLowerCase();
  return ![
    "spanish",
    "english",
    "translation",
    "example",
    "examples",
    "note",
    "summary",
  ].includes(lowered);
}
