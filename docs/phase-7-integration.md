# Phase 7: Integration & End-to-End Testing

## Overview

Wire everything together, fix any integration issues, and ensure the full flow works end-to-end.

## Prerequisites

- Phases 1-6 completed successfully
- Backend and frontend both running

---

## Changes Required

### 1. Fix Streaming Text Finalization

The current App.tsx implementation has a race condition with streaming text. The streaming text state may not be fully populated when we try to finalize it as an assistant message.

**File**: `frontend/src/App.tsx` - Update handleSendMessage

Replace the handleSendMessage function with:

```typescript
const handleSendMessage = async (content: string) => {
  if (!sessionId) return;

  setIsProcessing(true);
  setStreamingText('');
  setMessages(prev => [...prev, { role: 'user', content }]);

  try {
    await api.sendMessage(sessionId, content, model);
  } catch (err) {
    console.error('Failed to send message:', err);
  } finally {
    // Small delay to ensure all SSE events are processed
    setTimeout(() => {
      setMessages(prev => {
        // Only add assistant message if we have streaming text
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'user') {
          return [...prev, { role: 'assistant', content: streamingText || '(Task completed)' }];
        }
        return prev;
      });
      setStreamingText('');
      setIsProcessing(false);
    }, 100);
  }
};
```

### 2. Root package.json for Convenience

**File**: `package.json` (in project root)

```json
{
  "name": "coding-agent",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "typecheck": "npm run typecheck:backend && npm run typecheck:frontend",
    "typecheck:backend": "cd backend && npm run typecheck",
    "typecheck:frontend": "cd frontend && npm run typecheck",
    "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### 3. Update Backend CORS for Development

**File**: `backend/src/index.ts` - Update CORS config

Replace:
```typescript
app.use(cors());
```

With:
```typescript
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
```

---

## End-to-End Testing Checklist

### Setup Test

1. [ ] Run `npm run install:all` from project root
2. [ ] Verify no installation errors
3. [ ] Run `npm run typecheck` - should pass for both backend and frontend
4. [ ] Run `npm run build` - should succeed for both projects

### Basic Chat Flow

1. [ ] Start backend: `npm run dev:backend`
2. [ ] Start frontend: `npm run dev:frontend`
3. [ ] Open http://localhost:5173
4. [ ] Verify UI loads with header, chat panel, sidebar
5. [ ] Send message: "Hello, what can you do?"
6. [ ] Verify response streams to chat panel
7. [ ] Verify context meter updates

### Todo Operations

1. [ ] Send: "Create a todo list with 3 items for building a REST API"
2. [ ] Verify todos appear in sidebar immediately
3. [ ] Verify SSE events for todo_update received
4. [ ] Send: "Mark the first task as in progress"
5. [ ] Verify todo status updates in real-time
6. [ ] Send: "Complete the first task"
7. [ ] Verify completed task shows with strikethrough

### File Operations

1. [ ] Send: "Create a file called test.txt with 'Hello World' content"
2. [ ] Verify tool_start event shows in UI
3. [ ] Verify tool_complete event shows success
4. [ ] Check filesystem - file should exist
5. [ ] Send: "Read the test.txt file"
6. [ ] Verify content is returned
7. [ ] Send: "Edit test.txt and change 'Hello' to 'Hi'"
8. [ ] Verify edit succeeds
9. [ ] Send: "List the current directory"
10. [ ] Verify directory listing returned

### Subtask Delegation

1. [ ] Send: "Spawn a subtask to create a file called subtask-test.txt with some content"
2. [ ] Verify subtask_start event shows in UI
3. [ ] Verify SubTaskIndicator component appears
4. [ ] Verify subtask_complete event received
5. [ ] Verify file was created
6. [ ] Verify subtask summary returned to main agent

### Checkpoint Operations

1. [ ] After a few messages, verify checkpoints appear in sidebar
2. [ ] Click "Revert" on an earlier checkpoint
3. [ ] Verify state reverts (messages should reset to that point)
4. [ ] Click "Fork" on a checkpoint
5. [ ] Verify new session created with clean state

### Error Handling

1. [ ] Send: "Read a file that doesn't exist: /nonexistent/file.txt"
2. [ ] Verify error is handled gracefully
3. [ ] Verify UI doesn't crash
4. [ ] Send: "Execute a command that will fail: exit 1"
5. [ ] Verify error message displayed

### Model Selection

1. [ ] Change model in dropdown
2. [ ] Send a message
3. [ ] Verify response still works (model change took effect)

### Context Monitoring

1. [ ] Send several long messages
2. [ ] Verify context percentage increases
3. [ ] Verify color changes at 32% (yellow) and 40% (red)

---

## Common Issues and Fixes

### Issue: SSE Connection Drops

**Symptom**: Events stop appearing in UI

**Fix**: Check that CORS is configured correctly and that the SSE endpoint doesn't have a timeout.

### Issue: Tool Execution Hangs

**Symptom**: Tool starts but never completes

**Fix**: Check for errors in backend console. Ensure shell commands have appropriate timeouts.

### Issue: Todos Don't Update

**Symptom**: Todo list stays empty or stale

**Fix**: Verify SSE connection is established. Check browser console for SSE event errors.

### Issue: Streaming Text Not Appearing

**Symptom**: Chat panel stays empty during response

**Fix**: Check that text events are being emitted by backend and received by frontend SSE handler.

---

## Success Criteria

### Automated Verification
- [ ] `npm run install:all` installs all dependencies
- [ ] `npm run typecheck` passes for both backend and frontend
- [ ] `npm run build` succeeds for both projects

### Manual Verification
- [ ] Complete all items in End-to-End Testing Checklist above
- [ ] No console errors in browser during normal operation
- [ ] No unhandled exceptions in backend logs
- [ ] UI remains responsive during all operations

---

## Next Phase

Once all success criteria are met, proceed to [Phase 8: Documentation](./phase-8-documentation.md).
