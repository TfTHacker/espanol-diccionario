import type EspañolDiccionarioPlugin from "../main";
import { VIEW_TYPE_DICTIONARY, VIEW_TYPE_SPANISH_CHAT, VIEW_TYPE_TTS_PRACTICE, VIEW_TYPE_TRANSLATOR } from "../constants";
import { SHORTCUT_LABELS, titleWithShortcut } from "./keyboard-shortcuts";

export type FeatureShortcutViewType =
	| typeof VIEW_TYPE_DICTIONARY
	| typeof VIEW_TYPE_SPANISH_CHAT
	| typeof VIEW_TYPE_TTS_PRACTICE
	| typeof VIEW_TYPE_TRANSLATOR;

export interface FeatureShortcutDefinition {
	viewType: FeatureShortcutViewType;
	label: string;
	title: string;
	icon: string;
}

export const FEATURE_SHORTCUTS: FeatureShortcutDefinition[] = [
	{
		viewType: VIEW_TYPE_DICTIONARY,
		label: "Dictionary",
		title: titleWithShortcut("Open dictionary", SHORTCUT_LABELS.dictionaryOpen),
		icon: "🔎",
	},
	{
		viewType: VIEW_TYPE_SPANISH_CHAT,
		label: "Chat",
		title: titleWithShortcut("Open Spanish chat", SHORTCUT_LABELS.spanishChatOpen),
		icon: "💬",
	},
	{
		viewType: VIEW_TYPE_TTS_PRACTICE,
		label: "TTS",
		title: titleWithShortcut("Open Spanish TTS practice", SHORTCUT_LABELS.ttsPracticeOpen),
		icon: "🔊",
	},
	{
		viewType: VIEW_TYPE_TRANSLATOR,
		label: "Translator",
		title: titleWithShortcut("Open translator", SHORTCUT_LABELS.translatorOpen),
		icon: "↔",
	},
];

export function renderFeatureShortcuts(
	parentEl: HTMLElement,
	plugin: EspañolDiccionarioPlugin,
	activeViewType: FeatureShortcutViewType,
): HTMLElement {
	const groupEl = parentEl.createDiv({
		cls: "ed-feature-shortcuts",
		attr: {
			"aria-label": "Open Español Diccionario feature",
			title: "Open another Español Diccionario feature",
		},
	});

	for (const shortcut of FEATURE_SHORTCUTS) {
		const isActive = shortcut.viewType === activeViewType;
		const button = groupEl.createEl("button", {
			cls: `ed-feature-shortcut-btn${isActive ? " ed-feature-shortcut-active" : ""}`,
			attr: {
				type: "button",
				title: shortcut.title,
				"aria-label": shortcut.title,
				"aria-current": isActive ? "page" : "false",
			},
		});
		button.setText(shortcut.icon);
		button.addEventListener("click", () => {
			void openFeatureShortcut(plugin, shortcut.viewType);
		});
	}

	return groupEl;
}

async function openFeatureShortcut(plugin: EspañolDiccionarioPlugin, viewType: FeatureShortcutViewType): Promise<void> {
	if (viewType === VIEW_TYPE_DICTIONARY) {
		await plugin.activateView();
		return;
	}
	if (viewType === VIEW_TYPE_SPANISH_CHAT) {
		await plugin.activateSpanishChatView();
		return;
	}
	if (viewType === VIEW_TYPE_TTS_PRACTICE) {
		await plugin.activateTtsPracticeView();
		return;
	}
	await plugin.activateTranslatorView();
}
