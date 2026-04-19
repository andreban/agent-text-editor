# Phase 4 Chat UI Fixes

Two bugs in `ChatSidebar.tsx` to address before closing out Phase 4.

---

## Bug 1: Orphaned "..." Spinner After Tool Calls

### Root Cause

In `handleSend`, the `tool_call_started` handler (line 128) immediately creates a new empty assistant message with `isStreaming: true` — the animated "..." bubble that is meant to be a placeholder for the agent's next response. However, when `tool_call_completed` fires, it appends a result message and then creates a *second* new empty `isStreaming: true` placeholder (line 164–173), reassigning `currentAssistantMsgId` to the new one.

The original "..." bubble from `tool_call_started` is never marked `isStreaming: false` and is never removed. Because the final cleanup filter (`m.isStreaming`) still resolves to `true` for it, it persists in the UI indefinitely.

### Fix

Remove the empty streaming placeholder created in `tool_call_started`. The empty assistant slot is not needed there — it will be created in `tool_call_completed` when we actually know the tool has returned. Concretely:

1. In the `tool_call_started` branch, delete the block that appends `{ id: newAssistantId, role: "assistant", text: "", isStreaming: true }` and the `currentAssistantMsgId = newAssistantId` reassignment.
2. Keep only the logic that marks the current message as `isStreaming: false` and appends the `Tool Call: \`name\`` indicator message.
3. In the `tool_call_completed` branch, the already-present new empty streaming message creation remains as the sole place a fresh placeholder is opened for the agent's continuation.

This ensures there is always exactly one active "..." bubble at any time, and it is always the one tracked by `currentAssistantMsgId`.

---

## Bug 2: Raw Tool Results Displayed in Chat

### Root Cause

In the `tool_call_completed` handler (lines 155–162), the raw tool result is appended as a `user`-role message (`**Result:** ${resultText}`). This pollutes the chat with internal agent plumbing that is not meaningful to the user — especially for `edit`/`write` tools where the result is a human-readable acceptance/rejection status string.

### Fix

Remove the block that appends the `**Result:** ...` message entirely. The tool result is consumed by MAST internally to continue the agent loop; it does not need to surface in the UI.

If future debugging is needed, a `console.debug` can be added in place of the removed setMessages call, gated behind a dev flag.

---

## Files to Change

- `src/components/ChatSidebar.tsx` — the only file requiring modification.

## Test Coverage

Update or add Vitest tests in `src/components/ChatSidebar.test.tsx` (or equivalent) to assert:

1. After a complete `tool_call_started` → `tool_call_completed` → final text cycle, no message with `isStreaming: true` remains in the rendered output.
2. No message with text matching `/\*\*Result:\*\*/` appears in the chat after a tool completes.

## Checklist

- [ ] Remove orphaned streaming placeholder from `tool_call_started` handler
- [ ] Remove `**Result:**` message from `tool_call_completed` handler
- [ ] Verify "..." disappears after tool resolution in manual testing
- [ ] Verify tool results are absent from chat in manual testing
- [ ] Write/update tests
- [ ] `npm run lint && npm run format`
- [ ] User manual approval
- [ ] Commit
