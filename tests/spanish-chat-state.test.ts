import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SPANISH_CHAT_STARTERS,
  assistantMessageToPracticeText,
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

test("assistantMessageToPracticeText strips quoted dialogue wrappers and inline English translation hints", () => {
  const markdown = `Tú: “Un café con leche, por favor.” (A coffee with milk, please.)\nBarista: “Claro. ¿Algo más?” (Of course. Anything else?)`;
  assert.equal(
    assistantMessageToPracticeText(markdown),
    "Tú: Un café con leche, por favor.\nBarista: Claro. ¿Algo más?"
  );
});
