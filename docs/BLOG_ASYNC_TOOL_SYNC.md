# Blog Notes: The Tool Contract Problem in Agentic Loops

## The Bug

Our AI agent editor lets an LLM switch between documents, create new ones, and then immediately read or edit the content that should now be open. In practice, after the agent called `switch_active_document`, any subsequent `read()` or `edit()` call would silently operate on the _previous_ document. The agent was editing text it thought it had just switched away from.

The fix was a single extra line per tool. Understanding _why_ it was needed reveals something fundamental about how agent tools must behave.

---

## The Contract a Tool Makes

When an LLM calls a tool, the agent framework awaits the tool's Promise and feeds the result back into the conversation. That result is the LLM's only evidence that the action happened. So the tool's return value carries an implicit promise:

> **"The world now reflects what I just did. Your next action can build on it."**

This contract is what makes sequential tool use coherent. If `switch_active_document` returns `{ switched: true, title: "Draft v2" }`, the LLM reasonably concludes it can now call `read()` and get "Draft v2"'s content. If that assumption fails, the LLM acts on a lie.

This is not a subtle edge case. It is the foundational requirement for any tool in a multi-step agent loop: **resolve only when the effect is observable by the next tool call.**

---

## "Done" vs "Observable": A General Problem

This contract can be broken any time there is a gap between _initiating_ an effect and that effect becoming _visible_ to subsequent operations. The agent framework doesn't know about that gap — it sees a resolved Promise and moves on.

Some familiar examples of the same class of problem:

**Databases:** A write that is acknowledged before the replica has caught up. A subsequent read on a replica returns stale data. Read-your-writes consistency exists precisely to prevent this.

**Message queues:** A message is "sent" (accepted by the broker) before consumers have processed it. If the next operation depends on the side-effect of that message, it will race.

**File systems:** A write syscall returns before the OS has flushed to disk. A subsequent reader on a different file descriptor may see the old bytes.

**UI frameworks:** A state mutation is acknowledged before the rendering pipeline has made the new state visible to the parts of the application that subsequent operations read from.

Our bug is the last one. The agent's tools write state through React, but read state through Monaco's editor API — and those two paths are coupled through an asynchronous rendering pipeline.

---

## How It Manifests Here

The application has two separate pathways to the same content:

- **Write path:** Agent tools call React state setters → React schedules a re-render → `EditorPanel`'s `useEffect` fires → `localContent` state updates → the `value` prop of Monaco changes → Monaco updates its internal model.
- **Read path:** Agent tools call `editor.getValue()` on the Monaco instance directly.

When the write path is asynchronous and the read path is synchronous, a tool that returns after triggering the write path but before it completes leaves the read path stale.

Here is the concrete sequence for `switch_active_document`:

```
Tool called:
  setActiveDocumentId(newId)    → React state update: *scheduled*, not applied
  return { switched: true }     → Promise resolves: agent proceeds immediately

Agent calls read() next:
  editor.getValue()             → Monaco still holds OLD document content 💥
```

React 18 batches state updates and flushes them asynchronously. Even if that flush were instant, `useEffect` — which triggers `setLocalContent` in `EditorPanel` — runs _after the browser paints_. There are two full deferred render cycles before Monaco reflects the new document:

```
Cycle 1: setActiveDocumentId() flushes → React renders
         → activeDocument is new doc
         Browser paints
         useEffect([activeDocument]) fires → setLocalContent(newDoc.content)

Cycle 2: setLocalContent() flushes → React renders
         → Monaco's value prop changes
         → Monaco calls editor.setValue(newContent) internally
```

The agent's next tool call runs between the return and cycle 1. The UI is nowhere near ready.

The same race exists for `create_document`: the workspace context creates the document and switches to it in one state update, but Monaco doesn't know yet.

---

## The Wrong Fix: Waiting for the UI

The apparent solution is to delay the Promise resolution until the rendering pipeline catches up. The options are all bad:

**`flushSync`** forces a synchronous render, but `useEffect` hooks are explicitly deferred until after paint — by design. The `setLocalContent` call still wouldn't happen, so Monaco still wouldn't update.

**`setTimeout(resolve, 0)`** waits one event-loop tick. React's flush usually completes in a microtask, so the first render might be done — but `useEffect` fires post-paint, which is _after_ a `requestAnimationFrame`. Chaining `setTimeout(0)` inside `setTimeout(0)` is guessing at timing, not knowing it.

**`requestAnimationFrame` chains** are closer but still fragile. A slow frame (tab in background, heavy layout work) can push the paint back far enough to race. This adds 16–32 ms of artificial latency per tool call, which accumulates noticeably in a multi-step agent loop. And it's still a timing assumption, not a guarantee.

All of these approaches try to solve the problem at the wrong layer. They're trying to make the write path synchronous, but the write path is asynchronous _by design_ — React's async rendering is a feature. The real problem is that the write path and the read path are different, and the agent shouldn't have to wait for a UI rendering pipeline at all.

---

## The Right Fix: Separate the Agent's State from the UI's State

The core insight is that the agent tools and the UI _don't have to share the same state pathway_. The UI can stay async. The agent just needs its reads and writes to be consistent with each other.

In our case, the agent reads from and writes to Monaco's imperative API (`editor.getValue()`, `editor.setValue()`). React's rendering pipeline drives the _display_, but the agent cares about the _model_. When a tool changes the active document, it should update the model directly:

```ts
async switch_active_document({ id }: { id: string }): Promise<string> {
  const doc = this.docsRef.current.find((d) => d.id === id);
  if (!doc) return JSON.stringify({ error: "Document not found" });

  const currentDoc = this.activeDocRef.current;
  if (currentDoc) {
    this.saveDocContentFn(currentDoc.id, this.getEditorContent());
  }

  this.setActiveDocumentIdFn(id);      // React state update (async — for the UI)
  this.setEditorValueFn(doc.content);  // Monaco sync (immediate — for the agent)

  return JSON.stringify({ switched: true, id, title: doc.title });
}
```

`setEditorValueFn` is `(content) => editorInstance?.setValue(content)`, passed in from `App.tsx`. It updates Monaco's model synchronously, so the next `editor.getValue()` immediately returns the new document's content. React's rendering pipeline still runs in the background and the UI updates as usual — we're just not blocking the agent on it.

This resolves the contract: the Promise resolves after the effect is observable to subsequent tool calls.

---

## Why This Is Safe

Two follow-on questions arise.

**Won't React overwrite Monaco with stale content when it finally re-renders?**

No. `@monaco-editor/react` guards its controlled `value` prop: it only calls `editor.setValue(v)` when `v !== editor.getValue()`. Once we've eagerly set the model, the subsequent prop update from React's render cycle sees no difference and skips it.

**Won't the Monaco `onChange` event save content to the wrong document?**

No. When `editor.setValue(newContent)` fires, Monaco's `onChange` triggers `handleChange` in `EditorPanel`, which debounces a `updateDocument` save by 500 ms. By the time that debounce fires, React has re-rendered and `activeDocument` is the new document — so the save correctly targets the new document's ID.

---

## What This Looked Like in Practice

The failure mode was silent. The agent would produce output like:

> Switching to "Draft v2"...
> Reading document...
> I see the document currently begins with "Introduction to..."

— and "Introduction to..." was from the _previous_ document. The agent would then propose an edit, the user would accept it, and the wrong document would be modified. No error, no warning — just the wrong behaviour.

The bug only appeared when the agent chained multiple tools, which is exactly what a capable agent does. A single-tool interaction (switch, then stop) appeared to work fine because the UI caught up before the user took another action. The more capable you make an agent, the worse this class of bug gets.

---

## The General Rule for Agent Tools

Whenever a tool performs an action whose effect is visible to subsequent tools through a different pathway than the one used to initiate it, the tool is responsible for closing that gap before resolving.

The specific fix depends on the architecture:

- If reads and writes go through the same channel (e.g., both through React context via a ref), the gap may not exist.
- If the write path is async (React state) and the read path is synchronous (imperative API), update the read path directly.
- If the write path is a message queue and the read path is a database, wait for the queue to be processed before resolving — or restructure so both paths share a single source of truth.

The React-specific mechanics (two render cycles, `useEffect` deferral, `flushSync` limitations) are a concrete instance of a more general class. What makes it a useful case study is that the React behaviour is well-documented and widely misunderstood as "just async" — when the real issue is the mismatch between the agent's expectations and the actual consistency model of the underlying system.

---

## Summary

| Approach                                        | Works?     | Why                                                                                          |
| ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Trust React to update before the next tool runs | No         | React renders are deferred; the agent runs between state mutations and their effects         |
| Delay Promise with `setTimeout(0)`              | Unreliable | `useEffect` runs post-paint, not post-microtask; timing is still a guess                     |
| Delay Promise with `flushSync`                  | Partial    | Forces one synchronous render; `useEffect` is still deferred until after paint               |
| Eagerly update Monaco + async React state       | ✓          | Closes the gap between write path and read path; React catches up without blocking the agent |
