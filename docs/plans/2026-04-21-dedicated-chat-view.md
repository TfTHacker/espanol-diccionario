# Dedicated Spanish Learning Chat View Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a dedicated chat view for Spanish-learning conversations, with its own system prompt setting and easy handoff of generated text into the Spanish TTS practice view.

**Architecture:** Reuse the existing chat provider and most of the UI/chat state logic, but extract the dictionary-coupled pieces from `ChatController` so it can power both the dictionary inline chat and a new standalone chat view. The new view should keep chat history/messages local to the view session, while prompt history and a dedicated system prompt live in plugin settings.

**Tech Stack:** Obsidian `ItemView`, existing OpenAI-compatible chat provider, existing TTS practice view activation flow, plugin settings persistence, MarkdownRenderer.

---

## UX recommendation

Use this as the default UX unless Chris objects:

1. **New command + view**
   - Command: `Open Spanish chat`
   - New tab view titled `Spanish Chat`
   - Icon: chat/message-oriented, distinct from dictionary and TTS practice

2. **Dedicated chat prompting model**
   - Separate setting: `Spanish chat system prompt`
   - Keep existing dictionary chat system prompt unchanged so dictionary lookup chat stays focused on word-specific help

3. **Per-message TTS handoff, not full-thread export**
   - Every assistant message gets a small action row:
     - `Send to TTS`
     - optional future: `Copy`, `Insert into note`
   - `Send to TTS` should strip markdown to readable plain text where practical, then open/focus the TTS practice view with that text loaded
   - This is the simplest and lowest-friction flow for “generate dialogue, then practice listening”

4. **Optional selected-text handoff in chat message bubbles**
   - Nice-to-have, not required in v1
   - If selected text inside an assistant message is hard to capture robustly, prefer shipping with whole-message `Send to TTS` first

5. **Starter prompts in empty state**
   - Add 3–4 clickable prompt chips such as:
     - `Roleplay ordering coffee in Madrid`
     - `Beginner conversation at the train station`
     - `Slow A2 dialogue about daily routine`
     - `Correct my Spanish politely`
   - This makes the dedicated view feel purpose-built instead of like a generic raw chat box

---

## Files likely involved

- Modify: `src/main.ts`
- Modify: `src/constants.ts`
- Modify: `src/settings.ts`
- Refactor/Modify: `src/ui/chat-controller.ts`
- Create: `src/ui/spanish-chat-view.ts`
- Possibly create: `src/ui/chat-state.ts` or `src/ui/chat-message-actions.ts`
- Modify: `styles.css`
- Modify: `README.md`
- Add tests: `tests/tts-practice-state.test.ts` and new chat-state/controller helper tests as needed

---

## Task 1: Add new settings for dedicated Spanish chat

**Objective:** Introduce settings needed for the dedicated chat view without changing existing dictionary chat behavior.

**Files:**
- Modify: `src/settings.ts`

**Step 1: Write failing test**
- If settings tests do not exist, add a small normalization helper test file around new settings defaults and normalization.
- Verify:
  - `spanishChatSystemPrompt` defaults to a Spanish-learning-oriented prompt
  - optional `spanishChatStarterPrompts` defaults to 3–4 strings if we decide to persist them

**Step 2: Run test to verify failure**
- Run the targeted test.
- Expected: missing property/default/normalization failure.

**Step 3: Write minimal implementation**
- Add new `PluginSettings` key:
  - `spanishChatSystemPrompt: string`
- Add default text tuned for freeform Spanish conversation practice, correction, and dialogue generation.
- Add normalization wiring.
- Add a dedicated settings textarea labeled something like:
  - `Spanish chat system prompt`
  - description should explain this powers the standalone chat view, not dictionary word lookup chat

**Step 4: Run test to verify pass**
- Run targeted test and then `npm run typecheck`.

**Step 5: Commit**
```bash
git add src/settings.ts tests/<new-settings-test>.ts
git commit -m "feat: add dedicated Spanish chat settings"
```

---

## Task 2: Decouple chat logic from dictionary-only context

**Objective:** Make chat UI logic reusable by both the dictionary view and the new dedicated chat view.

**Files:**
- Modify: `src/ui/chat-controller.ts`
- Possibly create: `src/ui/chat-state.ts`
- Test: new helper tests if extracting pure functions

**Step 1: Write failing test**
- Add a helper-level test for whichever pure function you extract, for example:
  - building effective system prompt from base prompt + optional dictionary context
  - deciding whether message actions should show `Send to TTS`
  - converting markdown-ish assistant output into TTS-friendly text

**Step 2: Run test to verify failure**
- Run the targeted test.
- Expected: helper/function missing.

**Step 3: Write minimal implementation**
- Refactor `ChatController` so it can accept configuration such as:
  - `getSystemPrompt()` instead of assuming `settings().systemPrompt`
  - `getContextBlock()` so dictionary view can still inject word context, while standalone chat returns empty string
  - `placeholderText`
  - `emptyState` / starter prompt behavior
  - optional message action callback like `onSendAssistantMessageToTts(text)`
- Keep dictionary view behavior unchanged.

**Step 4: Run test to verify pass**
- Run helper tests and `npm run typecheck`.

**Step 5: Commit**
```bash
git add src/ui/chat-controller.ts src/ui/chat-state.ts tests/<helper-tests>.ts
git commit -m "refactor: make chat controller reusable across views"
```

---

## Task 3: Add the standalone Spanish chat view shell

**Objective:** Create a new Obsidian view that hosts the reusable chat controller in a dedicated tab.

**Files:**
- Create: `src/ui/spanish-chat-view.ts`
- Modify: `src/constants.ts`
- Modify: `src/main.ts`

**Step 1: Write failing test**
- If view registration is hard to unit test, write a small helper test for view-type constants or activation helper logic.
- Otherwise rely on typecheck + live verification for this wiring step.

**Step 2: Run test to verify failure**
- Run targeted test or typecheck if helper-based.

**Step 3: Write minimal implementation**
- Add constant such as:
  - `VIEW_TYPE_SPANISH_CHAT = "espanol-diccionario-spanish-chat"`
- Create `SpanishChatView extends ItemView`
- Build a layout similar to the lower half of dictionary chat, but full-tab:
  - toolbar/model label
  - starter prompt chips / empty state
  - chat transcript area
  - input and send actions
- Register the view in `main.ts`
- Add command:
  - `open-spanish-chat`
  - name: `Open Spanish chat`
- Add an activation helper similar to `activateTtsPracticeView()`

**Step 4: Run test to verify pass**
- Run `npm run typecheck`.

**Step 5: Commit**
```bash
git add src/ui/spanish-chat-view.ts src/constants.ts src/main.ts
git commit -m "feat: add dedicated Spanish chat view"
```

---

## Task 4: Add assistant-message handoff to TTS practice

**Objective:** Make generated dialogue easy to send from the dedicated chat view into the TTS practice view.

**Files:**
- Modify: `src/ui/chat-controller.ts`
- Modify: `src/ui/spanish-chat-view.ts`
- Possibly modify: `src/main.ts`
- Test: helper tests for text extraction/normalization

**Step 1: Write failing test**
- Add a pure-function test for `assistantMessageToPracticeText(markdown)` or equivalent.
- Verify it:
  - preserves readable dialogue text
  - strips obvious markdown artifacts like heading markers or bullet syntax where appropriate
  - keeps line breaks useful for dialogue practice

**Step 2: Run test to verify failure**
- Run the targeted test.
- Expected: function missing/failing.

**Step 3: Write minimal implementation**
- Add message action UI on assistant messages in the standalone chat view:
  - button text: `Send to TTS`
- When clicked:
  - derive TTS-friendly text from the assistant message
  - call existing plugin helper to open/focus TTS practice and preload text
  - show a small notice/status confirming the handoff
- Prefer whole-message handoff in v1.
- If low-cost, add a second action later for `Send selected text to TTS`.

**Step 4: Run test to verify pass**
- Run targeted helper test and `npm run typecheck`.

**Step 5: Commit**
```bash
git add src/ui/chat-controller.ts src/ui/spanish-chat-view.ts tests/<tts-handoff-test>.ts
git commit -m "feat: send chat dialogue to TTS practice"
```

---

## Task 5: Add starter prompts and dedicated copy

**Objective:** Make the dedicated view feel optimized for Spanish-learning conversations, not generic chat.

**Files:**
- Modify: `src/ui/spanish-chat-view.ts`
- Possibly modify: `src/settings.ts`
- Modify: `styles.css`

**Step 1: Write failing test**
- If you extract starter prompt helpers, add a tiny pure-function test.
- Otherwise this task is mostly UI and should be verified live.

**Step 2: Run test to verify failure**
- Run helper test if added.

**Step 3: Write minimal implementation**
- Add empty-state helper text and prompt chips.
- Use dedicated placeholder text like:
  - `Practice a Spanish conversation, ask for corrections, or generate dialogue...`
- Make `Send to TTS` visually nearby but not noisy.
- Reuse existing chat styling where possible; only add view-specific styles where necessary.

**Step 4: Run verification**
- `npm run typecheck`
- `npm run build`

**Step 5: Commit**
```bash
git add src/ui/spanish-chat-view.ts styles.css src/settings.ts
git commit -m "feat: add Spanish chat prompts and UX polish"
```

---

## Task 6: Update documentation

**Objective:** Document the new dedicated Spanish chat workflow and TTS handoff.

**Files:**
- Modify: `README.md`
- Optionally modify: `agent.md`

**Step 1: Update README**
- Add the dedicated chat view to the feature list.
- Add usage notes explaining:
  - standalone conversation practice
  - dedicated system prompt
  - `Send to TTS` workflow for generated dialogues

**Step 2: Verify**
- Check README wording stays concise.

**Step 3: Commit**
```bash
git add README.md
git commit -m "docs: describe dedicated Spanish chat workflow"
```

---

## Task 7: Live verification in real Obsidian

**Objective:** Verify the new view and TTS handoff in the actual desktop app.

**Files:**
- Build output deployed to: `/srv/shared_data/ob-sync/nexus/.obsidian/plugins/espanol-diccionario/`

**Step 1: Build and deploy**
```bash
cd /srv/shared_data/dev/spanish-dictionary
npm run typecheck
npm run build
cp main.js manifest.json styles.css /srv/shared_data/ob-sync/nexus/.obsidian/plugins/espanol-diccionario/
touch /srv/shared_data/ob-sync/nexus/.obsidian/plugins/espanol-diccionario/.hotreload
sudo -u kunicki env XDG_RUNTIME_DIR=/run/user/1000 HOME=/home/kunicki /home/kunicki/.local/bin/obsidian reload
```

**Step 2: Verify view opens**
- Open `Open Spanish chat`
- Confirm a dedicated tab/view appears
- Confirm no runtime errors via `obsidian dev:errors`

**Step 3: Verify basic chat flow**
- Send a prompt like `Write a short A2-level dialogue between two friends meeting at a café in Madrid.`
- Confirm assistant response streams/renders correctly

**Step 4: Verify TTS handoff**
- Click `Send to TTS` on the assistant message
- Confirm TTS practice view opens/focuses with the generated dialogue loaded
- Confirm the text is readable and suitable for playback without obvious markdown junk

**Step 5: Regression check**
- Open dictionary view
- Confirm dictionary inline chat still works
- Confirm existing word-context chat suggestions still work

**Step 6: Final commit**
```bash
git add .
git commit -m "feat: add dedicated Spanish chat view"
```

---

## Acceptance criteria

- New command opens a standalone `Spanish Chat` view.
- Dedicated Spanish chat uses its own settings-backed system prompt.
- Dictionary chat remains intact and still uses word context.
- Assistant messages in the standalone chat can be sent to TTS practice with one obvious action.
- TTS practice receives useful text for playback.
- Build/typecheck pass.
- Live Obsidian verification passes on the desktop session.

---

## Recommended implementation order summary

1. settings
2. reusable chat controller refactor
3. standalone view registration
4. TTS handoff action
5. UX polish/starter prompts
6. docs
7. live verification
