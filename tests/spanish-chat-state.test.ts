import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SPANISH_CHAT_STARTERS,
  assistantMessageToPracticeText,
  shouldSubmitSpanishChatPrompt,
} from "../src/ui/spanish-chat-state";

test("DEFAULT_SPANISH_CHAT_STARTERS exposes several Spanish-learning prompt ideas", () => {
  assert.ok(DEFAULT_SPANISH_CHAT_STARTERS.length >= 4);
  assert.ok(DEFAULT_SPANISH_CHAT_STARTERS.some((item) => item.includes("Madrid")));
});

test("assistantMessageToPracticeText strips common markdown formatting but keeps readable dialogue lines", () => {
  const markdown = `## Café en Madrid\n\n**Lucía:** Hola, ¿qué tal?\n- **Mario:** Muy bien, gracias.\n- *Lucía:* ¿Tomamos un café?\n\n[Nota](https://example.com)`;

  assert.equal(
    assistantMessageToPracticeText(markdown),
    "Café en Madrid\n\nLucía: Hola, ¿qué tal?\nMario: Muy bien, gracias.\nLucía: ¿Tomamos un café?\n\nNota"
  );
});

test("assistantMessageToPracticeText removes fenced code blocks and collapses extra blank lines", () => {
  const markdown = `Hola.\n\n\
\`\`\`text\nNo leer esto\n\`\`\`\n\nAdiós.`;
  assert.equal(assistantMessageToPracticeText(markdown), "Hola.\n\nAdiós.");
});

test("assistantMessageToPracticeText wraps inline English translation hints in dashes so TTS skips them", () => {
  const markdown = `Tú: “Un café con leche, por favor.” (A coffee with milk, please.)\nBarista: “Claro. ¿Algo más?” (Of course. Anything else?)`;
  assert.equal(
    assistantMessageToPracticeText(markdown),
    "Tú: Un café con leche, por favor. —A coffee with milk, please.—\nBarista: Claro. ¿Algo más? —Of course. Anything else?—"
  );
});


test("assistantMessageToPracticeText preserves standalone bilingual glosses by wrapping the English in dashes", () => {
  const markdown = `Hola amigo (Hello friend)`;
  assert.equal(assistantMessageToPracticeText(markdown), "Hola amigo —Hello friend—");
});

test("assistantMessageToPracticeText wraps English labels before colons so TTS skips them too", () => {
  const markdown = `English: hola amigo\nTranslation: buenos días`;
  assert.equal(
    assistantMessageToPracticeText(markdown),
    "—English—: hola amigo\n—Translation—: buenos días"
  );
});

test("assistantMessageToPracticeText keeps Spanish speaker labels unwrapped", () => {
  const markdown = `Tú: Hola\nBarista: Buenos días`;
  assert.equal(assistantMessageToPracticeText(markdown), "Tú: Hola\nBarista: Buenos días");
});

test("shouldSubmitSpanishChatPrompt uses Enter to send and Ctrl/Alt+Enter for newline", () => {
  assert.equal(shouldSubmitSpanishChatPrompt({ key: "Enter", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), true);
  assert.equal(shouldSubmitSpanishChatPrompt({ key: "Enter", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), false);
  assert.equal(shouldSubmitSpanishChatPrompt({ key: "Enter", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }), false);
  assert.equal(shouldSubmitSpanishChatPrompt({ key: "Enter", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false }), true);
  assert.equal(shouldSubmitSpanishChatPrompt({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), false);
});
