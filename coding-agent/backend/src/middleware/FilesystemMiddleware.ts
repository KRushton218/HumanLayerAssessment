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

  /**
   * Set the allowed paths for file operations (target directory)
   */
  setAllowedPaths(paths: string[]): void {
    this.allowedPaths = paths.map(p => path.resolve(p));
  }

  /**
   * Get the current allowed paths
   */
  getAllowedPaths(): string[] {
    return [...this.allowedPaths];
  }

  /**
   * Get the primary target directory (first allowed path)
   */
  getTargetDirectory(): string {
    return this.allowedPaths[0] || process.cwd();
  }

  /**
   * Set the primary target directory
   */
  setTargetDirectory(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    this.allowedPaths = [resolved];
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
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = ReadFileSchema.parse(input);
        if (!this.validatePath(parsed.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'read_file', summary: `Reading ${parsed.path}` });
          const content = await fs.readFile(parsed.path, 'utf-8');
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
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = WriteFileSchema.parse(input);
        if (!this.validatePath(parsed.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'write_file', summary: `Writing ${parsed.path}` });

          // Ensure directory exists
          await fs.mkdir(path.dirname(parsed.path), { recursive: true });
          await fs.writeFile(parsed.path, parsed.content, 'utf-8');

          context.emit('tool_complete', { name: 'write_file', success: true });
          return { success: true, output: `Successfully wrote to ${parsed.path}` };
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
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = EditFileSchema.parse(input);
        if (!this.validatePath(parsed.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'edit_file', summary: `Editing ${parsed.path}` });

          const content = await fs.readFile(parsed.path, 'utf-8');

          if (!content.includes(parsed.old_string)) {
            context.emit('tool_complete', { name: 'edit_file', success: false });
            return { success: false, output: '', error: 'old_string not found in file' };
          }

          const newContent = content.replace(parsed.old_string, parsed.new_string);
          await fs.writeFile(parsed.path, newContent, 'utf-8');

          context.emit('tool_complete', { name: 'edit_file', success: true });
          return { success: true, output: `Successfully edited ${parsed.path}` };
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
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = ListDirectorySchema.parse(input);
        if (!this.validatePath(parsed.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'list_directory', summary: `Listing ${parsed.path}` });

          const entries = await fs.readdir(parsed.path, { withFileTypes: true });
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
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = ExecuteShellSchema.parse(input);
        // Basic safety check - block dangerous commands
        const dangerous = ['rm -rf /', 'rm -rf ~', 'mkfs', 'dd if=', ':(){:|:&};:'];
        if (dangerous.some(d => parsed.command.includes(d))) {
          return { success: false, output: '', error: 'Command blocked for safety' };
        }

        const cwd = parsed.cwd || context.workingDirectory;
        if (!this.validatePath(cwd)) {
          return { success: false, output: '', error: 'Working directory outside allowed paths' };
        }

        try {
          context.emit('tool_start', { name: 'execute_shell', summary: `Running: ${parsed.command}` });

          const result = await execa(parsed.command, {
            shell: true,
            cwd,
            timeout: 60000, // 60 second timeout
          });

          context.emit('tool_complete', { name: 'execute_shell', success: true });
          return {
            success: true,
            output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
          };
        } catch (err: unknown) {
          context.emit('tool_complete', { name: 'execute_shell', success: false });
          const execaErr = err as { stdout?: string; stderr?: string; message?: string };
          return {
            success: false,
            output: execaErr.stdout || '',
            error: execaErr.stderr || execaErr.message,
          };
        }
      },
    },
  ];
}
