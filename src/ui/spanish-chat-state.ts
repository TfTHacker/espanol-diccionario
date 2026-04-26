export const DEFAULT_SPANISH_CHAT_STARTERS = [
  "Roleplay ordering coffee in Madrid.",
  "Write a beginner dialogue at a train station in Spain.",
  "Have a short A2 conversation about daily routine.",
  "Correct my Spanish gently and explain the mistakes.",
] as const;

export function shouldSubmitSpanishChatPrompt(keyEvent: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey">): boolean {
  return keyEvent.key === "Enter" && !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.metaKey;
}

function wrapEnglishGlossesForTts(line: string): string {
  const withWrappedParens = line.replace(/\s*\(([^)]*[A-Za-z][^)]*)\)/g, (_match, inner: string) => {
    const gloss = inner.trim();
    return gloss ? ` —${gloss}—` : "";
  });

  const englishMetaLabels = new Set([
    "english",
    "translation",
    "meaning",
    "literal translation",
    "literal meaning",
    "gloss",
    "note",
    "notes",
    "explanation",
  ]);

  return withWrappedParens.replace(/^([^:]{1,40}):(?=\s)/, (_match, label: string) => {
    const normalizedLabel = label.trim().toLowerCase();
    return englishMetaLabels.has(normalizedLabel) ? `—${label.trim()}—:` : `${label}:`;
  });
}

export function assistantMessageToPracticeText(markdown: string): string {
  if (!markdown.trim()) return "";

  let text = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();

  text = text
    .split("\n")
    .map((line) => {
      let normalized = line.trimEnd();
      normalized = wrapEnglishGlossesForTts(normalized);
      normalized = normalized.replace(/[“”]/g, "").replace(/[‘’]/g, "");
      return normalized;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
