import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  emit: (event: string, data: unknown) => void;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolSchemas(): Array<{
    name: string;
    description: string;
    input_schema: object;
  }> {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.inputSchema),
    }));
  }

  private zodToJsonSchema(schema: z.ZodType<unknown>): object {
    // Simplified Zod to JSON Schema conversion
    // In production, use zod-to-json-schema package
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodType<unknown>>;
      const properties: Record<string, object> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    return { type: 'string' };
  }
}
