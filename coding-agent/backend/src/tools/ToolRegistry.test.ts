import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, ToolDefinition, ToolContext, ToolResult } from './ToolRegistry.js';

describe('ToolRegistry', () => {
  const createMockContext = (): ToolContext => ({
    sessionId: 'test-session',
    workingDirectory: '/test',
    emit: vi.fn(),
  });

  const createMockTool = (name: string): ToolDefinition => ({
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({
      value: z.string(),
    }),
    execute: async (input: unknown): Promise<ToolResult> => {
      const parsed = z.object({ value: z.string() }).parse(input);
      return { success: true, output: `Executed ${name} with ${parsed.value}` };
    },
  });

  describe('register', () => {
    it('should register a tool', () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('test_tool');

      registry.register(tool);

      expect(registry.get('test_tool')).toBe(tool);
    });

    it('should overwrite existing tool with same name', () => {
      const registry = new ToolRegistry();
      const tool1 = createMockTool('test_tool');
      const tool2 = createMockTool('test_tool');
      tool2.description = 'Updated description';

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.get('test_tool')?.description).toBe('Updated description');
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent tool', () => {
      const registry = new ToolRegistry();

      expect(registry.get('non_existent')).toBeUndefined();
    });

    it('should return registered tool', () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('my_tool');
      registry.register(tool);

      expect(registry.get('my_tool')).toBe(tool);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tools registered', () => {
      const registry = new ToolRegistry();

      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered tools', () => {
      const registry = new ToolRegistry();
      const tool1 = createMockTool('tool1');
      const tool2 = createMockTool('tool2');

      registry.register(tool1);
      registry.register(tool2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(tool1);
      expect(all).toContain(tool2);
    });
  });

  describe('getToolSchemas', () => {
    it('should convert Zod schemas to JSON Schema', () => {
      const registry = new ToolRegistry();
      const tool: ToolDefinition = {
        name: 'complex_tool',
        description: 'A complex tool',
        inputSchema: z.object({
          name: z.string(),
          count: z.number(),
          enabled: z.boolean(),
          tags: z.array(z.string()),
          status: z.enum(['active', 'inactive']),
          optional: z.string().optional(),
        }),
        execute: async () => ({ success: true, output: 'done' }),
      };

      registry.register(tool);
      const schemas = registry.getToolSchemas();

      expect(schemas).toHaveLength(1);
      expect(schemas[0].name).toBe('complex_tool');
      expect(schemas[0].description).toBe('A complex tool');

      const inputSchema = schemas[0].input_schema as {
        type: string;
        properties: Record<string, { type?: string; enum?: string[] }>;
        required?: string[];
      };
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties.name).toEqual({ type: 'string' });
      expect(inputSchema.properties.count).toEqual({ type: 'number' });
      expect(inputSchema.properties.enabled).toEqual({ type: 'boolean' });
      expect(inputSchema.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
      expect(inputSchema.properties.status).toEqual({ type: 'string', enum: ['active', 'inactive'] });
      expect(inputSchema.required).toContain('name');
      expect(inputSchema.required).toContain('count');
      expect(inputSchema.required).not.toContain('optional');
    });
  });

  describe('tool execution', () => {
    it('should execute tool with valid input', async () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('exec_tool');
      registry.register(tool);

      const context = createMockContext();
      const result = await registry.get('exec_tool')!.execute({ value: 'test' }, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Executed exec_tool with test');
    });

    it('should throw on invalid input schema', async () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('strict_tool');
      registry.register(tool);

      const context = createMockContext();

      await expect(
        registry.get('strict_tool')!.execute({ invalid: 'input' }, context)
      ).rejects.toThrow();
    });
  });
});
