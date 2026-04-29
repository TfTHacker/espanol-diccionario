const NO_INLINE_FOLLOW_UP_INSTRUCTION = `Do not include meta follow-up offers or suggested next questions in the assistant response, such as "Would you like...", "Do you want me to...", or "I can also...". The app renders separate Continue suggestions after the response, so end with the answer itself.`;

export function buildChatSystemMessage(systemPrompt: string, wordContext?: string): string {
	return [systemPrompt, NO_INLINE_FOLLOW_UP_INSTRUCTION, wordContext]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join("\n\n");
}
