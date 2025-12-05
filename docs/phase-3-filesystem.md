# Phase 3: FilesystemMiddleware

## Overview

Implement file operations (read_file, write_file, edit_file, list_directory) and shell execution with path safety validation.

## Prerequisites

- Phase 1 and 2 completed successfully
- Middleware system working

---

## Changes Required

### 1. FilesystemMiddleware

**File**: `backend/src/middleware/FilesystemMiddleware.ts`

```typescript
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { Middleware } from './types.js';
import { ToolDefinition, ToolContext, ToolResult } from '../tools/ToolRegistry.js';

const ReadFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to read'),
});

const WriteFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to write'),
  content: z.string().describe('Content to write to the file'),
});

const EditFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to edit'),
  old_string: z.string().describe('The exact string to find and replace'),
  new_string: z.string().describe('The string to replace it with'),
});

const ListDirectorySchema = z.object({
  path: z.string().describe('Absolute path to the directory to list'),
});

const ExecuteShellSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
});

export class FilesystemMiddleware implements Middleware {
  name = 'FilesystemMiddleware';
  private allowedPaths: string[];

  constructor(allowedPaths: string[] = [process.cwd()]) {
    this.allowedPaths = allowedPaths.map(p => path.resolve(p));
  }

  systemPrompt = `## File Operations
You have access to file system tools for reading, writing, and editing files.
- Always check if files exist before writing (use list_directory)
- Use edit_file for modifications to existing files
- Use write_file for creating new files
- Prefer small, focused file operations
- Use absolute paths

## Shell Execution
You can execute shell commands with execute_shell.
- Use for running tests, builds, and other development tasks
- Avoid destructive commands (rm -rf, etc.)
- Check command output for errors`;

  private validatePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return this.allowedPaths.some(allowed => resolved.startsWith(allowed));
  }

  tools: ToolDefinition[] = [
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: ReadFileSchema,
      execute: async (input: z.infer<typeof ReadFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'read_file', summary: `Reading ${input.path}` });
          const content = await fs.readFile(input.path, 'utf-8');
          context.emit('tool_complete', { name: 'read_file', success: true });
          return { success: true, output: content };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'read_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites)',
      inputSchema: WriteFileSchema,
      execute: async (input: z.infer<typeof WriteFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'write_file', summary: `Writing ${input.path}` });

          // Ensure directory exists
          await fs.mkdir(path.dirname(input.path), { recursive: true });
          await fs.writeFile(input.path, input.content, 'utf-8');

          context.emit('tool_complete', { name: 'write_file', success: true });
          return { success: true, output: `Successfully wrote to ${input.path}` };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'write_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific string',
      inputSchema: EditFileSchema,
      execute: async (input: z.infer<typeof EditFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'edit_file', summary: `Editing ${input.path}` });

          const content = await fs.readFile(input.path, 'utf-8');

          if (!content.includes(input.old_string)) {
            context.emit('tool_complete', { name: 'edit_file', success: false });
            return { success: false, output: '', error: 'old_string not found in file' };
          }

          const newContent = content.replace(input.old_string, input.new_string);
          await fs.writeFile(input.path, newContent, 'utf-8');

          context.emit('tool_complete', { name: 'edit_file', success: true });
          return { success: true, output: `Successfully edited ${input.path}` };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'edit_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'list_directory',
      description: 'List contents of a directory',
      inputSchema: ListDirectorySchema,
      execute: async (input: z.infer<typeof ListDirectorySchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'list_directory', summary: `Listing ${input.path}` });

          const entries = await fs.readdir(input.path, { withFileTypes: true });
          const listing = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));

          context.emit('tool_complete', { name: 'list_directory', success: true });
          return { success: true, output: JSON.stringify(listing, null, 2) };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'list_directory', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'execute_shell',
      description: 'Execute a shell command',
      inputSchema: ExecuteShellSchema,
      execute: async (input: z.infer<typeof ExecuteShellSchema>, context: ToolContext): Promise<ToolResult> => {
        // Basic safety check - block dangerous commands
        const dangerous = ['rm -rf /', 'rm -rf ~', 'mkfs', 'dd if=', ':(){:|:&};:'];
        if (dangerous.some(d => input.command.includes(d))) {
          return { success: false, output: '', error: 'Command blocked for safety' };
        }

        const cwd = input.cwd || context.workingDirectory;
        if (!this.validatePath(cwd)) {
          return { success: false, output: '', error: 'Working directory outside allowed paths' };
        }

        try {
          context.emit('tool_start', { name: 'execute_shell', summary: `Running: ${input.command}` });

          const result = await execa(input.command, {
            shell: true,
            cwd,
            timeout: 60000, // 60 second timeout
          });

          context.emit('tool_complete', { name: 'execute_shell', success: true });
          return {
            success: true,
            output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
          };
        } catch (err: any) {
          context.emit('tool_complete', { name: 'execute_shell', success: false });
          return {
            success: false,
            output: err.stdout || '',
            error: err.stderr || err.message,
          };
        }
      },
    },
  ];
}
```

### 2. Update Middleware Exports

**File**: `backend/src/middleware/index.ts`

```typescript
export * from './types.js';
export * from './MiddlewareManager.js';
export * from './TodoMiddleware.js';
export * from './FilesystemMiddleware.js';
```

---

## Success Criteria

### Automated Verification
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes

### Manual Verification
- [ ] File read/write operations work correctly
- [ ] Path validation blocks directory traversal attacks (e.g., `../../../etc/passwd`)
- [ ] Shell execution works with 60-second timeout
- [ ] Dangerous commands (rm -rf /, etc.) are blocked
- [ ] Tool events (tool_start, tool_complete) are emitted correctly

---

## Next Phase

Once all success criteria are met, proceed to [Phase 4: Agent Orchestrator & Context Management](./phase-4-orchestrator.md).
