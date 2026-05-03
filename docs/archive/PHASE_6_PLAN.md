# Phase 6 Implementation Plan: Persistence, Settings & Token Tracking

## Status

Several Phase 6 items are **already complete**:

- **`localStorage` sync for API key and model** — `store.tsx:42–67` already reads/writes both on change.
- **`usageMetadata` capture in `GoogleGenAIAdapter`** — `GoogleGenAIAdapter.ts:75–83` (non-streaming) and `:153–162` (streaming) already call `onUsageUpdate`.
- **Token display** — `ChatSidebar.tsx:226` already renders `Tokens: {totalTokens}` in the header.

The remaining work is a **Settings UI** that lets users change their API key and select a model after initial setup.

---

## Task 1: `SettingsDialog` component

**Goal:** A modal dialog reachable via a gear icon in the sidebar header. Lets the user update the API key and switch models without reloading the page.

### 1a. Create `src/components/SettingsDialog.tsx`

Props:

```typescript
interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Internal state (local copies, only committed to the store on Save):

- `draftKey: string` — initialised from `apiKey ?? ""`
- `draftModel: string` — initialised from `modelName`
- `showKey: boolean` — toggles password visibility

UI elements:

- **API Key field** — `<Input type={showKey ? "text" : "password"}>` with an Eye/EyeOff icon button
- **Model selector** — native `<select>` styled with Tailwind, options:
  - `gemini-2.5-flash` (label: "Gemini 2.5 Flash")
  - `gemini-2.5-pro` (label: "Gemini 2.5 Pro")
  - `gemini-3.1-flash-lite-preview` (label: "Gemini 3.1 Flash Lite (Preview)")
  - `gemini-3.1-pro-preview` (label: "Gemini 3.1 Pro (Preview)")
  - `gemini-3-flash-preview` (label: "Gemini 3 Flash (Preview)")
- **Save** button — calls `setApiKey(draftKey)`, `setModelName(draftModel)`, closes dialog
- **Cancel** button — closes without saving

On open, reset drafts to current store values (use a `useEffect` keyed on `open`).

### 1b. Wire into `ChatSidebar`

- Import `Settings` icon from `lucide-react`
- Add a gear `<Button variant="ghost" size="icon">` next to the "AI Assistant" heading
- Manage `settingsOpen` state locally in `ChatSidebar`
- Render `<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />`

---

## Task 2: Tests for `SettingsDialog`

File: `src/components/SettingsDialog.test.tsx`

Use `@testing-library/react` + `vitest`. Wrap renders in `AppProvider`.

Test cases:

- Renders API key input and model selector when open
- Save button calls `setApiKey` and `setModelName` with draft values
- Cancel button closes without updating the store
- Show/hide key toggle changes input type between `password` and `text`
- Draft resets to current store values when dialog is reopened

---

## Execution order

1. Create `src/components/SettingsDialog.tsx`
2. Update `src/components/ChatSidebar.tsx` to add gear icon and render `SettingsDialog`
3. Write `src/components/SettingsDialog.test.tsx`
4. Run `npm run test`, `npm run lint`, `npm run format`
5. Manual test: change model and API key via settings, verify persistence after reload
6. Wait for user approval before committing

---

## Working state (acceptance criteria)

- Gear icon visible in sidebar header; clicking it opens the Settings dialog
- User can update API key and model; changes take effect immediately (new `AgentRunner` is created via the `useMemo` in `App.tsx`)
- Settings persist across page reloads via `localStorage`
- Token count accumulates visibly in sidebar header during a session
- All tests pass; no lint or type errors
