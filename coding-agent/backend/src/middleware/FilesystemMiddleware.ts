import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execa, ExecaChildProcess } from 'execa';
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
  background: z.boolean().optional().describe('Run in background (for long-running processes like dev servers)'),
});

const KillProcessSchema = z.object({
  processId: z.string().describe('The process ID to kill'),
});

const ListProcessesSchema = z.object({});

// Process tracking for background processes
interface BackgroundProcess {
  id: string;
  command: string;
  cwd: string;
  startTime: number;
  process: ExecaChildProcess;
  output: string[];
}

// Global process store (per session)
const processStore = new Map<string, Map<string, BackgroundProcess>>();

function getSessionProcesses(sessionId: string): Map<string, BackgroundProcess> {
  if (!processStore.has(sessionId)) {
    processStore.set(sessionId, new Map());
  }
  return processStore.get(sessionId)!;
}

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

  /**
   * Check if a path is within allowed directories (public method for API)
   */
  validatePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return this.allowedPaths.some(allowed => resolved.startsWith(allowed));
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
          context.emit('tool_start', { name: 'read_file', summary: `Reading ${parsed.path}`, input: parsed });
          const content = await fs.readFile(parsed.path, 'utf-8');
          context.emit('tool_complete', { name: 'read_file', success: true, output: content });
          return { success: true, output: content };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'read_file', success: false, output: error });
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
          context.emit('tool_start', { name: 'write_file', summary: `Writing ${parsed.path}`, input: { path: parsed.path } });

          // Ensure directory exists
          await fs.mkdir(path.dirname(parsed.path), { recursive: true });
          await fs.writeFile(parsed.path, parsed.content, 'utf-8');

          const output = `Successfully wrote to ${parsed.path}`;
          context.emit('tool_complete', { name: 'write_file', success: true, output });
          return { success: true, output };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'write_file', success: false, output: error });
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
          context.emit('tool_start', { name: 'edit_file', summary: `Editing ${parsed.path}`, input: { path: parsed.path, old_string: parsed.old_string, new_string: parsed.new_string } });

          const content = await fs.readFile(parsed.path, 'utf-8');

          if (!content.includes(parsed.old_string)) {
            context.emit('tool_complete', { name: 'edit_file', success: false, output: 'old_string not found in file' });
            return { success: false, output: '', error: 'old_string not found in file' };
          }

          const newContent = content.replace(parsed.old_string, parsed.new_string);
          await fs.writeFile(parsed.path, newContent, 'utf-8');

          const output = `Successfully edited ${parsed.path}`;
          context.emit('tool_complete', { name: 'edit_file', success: true, output });
          return { success: true, output };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'edit_file', success: false, output: error });
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
          context.emit('tool_start', { name: 'list_directory', summary: `Listing ${parsed.path}`, input: parsed });

          const entries = await fs.readdir(parsed.path, { withFileTypes: true });
          const listing = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));

          const output = JSON.stringify(listing, null, 2);
          context.emit('tool_complete', { name: 'list_directory', success: true, output });
          return { success: true, output };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'list_directory', success: false, output: error });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'execute_shell',
      description: 'Execute a shell command. Use background=true for long-running processes like dev servers.',
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

        // Background process handling
        if (parsed.background) {
          const processId = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const sessionProcesses = getSessionProcesses(context.sessionId);

          // Include processId in tool_start so frontend can track which step corresponds to which process
          context.emit('tool_start', { name: 'execute_shell', summary: `Starting background: ${parsed.command}`, input: parsed, processId });

          const childProcess = execa(parsed.command, {
            shell: true,
            cwd,
            detached: true, // Create process group for proper cleanup
            // No timeout for background processes
          });

          const bgProcess: BackgroundProcess = {
            id: processId,
            command: parsed.command,
            cwd,
            startTime: Date.now(),
            process: childProcess,
            output: [],
          };

          sessionProcesses.set(processId, bgProcess);

          // Stream output via SSE
          childProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            bgProcess.output.push(text);
            // Keep only last 100 lines
            if (bgProcess.output.length > 100) bgProcess.output.shift();
            context.emit('process_output', { processId, type: 'stdout', content: text });
          });

          childProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();
            bgProcess.output.push(text);
            if (bgProcess.output.length > 100) bgProcess.output.shift();
            context.emit('process_output', { processId, type: 'stderr', content: text });
          });

          childProcess.on('exit', (code) => {
            context.emit('process_exit', { processId, code });
            sessionProcesses.delete(processId);
          });

          context.emit('process_started', { processId, command: parsed.command, cwd });
          context.emit('tool_complete', { name: 'execute_shell', success: true, output: `Background process started with ID: ${processId}`, processId });

          return {
            success: true,
            output: `Background process started with ID: ${processId}\nUse list_processes to see running processes, kill_process to stop.`,
          };
        }

        // Regular foreground execution
        try {
          context.emit('tool_start', { name: 'execute_shell', summary: `Running: ${parsed.command}`, input: parsed });

          const result = await execa(parsed.command, {
            shell: true,
            cwd,
            timeout: 60000, // 60 second timeout
          });

          const output = result.stdout + (result.stderr ? '\n' + result.stderr : '');
          context.emit('tool_complete', { name: 'execute_shell', success: true, output });
          return {
            success: true,
            output,
          };
        } catch (err: unknown) {
          const execaErr = err as { stdout?: string; stderr?: string; message?: string };
          const output = execaErr.stderr || execaErr.message || 'Command failed';
          context.emit('tool_complete', { name: 'execute_shell', success: false, output });
          return {
            success: false,
            output: execaErr.stdout || '',
            error: execaErr.stderr || execaErr.message,
          };
        }
      },
    },
    {
      name: 'list_processes',
      description: 'List all running background processes',
      inputSchema: ListProcessesSchema,
      execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> => {
        const sessionProcesses = getSessionProcesses(context.sessionId);

        if (sessionProcesses.size === 0) {
          return { success: true, output: 'No background processes running.' };
        }

        const processList = Array.from(sessionProcesses.values()).map(p => ({
          id: p.id,
          command: p.command,
          cwd: p.cwd,
          runningFor: `${Math.round((Date.now() - p.startTime) / 1000)}s`,
          recentOutput: p.output.slice(-5).join(''),
        }));

        return {
          success: true,
          output: JSON.stringify(processList, null, 2),
        };
      },
    },
    {
      name: 'kill_process',
      description: 'Kill a running background process',
      inputSchema: KillProcessSchema,
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = KillProcessSchema.parse(input);
        const sessionProcesses = getSessionProcesses(context.sessionId);

        const bgProcess = sessionProcesses.get(parsed.processId);
        if (!bgProcess) {
          return { success: false, output: '', error: `Process ${parsed.processId} not found` };
        }

        try {
          bgProcess.process.kill('SIGTERM');
          // Give it a moment, then force kill if needed
          setTimeout(() => {
            if (sessionProcesses.has(parsed.processId)) {
              bgProcess.process.kill('SIGKILL');
            }
          }, 2000);

          sessionProcesses.delete(parsed.processId);
          context.emit('process_killed', { processId: parsed.processId });

          return {
            success: true,
            output: `Process ${parsed.processId} killed.`,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to kill process';
          return { success: false, output: '', error };
        }
      },
    },
  ];

  /**
   * Get running processes for a session (for API access)
   */
  getRunningProcesses(sessionId: string): Array<{ id: string; command: string; cwd: string; startTime: number }> {
    const sessionProcesses = getSessionProcesses(sessionId);
    return Array.from(sessionProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      cwd: p.cwd,
      startTime: p.startTime,
    }));
  }

  /**
   * Kill a process (for API access)
   */
  killProcess(sessionId: string, processId: string): boolean {
    const sessionProcesses = getSessionProcesses(sessionId);
    const bgProcess = sessionProcesses.get(processId);
    if (!bgProcess) return false;

    try {
      // Kill the process tree (important for shell processes that spawn children)
      const pid = bgProcess.process.pid;
      if (pid) {
        // Try to kill the process group (negative PID kills the group)
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          // If process group kill fails, try regular kill
          bgProcess.process.kill('SIGTERM');
        }

        // Force kill after 2 seconds if still running
        setTimeout(() => {
          try {
            if (pid) process.kill(-pid, 'SIGKILL');
          } catch {
            // Process already dead
          }
        }, 2000);
      } else {
        bgProcess.process.kill('SIGTERM');
      }
    } catch (err) {
      console.error('Error killing process:', err);
    }

    sessionProcesses.delete(processId);
    return true;
  }
}
