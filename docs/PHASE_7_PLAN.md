# Phase 7 Implementation Plan: Mobile-Friendly Interface

## Goal

Make the application fully usable on small-screen and touch devices. The editor must always remain mounted so the agent tools (`read`, `search`, `edit`, `write`) and the suggestion accept/reject workflow continue to function. Below the `md` breakpoint the chat sidebar becomes a **bottom sheet** that slides up over the editor, leaving the editor always visible and always in the DOM.

---

## Why not tabs

A tab-based approach that hides the editor panel breaks two things:

1. **Agent tools** — `read`, `search`, `get_metadata`, `edit`, and `write` all call Monaco API methods (`getValue`, `findMatches`, etc.) on the editor instance. When Radix `TabsContent` is inactive it sets `hidden=""` on the panel, which causes Monaco to report 0 dimensions and can prevent model operations from working correctly.
2. **Suggestion workflow** — the user must be able to see and interact with the editor (accept/reject inline widgets) while the agent is running in the chat sidebar. Hiding the editor behind a tab makes this impossible.

---

## Chosen approach: bottom sheet for chat on mobile

### Desktop (≥ `md`) — unchanged

The existing side-by-side layout remains. `EditorPanel` keeps its own inner Editor | Preview tabs.

### Mobile (< `md`)

- `EditorPanel` fills the full screen. Its own inner Editor | Preview tabs are preserved and work as before.
- A **floating action button (FAB)** — a chat bubble icon — is pinned to the bottom-right corner of the screen.
- Tapping the FAB opens a **bottom sheet** that slides up and covers roughly 70% of the screen height. The editor is visible and interactive in the remaining space above.
- The bottom sheet contains `ChatSidebar` in full. A close button (chevron-down icon) inside the sheet header dismisses it.
- The editor remains mounted at all times; the sheet is a CSS overlay, not a tab replacement.

### Layout structure on mobile

```
┌──────────────────────────────┐
│  EditorPanel (always mounted)│  ← full screen behind sheet
│  [Editor | Preview tabs]     │
│                              │
│                  [💬 FAB]    │  ← bottom-right, z-50
└──────────────────────────────┘

When sheet is open:
┌──────────────────────────────┐
│  EditorPanel (still mounted) │  ← ~30% visible at top
├──────────────────────────────┤
│  ▼  AI Assistant        [✕] │  ← sheet header with close
│  ChatSidebar                 │  ← ~70% height
└──────────────────────────────┘
```

The sheet is a `fixed` div at the bottom of the viewport, using `transform: translateY` to animate open/closed. No new dependencies needed.

---

## Task 1 — Revert tab-based MobileLayout; implement bottom-sheet layout

**File:** `src/App.tsx`

### Remove

- `MobileLayout` component (the three-tab version)
- `EditorPanel mobileTab` prop usage in `App.tsx`

### Replace `MobileLayout` with

```tsx
function MobileLayout({ conversation, totalTokens }: LayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Editor always mounted, full screen */}
      <div className="h-full w-full">
        <EditorPanel />
      </div>

      {/* FAB */}
      {!sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Bottom sheet overlay */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "70vh" }}
        aria-hidden={!sheetOpen}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium">AI Assistant</span>
          <button
            onClick={() => setSheetOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Close chat"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
        {/* ChatSidebar rendered without its own header (sheet provides it) */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatSidebar conversation={conversation} totalTokens={totalTokens} />
        </div>
      </div>
    </div>
  );
}
```

Import `MessageCircle` and `ChevronDown` from `lucide-react`.

### `DesktopLayout` — unchanged

### `App` component — unchanged (still delegates via `useIsMobile`)

---

## Task 2 — Revert `EditorPanel` mobileTab prop

**File:** `src/components/EditorPanel.tsx`

Remove the `EditorPanelProps` interface and `mobileTab` prop added in the previous (tab-based) implementation. The desktop inner tabs (Editor | Preview) are restored as the only rendering path. The `monacoPanel` extracted variable can stay if it aids readability, or be inlined back.

---

## Task 3 — Touch-target audit (unchanged from previous plan)

All fixes already applied — Settings button `h-11 w-11`, Approve All row `min-h-11`, Send button `min-h-11`, SuggestionWidget buttons `h-11 w-11`. No further changes needed here.

---

## Task 4 — Update tests

**File:** `src/App.test.tsx`

Remove the tab-based mobile tests. Replace with:

1. **Desktop layout renders side-by-side** — mock `matchMedia` → `false`; assert no FAB, no bottom sheet; `EditorPanel` and `ChatSidebar` both in DOM.
2. **Mobile layout renders FAB, not a tablist** — mock `matchMedia` → `true`; assert "Open chat" button is present; assert there is no `tablist` with a "Chat" trigger.
3. **Opening the sheet shows the chat sidebar** — click the FAB; assert the bottom sheet transitions to visible (check `aria-hidden="false"` or assert "Ask the editor…" input is present).
4. **Closing the sheet hides it** — open then click close; assert sheet has `aria-hidden="true"`.
5. **FAB meets touch-target size** — assert FAB has `h-14 w-14` classes (56 × 56 px, exceeds 44 px minimum).

---

## Execution order

1. Revert `EditorPanel` to remove `mobileTab` prop
2. Replace `MobileLayout` in `App.tsx` with the bottom-sheet version
3. Update tests in `App.test.tsx`
4. Run `npm run test`, `npm run lint`, `npm run format` — fix any failures
5. Start dev server (`npm run dev`), open on a narrow viewport, verify:
   - Editor fills screen; FAB visible bottom-right
   - Tapping FAB slides up the chat sheet; editor remains visible above
   - Agent tools work while chat is open (the editor is always mounted)
   - Closing the sheet restores full-screen editor
6. Wait for user approval before committing

---

## Acceptance criteria

- Editor is always mounted and the agent tools (`read`, `search`, `edit`, `write`) work regardless of whether the chat sheet is open
- On viewports < 768 px: editor fills the screen; a FAB opens a 70 vh bottom sheet containing the chat
- No horizontal scrollbar at any viewport width
- All interactive controls are ≥ 44 × 44 px on mobile
- All tests pass; no lint or type errors
