export type TranslatorLanguage = "en" | "es";

export interface TranslatorPromptSpec {
	text: string;
	sourceLanguage?: TranslatorLanguage;
}

export interface TranslatorResult {
	sourceLanguage: TranslatorLanguage;
	targetLanguage: TranslatorLanguage;
	translation: string;
}

export function getOppositeTranslatorLanguage(language: TranslatorLanguage): TranslatorLanguage {
	return language === "en" ? "es" : "en";
}

export function getTranslatorLanguageName(language: TranslatorLanguage): string {
	return language === "en" ? "English" : "Spanish";
}

export function getTranslatorTtsLocale(language: TranslatorLanguage): "en-US" | "es-ES" {
	return language === "en" ? "en-US" : "es-ES";
}

export function guessTranslatorSourceLanguage(text: string): TranslatorLanguage | undefined {
	const normalized = text.trim().toLowerCase();
	if (!normalized) return undefined;
	if (/[áéíóúüñ¿¡]/i.test(normalized)) return "es";
	const spanishMarkers = /\b(el|la|los|las|un|una|unos|unas|de|del|que|por|para|con|sin|hola|gracias|buenos|buenas|estoy|estás|usted|vosotros|quiero|tengo|soy|eres|cómo|dónde|cuándo)\b/i;
	if (spanishMarkers.test(normalized)) return "es";
	const englishMarkers = /\b(the|a|an|and|or|but|with|without|hello|thanks|thank|please|where|when|how|what|why|i|you|we|they|want|have|am|are|is)\b/i;
	if (englishMarkers.test(normalized)) return "en";
	return undefined;
}

export function buildTranslatorPrompt(spec: TranslatorPromptSpec): string {
	const text = spec.text.trim();
	const hint = spec.sourceLanguage
		? `The input appears to be ${getTranslatorLanguageName(spec.sourceLanguage)}. Translate it to ${getTranslatorLanguageName(getOppositeTranslatorLanguage(spec.sourceLanguage))}.`
		: "Detect whether the input is English or Spanish, then translate it to the other language.";

	return `${hint}\n\nReturn only compact JSON with these exact keys:\n{"sourceLanguage":"en|es","targetLanguage":"en|es","translation":"..."}\n\nRules:\n- sourceLanguage must be "en" for English or "es" for Spanish.\n- targetLanguage must be the opposite language.\n- translation should be natural, concise, and use Castilian Spanish when translating to Spanish.\n- No markdown, no commentary, no code fence.\n\nInput:\n${JSON.stringify(text)}`;
}

export function parseTranslatorResponse(raw: string, fallbackSource?: TranslatorLanguage): TranslatorResult | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const jsonText = extractJsonObject(trimmed);
	try {
		const parsed = JSON.parse(jsonText) as Partial<TranslatorResult>;
		const source = parsed.sourceLanguage === "en" || parsed.sourceLanguage === "es"
			? parsed.sourceLanguage
			: fallbackSource;
		const target = parsed.targetLanguage === "en" || parsed.targetLanguage === "es"
			? parsed.targetLanguage
			: source
				? getOppositeTranslatorLanguage(source)
				: undefined;
		const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
		if (!source || !target || source === target || !translation) return null;
		return { sourceLanguage: source, targetLanguage: target, translation };
	} catch {
		return null;
	}
}

function extractJsonObject(text: string): string {
	const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
	if (fenced) return fenced[1].trim();
	const first = text.indexOf("{");
	const last = text.lastIndexOf("}");
	if (first >= 0 && last > first) return text.slice(first, last + 1);
	return text;
}

export function buildTranslationBreakdownPrompt(inputText: string, result: TranslatorResult): string {
	const sourceName = getTranslatorLanguageName(result.sourceLanguage);
	const targetName = getTranslatorLanguageName(result.targetLanguage);
	return `Break down this ${sourceName} → ${targetName} translation for an English-speaking Spanish learner.\n\nInput (${sourceName}): ${inputText.trim()}\nTranslation (${targetName}): ${result.translation}\n\nInclude:\n- A short natural-language explanation of the phrase.\n- Word-by-word notes for important grammar/vocabulary.\n- Leipzig glossing for the phrase, with aligned lines: original, morpheme-by-morpheme gloss, and idiomatic translation.\n- Keep it concise and learner-friendly.`;
}
