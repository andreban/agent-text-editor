# Phase 9 Implementation Plan: Dark Mode

## Goal

Add a light/dark theme toggle to the application. The selected theme must be persisted in `localStorage`, applied as the `dark` class on `<html>`, and reflected in all UI components — including the Monaco editor. A dedicated `ThemeProvider` context owns the theme state and toggle function.

---

## Architecture overview

```
ThemeProvider (wraps app in main.tsx)
│   reads "theme" from localStorage on mount
│   writes "theme" to localStorage on change
│   adds/removes "dark" class on document.documentElement
│   exposes: theme ("light" | "dark"), toggleTheme()
│
├── ChatSidebar toolbar
│   └── Sun/Moon toggle button (reads/calls ThemeProvider)
│
├── SettingsDialog
│   └── Theme radio group (reads/calls ThemeProvider)
│
└── EditorPanel
    └── <Editor theme={monacoTheme} />  ("vs" | "vs-dark")
```

Key decisions:

- **Separate context** — `ThemeContext` lives outside `AppState` in the store. Theme is a UI-only concern; mixing it into the main app state would require re-rendering the entire provider on every toggle.
- **Class on `<html>`** — Tailwind's `dark:` variants require the `dark` class on the root element. The provider applies it directly via `document.documentElement.classList`.
- **System preference as default** — When no saved preference exists, the initial theme is read from `window.matchMedia("(prefers-color-scheme: dark)")`. Once the user explicitly toggles, their choice is saved to `localStorage` and the system preference is no longer consulted.
- **CSS variables already defined** — `index.css` already has `.dark` variable overrides from shadcn/ui. No new CSS variable work is required.
- **Suggestion decoration colors** — The hardcoded hex values in `.suggestion-original` and `.suggestion-new` in `index.css` work on both backgrounds, but dark-mode `rgba` overrides will be added for better contrast.

---

## Data model

```typescript
type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}
```

Stored as `localStorage.setItem("theme", "light" | "dark")`. When the key is absent, defaults to `"dark"` if `window.matchMedia("(prefers-color-scheme: dark)").matches`, otherwise `"light"`.

---

## Task 1 — ThemeProvider context

**New file:** `src/lib/ThemeProvider.tsx`

```typescript
export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "theme";

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
```

---

## Task 2 — Wire ThemeProvider in main.tsx

**File:** `src/main.tsx`

Wrap `AppProvider` (and therefore `App`) with `ThemeProvider`:

```tsx
<React.StrictMode>
  <ThemeProvider>
    <AppProvider>
      <App />
    </AppProvider>
  </ThemeProvider>
</React.StrictMode>
```

`ThemeProvider` must be the outer wrapper so it runs before any component renders, avoiding a flash of the wrong theme.

---

## Task 3 — Theme toggle button in ChatSidebar

**File:** `src/components/ChatSidebar.tsx`

Import `Sun` and `Moon` from `lucide-react` and `useTheme` from `@/lib/ThemeProvider`. Add a toggle button in the toolbar row alongside the existing Settings and Skills buttons:

```tsx
const { theme, toggleTheme } = useTheme();

<button
  onClick={toggleTheme}
  className="h-11 w-11 flex items-center justify-center rounded-md hover:bg-muted"
  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
>
  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
</button>
```

Place it to the left of the Settings button. The button must meet the 44 × 44 px touch-target requirement (`h-11 w-11`).

---

## Task 4 — Monaco editor theme

**File:** `src/components/EditorPanel.tsx`

Import `useTheme` and derive the Monaco theme string:

```tsx
const { theme } = useTheme();
const monacoTheme = theme === "dark" ? "vs-dark" : "light";
```

Pass it to the `<Editor>` component:

```tsx
<Editor
  theme={monacoTheme}
  /* ... existing props ... */
/>
```

The `theme` prop is already accepted by `@monaco-editor/react`; this replaces the current hardcoded `theme="light"` at line 177.

---

## Task 5 — Theme preference in SettingsDialog

**File:** `src/components/SettingsDialog.tsx`

Add a "Theme" field to the `SettingsForm`. Since the theme toggle is also in the toolbar, use a simple two-button toggle group (Light / Dark) rather than a select — this makes the choice visually clear:

```tsx
const { theme: currentTheme, setTheme } = useTheme();
const [draftTheme, setDraftTheme] = useState<Theme>(currentTheme);
```

Render a labelled button group:

```tsx
<div className="flex flex-col gap-2">
  <Label>Theme</Label>
  <div className="flex gap-2">
    {(["light", "dark"] as Theme[]).map((t) => (
      <Button
        key={t}
        variant={draftTheme === t ? "default" : "outline"}
        onClick={() => setDraftTheme(t)}
        className="flex-1 capitalize"
      >
        {t}
      </Button>
    ))}
  </div>
</div>
```

On save, call `setTheme(draftTheme)` alongside the existing `setApiKey` / `setModelName` calls.

---

## Task 6 — Fix hardcoded colors in MarkdownContent

**File:** `src/components/MarkdownContent.tsx`

The `pre` renderer uses hardcoded `bg-zinc-950 text-zinc-50`. In dark mode the near-black background becomes invisible against the app background, losing the code block's visual container. Replace with semantic tokens:

```tsx
<pre
  className="mb-4 mt-4 overflow-x-auto rounded-lg bg-muted text-muted-foreground p-4 text-xs"
  {...props}
/>
```

`bg-muted` and `text-muted-foreground` are CSS variable-backed and flip automatically with the active theme. The inline `code` renderer already uses `bg-muted` — no change needed there.

---

## Task 7 — Dark-mode suggestion colors

**File:** `src/index.css`

The hardcoded suggestion colors are visible on both backgrounds but the red strikethrough becomes dark against a near-black editor. Add dark-mode overrides:

```css
.dark .suggestion-original {
  color: #f87171 !important;          /* red-400, lighter red for dark bg */
  background-color: rgba(248, 113, 113, 0.15);
}

.dark .suggestion-new {
  color: #34d399 !important;          /* emerald-400, lighter green for dark bg */
  background-color: rgba(52, 211, 153, 0.2);
}
```

Note: Monaco's `vs-dark` theme renders suggestion decorations inside the editor canvas, which Monaco itself controls. The `.suggestion-original` / `.suggestion-new` classes apply to Monaco's inline decorations via `inlineClassName`; the overrides above affect those decorations when the wrapper has the `dark` class.

---

## Task 8 — Tests

**New file:** `src/lib/ThemeProvider.test.tsx`

Test against a `localStorage`-backed JSDOM environment (Vitest already provides this):

1. **Default theme (light device)** — when localStorage has no `"theme"` key and `prefers-color-scheme` is `light`, `useTheme()` returns `"light"` and `<html>` does not have the `dark` class.
2. **Default theme (dark device)** — when localStorage has no `"theme"` key and `prefers-color-scheme` is `dark`, `useTheme()` returns `"dark"` and `<html>` has the `dark` class.
3. **Saved preference overrides system** — when localStorage contains `"theme": "light"` but `prefers-color-scheme` is `dark`, `useTheme()` returns `"light"`.
4. **Toggle** — calling `toggleTheme()` flips from `"light"` to `"dark"`, updates `localStorage`, and adds/removes the `<html>` class.
5. **setTheme** — calling `setTheme("dark")` from Settings sets the theme directly and persists it.
6. **Persistence round-trip** — mounting a second `ThemeProvider` after a toggle reads the saved value correctly.
7. **useTheme outside provider** — throws with a descriptive error.

---

## Execution order

1. **Task 1** — create `src/lib/ThemeProvider.tsx`
2. **Task 8** — write `src/lib/ThemeProvider.test.tsx` and confirm tests pass
3. **Task 2** — wrap app in `main.tsx`
4. **Task 3** — add toggle button to `ChatSidebar`
5. **Task 4** — wire Monaco theme in `EditorPanel`
6. **Task 5** — add theme control to `SettingsDialog`
7. **Task 6** — fix hardcoded `pre` colors in `MarkdownContent.tsx`
8. **Task 7** — add dark-mode suggestion color overrides in `index.css`
8. Run `npm run test`, `npm run lint`, `npm run format` — fix any failures
9. Start dev server (`npm run dev`) and verify manually:
   - Default load (no saved preference) matches the device `prefers-color-scheme`
   - Toolbar Moon button toggles to dark; Sun button toggles back
   - Monaco editor switches between `light` and `vs-dark`
   - Settings dialog shows the current theme selected; saving from Settings changes theme
   - Reloading the page preserves the last theme
   - Suggestion decorations are legible in both modes
10. Wait for user approval before committing

---

## Acceptance criteria

- On first load with no saved preference, the app uses the device's `prefers-color-scheme` setting.
- The toolbar toggle button switches light ↔ dark; the icon reflects the active theme.
- The Monaco editor uses `light` / `vs-dark` matching the active theme.
- All shadcn/ui components (dialogs, buttons, inputs, sidebar) render correctly in dark mode using the existing CSS variable overrides.
- The theme preference survives a page reload.
- The Settings dialog exposes the same toggle.
- Suggestion decorations remain clearly legible in both modes.
- All tests pass; no lint or type errors.
