export const DEFAULT_SPANISH_CHAT_STARTERS = [
  "Roleplay ordering coffee in Madrid.",
  "Write a beginner dialogue at a train station in Spain.",
  "Have a short A2 conversation about daily routine.",
  "Correct my Spanish gently and explain the mistakes.",
] as const;

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
      if (normalized.includes(":")) {
        normalized = normalized.replace(/\s*\([^)]*[A-Za-z][^)]*\)/g, "");
      }
      normalized = normalized.replace(/[“”]/g, "").replace(/[‘’]/g, "");
      return normalized;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
