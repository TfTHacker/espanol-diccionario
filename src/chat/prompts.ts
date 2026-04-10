// src/chat/prompts.ts — System prompt & message templates

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful Spanish language tutor specializing in Castilian (Spain) Spanish.
When the user looks up a word, provide additional context, usage notes, and example
sentences. Always use Spain Spanish conventions (vosotros, distinción, etc.).
When explaining grammar, be clear and give practical examples. Respond in the same
language the user writes in (English or Spanish).`;

/**
 * Get the system prompt for the chat.
 * If a custom prompt is provided, use it; otherwise use the default.
 */
export function getSystemPrompt(customPrompt?: string): string {
	return customPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
}

/**
 * Generate a prompt asking about a specific word
 */
export function wordContextPrompt(word: string, pos?: string, definitions?: string[]): string {
	let prompt = `Tell me more about the Spanish word "${word}".`;
	if (pos) {
		prompt += ` It's a ${pos}.`;
	}
	if (definitions && definitions.length > 0) {
		prompt += ` Its definitions include: ${definitions.join("; ")}.`;
	}
	prompt += ` Please explain its usage, common expressions, and any grammar notes relevant to a learner.`;
	return prompt;
}

/**
 * Generate a grammar question prompt
 */
export function grammarQuestionPrompt(question: string): string {
	return question;
}