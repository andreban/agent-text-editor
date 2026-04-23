# mast-ai/core: Tool Event Streaming

## Context

The agent-text-editor project has a `delegate_to_skill` tool that spins up a child `AgentRunner` to execute a named skill (e.g. Proofreader, Summarizer). The child runner produces its own `AgentEvent` stream — thinking chunks, tool calls, text deltas — but those events are currently invisible to the caller because `Tool.call` returns a plain `Promise<TResult>` with no channel to surface them.

The goal is to let tools that internally run sub-agents forward child events back to the parent runner's stream, so the UI can show what the skill is doing in real time.

## Current relevant code

### `src/tool.ts`

```typescript
export interface ToolContext {
  signal?: AbortSignal;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  definition(): ToolDefinition;
  call(args: TArgs, context: ToolContext): Promise<TResult>;
}
```

### `src/runner.ts` — tool execution block (inside `executeStream`)

```typescript
if (toolCalls.length > 0) {
  for (const call of toolCalls) {
    yield { type: 'tool_call_started', name: call.name, args: call.args };
  }

  const toolResults = await Promise.all(
    toolCalls.map(async (call) => {
      const tool = this.registry.get(call.name);
      if (!tool) {
        return { call, result: `Error: Tool '${call.name}' not found.` };
      }
      try {
        const result = await tool.call(call.args, { signal });
        return { call, result };
      } catch (err: any) {
        return { call, result: `Error executing tool: ${err.message}` };
      }
    })
  );

  for (const { call, result } of toolResults) {
    yield { type: 'tool_call_completed', name: call.name, result };
    // ... history update
  }
}
```

### `src/runner.ts` — `RunBuilder` class

```typescript
export class RunBuilder {
  runStream(input: string): AsyncIterable<AgentEvent> { ... }
  async run(input: string): Promise<AgentResult> { ... }
  async runTyped<T>(input: string): Promise<T> { ... }
}
```

## Problem

`Tool.call` is a `Promise`-returning method. The parent `executeStream` generator uses `Promise.all` to run multiple tool calls in parallel (Gemini can return several tool calls in one response turn). Because you cannot `yield` from inside a `Promise.all` callback in an async generator, there is no way for a tool to push events into the parent stream mid-execution.

## Rejected approaches

**Changing `Tool.call` to return `AsyncIterable`** — this would force every tool (including simple ones like `read` and `write`) to adopt a streaming interface they don't need, and parallel execution of multiple AsyncIterable streams requires a non-trivial fan-in merge. Not worth it for the common case.

**Switching `Promise.all` to sequential execution** — would break parallel tool execution, which is valid and used by Gemini.

## Proposed solution: `onToolEvent` callback on `RunBuilder`

Add an `onToolEvent` callback to `RunBuilder`. The runner calls it for every event a tool emits via `ToolContext.onEvent`. This keeps the tool interface unchanged for simple tools, preserves parallel execution, and gives consumers a real-time event feed without touching `AgentRunner` itself.

### 1. `src/tool.ts` — add `onEvent` to `ToolContext`

```typescript
import type { AgentEvent } from './types';

export interface ToolContext {
  signal?: AbortSignal;
  /**
   * Called by tools that internally run sub-agents to surface child events
   * to the parent runner's stream. Simple tools can ignore this entirely.
   */
  onEvent?: (event: AgentEvent) => void;
}
```

### 2. `src/runner.ts` — add `onToolEvent` to `RunBuilder`

```typescript
export class RunBuilder {
  private _history: Message[] = [];
  private _signal?: AbortSignal;
  private _onToolEvent?: (toolName: string, event: AgentEvent) => void; // ADD

  // ADD this method
  onToolEvent(handler: (toolName: string, event: AgentEvent) => void): this {
    this._onToolEvent = handler;
    return this;
  }

  runStream(input: string): AsyncIterable<AgentEvent> {
    return this.execute(input, this._history, this._signal, this._onToolEvent); // pass through
  }
  // ...
}
```

Update the `StreamExecutor` type and `executeStream` signature accordingly:

```typescript
type StreamExecutor = (
  input: string,
  history: Message[],
  signal?: AbortSignal,
  onToolEvent?: (toolName: string, event: AgentEvent) => void, // ADD
) => AsyncIterable<AgentEvent>;
```

### 3. `src/runner.ts` — thread `onToolEvent` into `ToolContext`

In the `Promise.all` tool execution block, pass `onEvent` into the context:

```typescript
const toolResults = await Promise.all(
  toolCalls.map(async (call) => {
    const tool = this.registry.get(call.name);
    if (!tool) {
      return { call, result: `Error: Tool '${call.name}' not found.` };
    }
    try {
      const result = await tool.call(call.args, {
        signal,
        onEvent: onToolEvent        // ADD
          ? (event) => onToolEvent(call.name, event)
          : undefined,
      });
      return { call, result };
    } catch (err: any) {
      return { call, result: `Error executing tool: ${err.message}` };
    }
  })
);
```

## How the consumer uses it

In the application (outside `@mast-ai/core`), a tool that runs a sub-agent calls `context.onEvent?.(childEvent)` for each event it receives from the child runner. The parent wires up the callback on `RunBuilder`:

```typescript
runner
  .runBuilder(agentConfig)
  .onToolEvent((toolName, event) => {
    // push into UI state for the skill panel
    dispatchSkillEvent(toolName, event);
  })
  .runStream(input);
```

Tools that don't call `context.onEvent` are completely unaffected.

## Files changed in `@mast-ai/core`

| File | Change |
|------|--------|
| `src/tool.ts` | Add `onEvent?: (event: AgentEvent) => void` to `ToolContext`; import `AgentEvent` from `./types` |
| `src/runner.ts` | Add `_onToolEvent` field and `onToolEvent()` method to `RunBuilder`; update `StreamExecutor` type; pass `onEvent` into `ToolContext` inside `Promise.all` |

No changes to `src/types.ts`, `src/conversation.ts`, or any adapter.
