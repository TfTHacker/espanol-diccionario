export function buildExampleExplanationPrompt(sentenceEs: string, sentenceEn?: string): string {
  const trimmedEs = sentenceEs.trim();
  const trimmedEn = sentenceEn?.trim() ?? "";

  const lines = [
    "Explain this example sentence in more detail.",
    `Spanish: ${trimmedEs}`,
  ];

  if (trimmedEn) {
    lines.push(`English: ${trimmedEn}`);
  }

  lines.push(
    "Please explain the meaning, important vocabulary, grammar, and why this example is useful for a learner."
  );

  return lines.join("\n");
}

export function buildDefinitionExplanationPrompt(word: string, definition: string, context?: string): string {
  const trimmedWord = word.trim();
  const trimmedDefinition = definition.trim();
  const trimmedContext = context?.trim() ?? "";

  const lines = [
    "Help me explore this specific dictionary translation in more detail.",
    `Word: ${trimmedWord}`,
    `Translation: ${trimmedDefinition}`,
  ];

  if (trimmedContext) {
    lines.push(`Context: ${trimmedContext}`);
  }

  lines.push(
    "Please explain the nuance, likely usage, register, close alternatives, and how this translation differs from similar options."
  );

  return lines.join("\n");
}
