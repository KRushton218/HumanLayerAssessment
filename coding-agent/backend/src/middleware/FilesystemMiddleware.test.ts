import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FilesystemMiddleware } from './FilesystemMiddleware.js';
import { ToolContext } from '../tools/ToolRegistry.js';

describe('FilesystemMiddleware', () => {
  let middleware: FilesystemMiddleware;
  let mockContext: ToolContext;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `fs-middleware-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    middleware = new FilesystemMiddleware([testDir]);
    mockContext = {
      sessionId: 'test-session',
      workingDirectory: testDir,
      emit: vi.fn(),
    };
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(middleware.name).toBe('FilesystemMiddleware');
    });

    it('should have system prompt with file and shell guidance', () => {
      expect(middleware.systemPrompt).toContain('File Operations');
      expect(middleware.systemPrompt).toContain('Shell Execution');
    });

    it('should provide seven tools', () => {
      expect(middleware.tools).toHaveLength(7);
      const toolNames = middleware.tools.map(t => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('edit_file');
      expect(toolNames).toContain('list_directory');
      expect(toolNames).toContain('execute_shell');
      expect(toolNames).toContain('list_processes');
      expect(toolNames).toContain('kill_process');
    });
  });

  describe('read_file tool', () => {
    it('should read existing file', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const readFile = middleware.tools.find(t => t.name === 'read_file')!;
      const result = await readFile.execute({ path: testFile }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello, World!');
      expect(mockContext.emit).toHaveBeenCalledWith('tool_start', expect.any(Object));
      expect(mockContext.emit).toHaveBeenCalledWith('tool_complete', expect.objectContaining({ success: true }));
    });

    it('should fail for non-existent file', async () => {
      const readFile = middleware.tools.find(t => t.name === 'read_file')!;
      const result = await readFile.execute({ path: path.join(testDir, 'nonexistent.txt') }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject paths outside allowed directories', async () => {
      const readFile = middleware.tools.find(t => t.name === 'read_file')!;
      const result = await readFile.execute({ path: '/etc/passwd' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path outside allowed directories');
    });
  });

  describe('write_file tool', () => {
    it('should write new file', async () => {
      const writeFile = middleware.tools.find(t => t.name === 'write_file')!;
      const testFile = path.join(testDir, 'new.txt');

      const result = await writeFile.execute({ path: testFile, content: 'New content' }, mockContext);

      expect(result.success).toBe(true);
      const written = await fs.readFile(testFile, 'utf-8');
      expect(written).toBe('New content');
    });

    it('should overwrite existing file', async () => {
      const writeFile = middleware.tools.find(t => t.name === 'write_file')!;
      const testFile = path.join(testDir, 'existing.txt');
      await fs.writeFile(testFile, 'Old content');

      const result = await writeFile.execute({ path: testFile, content: 'Updated content' }, mockContext);

      expect(result.success).toBe(true);
      const written = await fs.readFile(testFile, 'utf-8');
      expect(written).toBe('Updated content');
    });

    it('should create parent directories', async () => {
      const writeFile = middleware.tools.find(t => t.name === 'write_file')!;
      const testFile = path.join(testDir, 'nested', 'dir', 'file.txt');

      const result = await writeFile.execute({ path: testFile, content: 'Nested content' }, mockContext);

      expect(result.success).toBe(true);
      const written = await fs.readFile(testFile, 'utf-8');
      expect(written).toBe('Nested content');
    });

    it('should reject paths outside allowed directories', async () => {
      const writeFile = middleware.tools.find(t => t.name === 'write_file')!;
      const result = await writeFile.execute({ path: '/tmp/malicious.txt', content: 'bad' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path outside allowed directories');
    });
  });

  describe('edit_file tool', () => {
    it('should edit file with string replacement', async () => {
      const editFile = middleware.tools.find(t => t.name === 'edit_file')!;
      const testFile = path.join(testDir, 'edit.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await editFile.execute({
        path: testFile,
        old_string: 'World',
        new_string: 'Universe',
      }, mockContext);

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hello, Universe!');
    });

    it('should fail if old_string not found', async () => {
      const editFile = middleware.tools.find(t => t.name === 'edit_file')!;
      const testFile = path.join(testDir, 'edit.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await editFile.execute({
        path: testFile,
        old_string: 'Nonexistent',
        new_string: 'Replacement',
      }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('old_string not found in file');
    });

    it('should only replace first occurrence', async () => {
      const editFile = middleware.tools.find(t => t.name === 'edit_file')!;
      const testFile = path.join(testDir, 'edit.txt');
      await fs.writeFile(testFile, 'foo bar foo bar');

      await editFile.execute({
        path: testFile,
        old_string: 'foo',
        new_string: 'baz',
      }, mockContext);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('baz bar foo bar');
    });
  });

  describe('list_directory tool', () => {
    it('should list directory contents', async () => {
      const listDir = middleware.tools.find(t => t.name === 'list_directory')!;
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await listDir.execute({ path: testDir }, mockContext);

      expect(result.success).toBe(true);
      const listing = JSON.parse(result.output);
      expect(listing).toHaveLength(3);
      expect(listing).toContainEqual({ name: 'file1.txt', type: 'file' });
      expect(listing).toContainEqual({ name: 'file2.txt', type: 'file' });
      expect(listing).toContainEqual({ name: 'subdir', type: 'directory' });
    });

    it('should fail for non-existent directory', async () => {
      const listDir = middleware.tools.find(t => t.name === 'list_directory')!;
      const result = await listDir.execute({ path: path.join(testDir, 'nonexistent') }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('execute_shell tool', () => {
    it('should execute simple command', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;

      const result = await execShell.execute({ command: 'echo "hello"' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.trim()).toBe('hello');
    });

    it('should use provided working directory', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;
      await fs.writeFile(path.join(testDir, 'marker.txt'), 'found');

      const result = await execShell.execute({ command: 'ls', cwd: testDir }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('marker.txt');
    });

    it('should block dangerous commands', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;

      const result = await execShell.execute({ command: 'rm -rf /' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command blocked for safety');
    });

    it('should block fork bomb', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;

      const result = await execShell.execute({ command: ':(){:|:&};:' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command blocked for safety');
    });

    it('should return error for failed command', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;

      const result = await execShell.execute({ command: 'false' }, mockContext);

      expect(result.success).toBe(false);
    });

    it('should reject working directory outside allowed paths', async () => {
      const execShell = middleware.tools.find(t => t.name === 'execute_shell')!;

      const result = await execShell.execute({ command: 'ls', cwd: '/tmp' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Working directory outside allowed paths');
    });
  });

  describe('path validation', () => {
    it('should allow paths within allowed directories', async () => {
      const readFile = middleware.tools.find(t => t.name === 'read_file')!;
      const testFile = path.join(testDir, 'nested', 'deep', 'file.txt');
      await fs.mkdir(path.dirname(testFile), { recursive: true });
      await fs.writeFile(testFile, 'content');

      const result = await readFile.execute({ path: testFile }, mockContext);

      expect(result.success).toBe(true);
    });

    it('should reject path traversal attempts', async () => {
      const readFile = middleware.tools.find(t => t.name === 'read_file')!;
      const maliciousPath = path.join(testDir, '..', '..', 'etc', 'passwd');

      const result = await readFile.execute({ path: maliciousPath }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path outside allowed directories');
    });
  });
});
