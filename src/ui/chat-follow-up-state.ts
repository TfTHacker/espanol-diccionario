export interface ChatFollowUpContext {
  word?: string;
  lang?: "es" | "en";
  pos?: string | null;
  definitions?: string[];
}

const MAX_FOLLOW_UPS = 3;
const MAX_LOOKUP_SUGGESTIONS = 4;
const MAX_LLM_LOOKUP_SUGGESTIONS = 3;

export function buildStaticLookupQuestion(word: string): string {
  const normalized = normalizeTopic(word);
  return `Tell me more about the word ${normalized || "this word"}`;
}

export function buildLookupSuggestionPrompt(context: ChatFollowUpContext = {}): string {
  return buildSuggestionGenerationPrompt(
    "Create exactly 3 short follow-up questions for the initial Ask section after a dictionary lookup. Do not include a generic 'tell me more' question; that is already shown separately.",
    context,
    MAX_LLM_LOOKUP_SUGGESTIONS,
  );
}

export function buildContinueSuggestionPrompt(
  assistantMarkdown: string,
  context: ChatFollowUpContext = {},
  previousQuestions: string[] = [],
): string {
  return buildSuggestionGenerationPrompt(
    "Create exactly 3 short Continue questions after the assistant's latest answer.",
    context,
    MAX_FOLLOW_UPS,
    assistantMarkdown,
    previousQuestions,
  );
}

export function parseLlmSuggestionList(message: string, maxSuggestions: number): string[] {
  const trimmed = message.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  const source = jsonMatch?.[0] ?? trimmed;

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return uniqueNonEmpty(parsed.filter((item): item is string => typeof item === "string"))
        .slice(0, maxSuggestions);
    }
  } catch {
    // Fall through to line-based parsing for models that ignore strict JSON.
  }

  return uniqueNonEmpty(trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.endsWith("?")))
    .slice(0, maxSuggestions);
}

export function filterNewSuggestions(suggestions: string[], previousQuestions: string[], maxSuggestions: number): string[] {
  const previous = new Set(previousQuestions.map(normalizeQuestionKey).filter(Boolean));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const trimmed = suggestion.trim();
    const key = normalizeQuestionKey(trimmed);
    if (!trimmed || !key || previous.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxSuggestions) break;
  }
  return result;
}

export function buildLookupChatSuggestions(context: ChatFollowUpContext = {}): string[] {
  const word = normalizeTopic(context.word ?? "");
  const definitions = (context.definitions ?? []).map(cleanDefinitionForPrompt).filter(Boolean);
  const firstDefinition = definitions[0];
  const secondDefinition = definitions.find((definition) => definition.toLowerCase() !== firstDefinition?.toLowerCase());
  const pos = normalizeTopic(context.pos ?? "").toLowerCase();
  const isSpanishWord = context.lang !== "en";
  const quotedWord = word ? `"${word}"` : "this word";
  const suggestions: string[] = [];

  suggestions.push(buildStaticLookupQuestion(word));
  suggestions.push(buildUsageQuestion(quotedWord, pos, isSpanishWord, firstDefinition));

  if (word && firstDefinition && secondDefinition) {
    suggestions.push(`When does ${quotedWord} mean "${firstDefinition}" vs "${secondDefinition}"?`);
  } else if (word && firstDefinition) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord} meaning "${firstDefinition}"?`);
  } else if (word) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord}?`);
  }

  if (word) {
    suggestions.push(`What words or phrases are easy to confuse with ${quotedWord}?`);
  }

  suggestions.push(buildPracticeQuestion(quotedWord, pos, firstDefinition));

  return uniqueNonEmpty(suggestions).slice(0, MAX_LOOKUP_SUGGESTIONS);
}

export function buildChatFollowUpSuggestions(assistantMarkdown: string, context: ChatFollowUpContext = {}): string[] {
  const word = normalizeTopic(context.word ?? "");
  const topic = extractAnswerTopic(assistantMarkdown, word);
  const definitions = (context.definitions ?? []).map(cleanDefinitionForPrompt).filter(Boolean);
  const firstDefinition = definitions[0];
  const secondDefinition = definitions.find((definition) => definition.toLowerCase() !== firstDefinition?.toLowerCase());
  const pos = normalizeTopic(context.pos ?? "").toLowerCase();
  const isSpanishWord = context.lang !== "en";
  const quotedWord = word ? `"${word}"` : "this word";
  const suggestions: string[] = [];

  if (word) {
    suggestions.push(buildUsageQuestion(quotedWord, pos, isSpanishWord, firstDefinition));
  } else if (topic) {
    suggestions.push(`How should I use ${topic} naturally in Spain Spanish?`);
  }

  if (word && firstDefinition && secondDefinition) {
    suggestions.push(`When does ${quotedWord} mean "${firstDefinition}" vs "${secondDefinition}"?`);
  } else if (word && firstDefinition) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord} meaning "${firstDefinition}"?`);
  } else if (word) {
    suggestions.push(`What direct-translation trap should I watch for with ${quotedWord}?`);
  }

  if (word) {
    suggestions.push(`What might English speakers confuse ${quotedWord} with, and how do I avoid that?`);
  } else if (topic) {
    suggestions.push(`What might English speakers confuse ${topic} with, and how do I avoid that?`);
  }

  if (word && topic && topic.toLowerCase() !== word.toLowerCase()) {
    suggestions.push(`How does ${topic} change how I should use ${quotedWord} in real Spanish?`);
  }

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

function buildSuggestionGenerationPrompt(
  task: string,
  context: ChatFollowUpContext,
  count: number,
  assistantMarkdown = "",
  previousQuestions: string[] = [],
): string {
  const word = normalizeTopic(context.word ?? "");
  const pos = normalizeTopic(context.pos ?? "");
  const definitions = (context.definitions ?? []).map(cleanDefinitionForPrompt).filter(Boolean).slice(0, 5);
  const language = context.lang === "en" ? "English lookup that should teach the Spanish equivalent/usage" : "Spanish lookup";
  const lines = [
    task,
    "Audience: an English-speaking learner of Castilian/Spain Spanish.",
    "Write every question in English.",
    "Each string must be one standalone question ending with a question mark, under 120 characters.",
    "Make every question specific to this exact word and its learning traps, not generic.",
    "Prefer questions about nuance, common collocations, conjugation/word form, false friends, direct-translation traps, register, and easy confusions when relevant.",
    `Return only a JSON array of exactly ${count} strings. No markdown, labels, or explanation.`,
    "",
    `Word: ${word || "unknown"}`,
    `Lookup language: ${language}`,
    `Part of speech: ${pos || "unknown"}`,
    `Definitions: ${definitions.length ? definitions.join("; ") : "unknown"}`,
  ];

  const previous = uniqueNonEmpty(previousQuestions).slice(-12);
  if (previous.length > 0) {
    lines.push(
      "",
      "Do not repeat or closely paraphrase any of these previous Continue questions:",
      ...previous.map((question) => `- ${question}`),
    );
  }

  const answer = assistantMarkdown.trim();
  if (answer) {
    lines.push("", "Latest assistant answer to continue from:", answer.slice(0, 2000));
  }

  return lines.join("\n");
}

function buildUsageQuestion(quotedWord: string, pos: string, isSpanishWord: boolean, firstDefinition?: string): string {
  const meaning = firstDefinition ? ` meaning "${firstDefinition}"` : "";
  const spanishLabel = isSpanishWord ? "Spain Spanish" : "Spanish";

  if (pos.includes("verb")) {
    return `How do I use and conjugate ${quotedWord}${meaning} in common ${spanishLabel} phrases?`;
  }
  if (pos.includes("pronoun")) {
    return `When would a native speaker in Spain choose ${quotedWord}${meaning} instead of another pronoun?`;
  }
  if (pos.includes("noun")) {
    return `What are the most natural collocations and set phrases with ${quotedWord}${meaning}?`;
  }
  if (pos.includes("adjective") || pos === "adj") {
    return `How does ${quotedWord}${meaning} change with gender, number, and placement?`;
  }
  if (pos.includes("adverb")) {
    return `Where does ${quotedWord}${meaning} usually go in a natural Spanish sentence?`;
  }
  if (pos.includes("preposition")) {
    return `What patterns or fixed expressions should I learn with the preposition ${quotedWord}?`;
  }
  if (pos.includes("conjunction")) {
    return `What clauses or sentence patterns does ${quotedWord} usually connect?`;
  }

  return `How do native speakers in Spain actually use ${quotedWord}${meaning}?`;
}

function buildPracticeQuestion(quotedWord: string, pos: string, firstDefinition?: string): string {
  const meaning = firstDefinition ? ` meaning "${firstDefinition}"` : "";

  if (pos.includes("verb")) {
    return `Give me a quick mini-drill for conjugating and using ${quotedWord}${meaning}.`;
  }
  if (pos.includes("noun")) {
    return `Give me example sentences that show common phrases with ${quotedWord}${meaning}.`;
  }
  if (pos.includes("adjective") || pos === "adj") {
    return `Give me examples of ${quotedWord}${meaning} before and after nouns.`;
  }
  if (pos.includes("preposition")) {
    return `Give me examples of the most common expressions with ${quotedWord}.`;
  }
  if (pos.includes("pronoun")) {
    return `Quiz me on choosing ${quotedWord}${meaning} vs similar pronouns.`;
  }

  return `Give me practical example sentences with ${quotedWord}${meaning}.`;
}

function cleanDefinitionForPrompt(value: string): string {
  const normalized = normalizeTopic(value)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\([^)]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 60) return normalized;
  const shortened = normalized.slice(0, 57).replace(/[\s,;:]+\S*$/, "").trim();
  return `${shortened}…`;
}

function normalizeQuestionKey(value: string): string {
  return normalizeTopic(value)
    .toLowerCase()
    .replace(/\b(the|a|an|do|does|did|can|could|would|should|i|me|my)\b/g, " ")
    .replace(/[^a-z0-9áéíóúüñ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
