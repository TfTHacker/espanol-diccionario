// src/chat/provider.ts — OpenAI-compatible chat API integration
// Supports Ollama, OpenAI, Groq, Together, and any /v1/chat/completions endpoint
// Uses requestUrl for non-streaming (CORS-safe), fetch for streaming with fallback

import { requestUrl, Platform } from "obsidian";
import type { PluginSettings } from "../settings";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatResponse {
	message: string;
	error?: string;
}

/**
 * Build the full API URL from the user's server URL setting.
 * Handles common patterns:
 *   - "http://localhost:11434" (local Ollama → /api/chat)
 *   - "https://api.ollama.com" or "https://api.ollama.com/v1" (cloud → /v1/chat/completions)
 *   - "https://api.openai.com/v1" (OpenAI → /v1/chat/completions)
 *   - "https://api.groq.com/openai/v1" (Groq → /openai/v1/chat/completions)
 * 
 * Avoids double-path bugs like "/v1/v1/chat/completions".
 */
function buildApiUrl(serverUrl: string): { url: string; isOllama: boolean } {
	const base = serverUrl.replace(/\/+$/, "");
	const isOllama = base.includes("localhost:11434") || base.includes("127.0.0.1:11434");

	// If the URL already ends with a full chat/completions path, use as-is
	if (base.endsWith("/chat/completions") || base.endsWith("/api/chat")) {
		return { url: base, isOllama };
	}

	if (isOllama) {
		// Local Ollama uses its own /api/chat endpoint
		return { url: `${base}/api/chat`, isOllama };
	}

	// OpenAI-compatible services
	// If URL already ends with /v1 or similar versioned path, just append /chat/completions
	if (/\/v?\d+$/.test(base)) {
		return { url: `${base}/chat/completions`, isOllama };
	}

	// Otherwise append the full /v1/chat/completions path
	return { url: `${base}/v1/chat/completions`, isOllama };
}

/**
 * Send a message to the LLM and get a response (non-streaming).
 * Uses Obsidian's requestUrl for cross-platform / CORS compatibility.
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
				? `${systemPrompt}\n\n${wordContext}`
				: systemPrompt,
		},
		...messages,
	];

	const { url: apiUrl, isOllama } = buildApiUrl(llmServerUrl);

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
		const response = await requestUrl({
			url: apiUrl,
			method: "POST",
			headers,
			body,
		});

		if (response.status >= 400) {
			const errorText = typeof response.text === "string" ? response.text : JSON.stringify(response.json);
			return {
				message: "",
				error: `API error (${response.status}): ${errorText}`,
			};
		}

		const data = response.json;

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
		const errMsg = err instanceof Error ? err.message : String(err);
		return {
			message: "",
			error: `Connection error: ${errMsg}. Make sure your LLM server is reachable at ${llmServerUrl}`,
		};
	}
}

/**
 * Stream a chat response. Uses requestUrl (non-streaming) for reliability.
 * On desktop with local Ollama, tries fetch streaming for real-time token display.
 */
export async function streamChatMessage(
	messages: ChatMessage[],
	settings: PluginSettings,
	onChunk: (text: string) => void,
	wordContext?: string
): Promise<ChatResponse> {
	const { llmServerUrl } = settings;
	const isLocalOllama = llmServerUrl.includes("localhost:11434") || llmServerUrl.includes("127.0.0.1:11434");

	// Try streaming with fetch only for local Ollama (no CORS issues)
	if (isLocalOllama && !Platform.isMobile) {
		try {
			const response = await streamWithFetch(messages, settings, onChunk, wordContext);
			if (!response.error) {
				return response;
			}
		} catch {
			// Streaming failed, fall through to requestUrl
		}
	}

	// Use requestUrl (reliable, CORS-safe)
	const response = await sendChatMessage(messages, settings, wordContext);
	if (response.message) {
		onChunk(response.message);
	}
	return response;
}

/**
 * Internal: stream using fetch (desktop Electron only).
 */
async function streamWithFetch(
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
				? `${systemPrompt}\n\n${wordContext}`
				: systemPrompt,
		},
		...messages,
	];

	const { url: apiUrl, isOllama } = buildApiUrl(llmServerUrl);

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
		// Throw so streamChatMessage can fall back to requestUrl
		throw new Error(`Streaming failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}