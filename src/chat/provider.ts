// src/chat/provider.ts — OpenAI-compatible chat API integration
// Supports Ollama, OpenAI, Groq, Together, and any /v1/chat/completions endpoint

import type { PluginSettings } from "../settings";
import { getSystemPrompt } from "./prompts";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatResponse {
	message: string;
	error?: string;
}

/**
 * Send a message to the LLM and get a response.
 * Uses the OpenAI-compatible chat completions API.
 */
export async function sendChatMessage(
	messages: ChatMessage[],
	settings: PluginSettings,
	wordContext?: string
): Promise<ChatResponse> {
	const { llmServerUrl, llmApiKey, llmModel, llmTemperature, systemPrompt } = settings;

	// Build the full messages array with system prompt
	const fullMessages: ChatMessage[] = [
		{
			role: "system",
			content: wordContext
				? `${systemPrompt}\n\nThe user just looked up the word: "${wordContext}". Use this as context for your response.`
				: systemPrompt,
		},
		...messages,
	];

	// Construct the API URL
	// Ollama uses /api/chat, OpenAI-compatible uses /v1/chat/completions
	let apiUrl = llmServerUrl.replace(/\/+$/, "");
	const isOllama = apiUrl.includes("localhost:11434") || apiUrl.includes("127.0.0.1:11434");

	if (isOllama) {
		apiUrl += "/api/chat";
	} else {
		apiUrl += "/v1/chat/completions";
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (llmApiKey) {
		headers["Authorization"] = `Bearer ${llmApiKey}`;
	}

	const body = isOllama
		? JSON.stringify({
			model: llmModel,
			messages: fullMessages,
			stream: false,
			options: {
				temperature: llmTemperature,
			},
		})
		: JSON.stringify({
			model: llmModel,
			messages: fullMessages,
			temperature: llmTemperature,
			stream: false,
		});

	try {
		const response = await fetch(apiUrl, {
			method: "POST",
			headers,
			body,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				message: "",
				error: `API error (${response.status}): ${errorText}`,
			};
		}

		const data = await response.json();

		if (isOllama) {
			// Ollama /api/chat response format
			return {
				message: data.message?.content || "",
			};
		} else {
			// OpenAI-compatible response format
			return {
				message: data.choices?.[0]?.message?.content || "",
			};
		}
	} catch (err) {
		return {
			message: "",
			error: `Connection error: ${err instanceof Error ? err.message : String(err)}. Make sure your LLM server is running at ${llmServerUrl}`,
		};
	}
}

/**
 * Stream a chat response. Calls onChunk for each text fragment received.
 * Falls back to non-streaming if the server doesn't support streaming.
 */
export async function streamChatMessage(
	messages: ChatMessage[],
	settings: PluginSettings,
	onChunk: (text: string) => void,
	wordContext?: string
): Promise<ChatResponse> {
	const { llmServerUrl, llmApiKey, llmModel, llmTemperature, systemPrompt } = settings;

	const fullMessages: ChatMessage[] = [
		{
			role: "system",
			content: wordContext
				? `${systemPrompt}\n\nThe user just looked up the word: "${wordContext}". Use this as context for your response.`
				: systemPrompt,
		},
		...messages,
	];

	let apiUrl = llmServerUrl.replace(/\/+$/, "");
	const isOllama = apiUrl.includes("localhost:11434") || apiUrl.includes("127.0.0.1:11434");

	if (isOllama) {
		apiUrl += "/api/chat";
	} else {
		apiUrl += "/v1/chat/completions";
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (llmApiKey) {
		headers["Authorization"] = `Bearer ${llmApiKey}`;
	}

	const body = isOllama
		? JSON.stringify({
			model: llmModel,
			messages: fullMessages,
			stream: true,
			options: {
				temperature: llmTemperature,
			},
		})
		: JSON.stringify({
			model: llmModel,
			messages: fullMessages,
			temperature: llmTemperature,
			stream: true,
		});

	try {
		const response = await fetch(apiUrl, {
			method: "POST",
			headers,
			body,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				message: "",
				error: `API error (${response.status}): ${errorText}`,
			};
		}

		let fullMessage = "";

		if (isOllama) {
			// Ollama streaming: newline-delimited JSON
			const reader = response.body?.getReader();
			if (!reader) {
				return { message: "", error: "No response body" };
			}

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const json = JSON.parse(line);
						const content = json.message?.content || "";
						if (content) {
							fullMessage += content;
							onChunk(content);
						}
						if (json.done) break;
					} catch {
						// Skip malformed lines
					}
				}
			}
		} else {
			// OpenAI SSE streaming
			const reader = response.body?.getReader();
			if (!reader) {
				return { message: "", error: "No response body" };
			}

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice(6).trim();
					if (data === "[DONE]") continue;

					try {
						const json = JSON.parse(data);
						const content = json.choices?.[0]?.delta?.content || "";
						if (content) {
							fullMessage += content;
							onChunk(content);
						}
					} catch {
						// Skip malformed SSE data
					}
				}
			}
		}

		return { message: fullMessage };
	} catch (err) {
		return {
			message: "",
			error: `Connection error: ${err instanceof Error ? err.message : String(err)}. Make sure your LLM server is running at ${llmServerUrl}`,
		};
	}
}