# Issue #16: Virtualize ChatSidebar for Large Conversations

## Problem

`ChatSidebar` renders all `StreamItem[]` entries directly into the DOM with no
virtualization. Long conversations accumulate hundreds of nodes (user bubbles,
assistant bubbles with expandable thoughts, tool badges), causing layout
thrashing and janky scroll performance.

## Approach

Use `@tanstack/react-virtual` (`useVirtualizer`) with **dynamic / measured
item heights**, because each item type has a different and potentially
changing height:

- **user** bubble — short or long text wrap
- **tool** badge — fixed single line
- **assistant** bubble — variable text + optional collapsible thought block
  that can expand/collapse mid-stream

`@tanstack/react-virtual` supports this via its `measureElement` callback,
which re-measures an item whenever the DOM node resizes (e.g., thought block
expands or streaming text grows).

## Steps

### 1. Install dependency

```bash
npm install @tanstack/react-virtual
```

### 2. Replace the scroll container in `ChatSidebar`

Current structure:

```tsx
<div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
  {items.map((item) => <Row key={item.id} ... />)}
</div>
```

New structure (virtualizer pattern):

```tsx
<div ref={scrollRef} className="flex-1 overflow-y-auto">
  {/* Outer container — height is the total virtual scroll height */}
  <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
    {virtualizer.getVirtualItems().map((vItem) => (
      <div
        key={vItem.key}
        data-index={vItem.index}
        ref={virtualizer.measureElement}
        style={{ position: 'absolute', top: 0, transform: `translateY(${vItem.start}px)`, width: '100%' }}
      >
        <ChatItem item={items[vItem.index]} ... />
      </div>
    ))}
  </div>
</div>
```

### 3. Initialise `useVirtualizer`

```ts
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 80, // rough estimate; real size measured via measureElement
  overscan: 5,
});
```

`estimateSize` is only used before measurement; actual rendered heights are
cached automatically.

### 4. Update `scrollToBottom`

Replace `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` with:

```ts
virtualizer.scrollToIndex(items.length - 1, { align: "end" });
```

This is safe to call even before the item is measured.

### 5. Extract `ChatItem` component

Move the per-item JSX (currently inline in `items.map(...)`) into a separate
`ChatItem` component so that `measureElement` can attach to a stable DOM node.
The component receives `item`, `isExpanded`, and `onToggle` as props.

### 6. Empty-state rendering

The empty-state div (`items.length === 0`) is outside the virtualizer list and
remains unchanged.

## Files Changed

| File                                 | Change                                          |
| ------------------------------------ | ----------------------------------------------- |
| `package.json` / `package-lock.json` | add `@tanstack/react-virtual`                   |
| `src/components/ChatSidebar.tsx`     | wire up `useVirtualizer`, use virtual items     |
| `src/components/ChatItem.tsx`        | new component extracted from ChatSidebar render |

## Testing

- Existing unit tests for `ChatSidebar` (if any) should continue to pass.
- Manual: open the app, send 50+ messages, verify smooth scroll and no
  invisible items.
- The `measureElement` callback handles dynamic resizing for streaming items;
  verify that expanding/collapsing a thought block does not break layout.

## Risks / Trade-offs

- `useVirtualizer` with dynamic sizes uses `ResizeObserver` internally; should
  be fine for all modern browsers.
- The `position: absolute` layout removes the `flex-col gap-4` spacing between
  items; gap must be added as padding on each `ChatItem` container instead.
- `scrollToIndex` during streaming fires on every `items` state update;
  performance impact is negligible (it's a simple integer comparison + scroll).
