export const SHORTCUT_LABELS = {
	dictionaryOpen: "Alt+1",
	spanishChatOpen: "Alt+2",
	ttsPracticeOpen: "Alt+3",
	translatorOpen: "Alt+4",
	dictionaryBack: "Alt+←",
	dictionaryForward: "Alt+→",
	dictionaryRecents: "Alt+R",
	dictionaryToggleChat: "Alt+C",
	dictionarySearch: "Enter",
	chatHistory: "Alt+R",
	chatFontDown: "Alt+-",
	chatFontUp: "Alt+=",
	chatClear: "Alt+Backspace",
	chatSend: "Ctrl+Enter",
	ttsPlay: "Alt+P",
	ttsPause: "Alt+E",
	ttsStop: "Alt+S",
	ttsRepeat: "Alt+A",
	ttsHistory: "Alt+R",
	ttsClearHistory: "Alt+Backspace",
	ttsClearText: "Alt+C",
	ttsInsertFile: "Alt+F",
	translatorTranslate: "Alt+T",
	translatorPlayInput: "Alt+I",
	translatorPlayTranslation: "Alt+O",
	translatorOpenChat: "Alt+B",
} as const;

export type ShortcutLabel = (typeof SHORTCUT_LABELS)[keyof typeof SHORTCUT_LABELS];

export function titleWithShortcut(title: string, shortcut: ShortcutLabel | string): string {
	return `${title} (${shortcut})`;
}

function hasPlainAltModifier(evt: KeyboardEvent): boolean {
	return evt.altKey && !evt.ctrlKey && !evt.metaKey && !evt.shiftKey;
}

function physicalCodeForKey(key: string): string | null {
	if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
	if (/^[0-9]$/.test(key)) return `Digit${key}`;
	if (key === "-") return "Minus";
	if (key === "=") return "Equal";
	return null;
}

export function isPlainAltShortcut(evt: KeyboardEvent, key: string): boolean {
	if (!hasPlainAltModifier(evt)) return false;
	if (evt.key.toLowerCase() === key.toLowerCase()) return true;
	const expectedCode = physicalCodeForKey(key);
	return expectedCode !== null && evt.code === expectedCode;
}

export function isAltBackspace(evt: KeyboardEvent): boolean {
	return hasPlainAltModifier(evt) && evt.key === "Backspace";
}

export function isAltSpace(evt: KeyboardEvent): boolean {
	return hasPlainAltModifier(evt) && (evt.key === " " || evt.key === "Spacebar" || evt.code === "Space");
}

export function getFeatureShortcutNumber(evt: KeyboardEvent): 1 | 2 | 3 | 4 | null {
	if (!hasPlainAltModifier(evt)) return null;
	if (evt.key === "1" || evt.code === "Digit1") return 1;
	if (evt.key === "2" || evt.code === "Digit2") return 2;
	if (evt.key === "3" || evt.code === "Digit3") return 3;
	if (evt.key === "4" || evt.code === "Digit4") return 4;
	return null;
}
