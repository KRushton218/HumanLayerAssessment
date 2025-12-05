import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { Middleware } from './types.js';
import { ToolDefinition, ToolContext, ToolResult, ToolRegistry } from '../tools/ToolRegistry.js';

const SpawnSubtaskSchema = z.object({
  prompt: z.string().describe('Clear, specific instructions for the subtask'),
  allowedTools: z.array(z.string()).optional().describe('List of tool names the subtask can use. Defaults to file tools only.'),
  maxTokens: z.number().optional().describe('Maximum tokens for subtask response. Defaults to 4096.'),
});

interface SubtaskResult {
  summary: string;
  filesCreated: string[];
  filesModified: string[];
  success: boolean;
}

export class SubAgentMiddleware implements Middleware {
  name = 'SubAgentMiddleware';
  private client: Anthropic;
  private model: string;
  private toolRegistry: ToolRegistry;
  private apiKey: string | undefined;

  constructor(toolRegistry: ToolRegistry, model = 'claude-sonnet-4-20250514', apiKey?: string) {
    this.apiKey = apiKey;
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
    this.model = model;
    this.toolRegistry = toolRegistry;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey });
  }

  systemPrompt = `## Sub-task Delegation
You can spawn isolated subtasks using spawn_subtask for well-defined, focused work.
- Subtasks have their own context window (no access to your conversation history)
- Use for: research, boilerplate generation, testing, isolated file operations
- Provide clear, specific prompts with all necessary context
- Subtasks return a summary of their work

Best practices:
- Only delegate truly independent work
- Include all context the subtask needs in the prompt
- Keep subtask scope narrow and focused`;

  tools: ToolDefinition[] = [
    {
      name: 'spawn_subtask',
      description: 'Spawn an isolated subtask with its own context window. Use for focused, well-defined work that does not need your conversation history.',
      inputSchema: SpawnSubtaskSchema,
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = SpawnSubtaskSchema.parse(input);
        const subtaskId = uuidv4();
        const allowedTools = parsed.allowedTools || ['read_file', 'write_file', 'edit_file', 'list_directory'];
        const maxTokens = parsed.maxTokens || 4096;

        context.emit('subtask_start', { id: subtaskId, prompt: parsed.prompt });

        try {
          const result = await this.executeSubtask(
            parsed.prompt,
            allowedTools,
            maxTokens,
            context
          );

          context.emit('subtask_complete', { id: subtaskId, ...result });

          return {
            success: result.success,
            output: JSON.stringify(result, null, 2),
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('subtask_complete', { id: subtaskId, success: false, error });
          return { success: false, output: '', error };
        }
      },
    },
  ];

  private async executeSubtask(
    prompt: string,
    allowedToolNames: string[],
    maxTokens: number,
    context: ToolContext
  ): Promise<SubtaskResult> {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];

    // Get allowed tools from registry
    const allowedTools = allowedToolNames
      .map(name => this.toolRegistry.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);

    const toolSchemas = allowedTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.inputSchema),
    }));

    const subtaskSystemPrompt = `You are a focused assistant completing a specific subtask.
Complete the task efficiently and report your results.
You have access to file tools for reading and writing files.
Work within the scope of the task - do not expand beyond what is asked.`;

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: prompt },
    ];

    // Subtask agent loop
    let continueLoop = true;
    let iterations = 0;
    const maxIterations = 10;

    while (continueLoop && iterations < maxIterations) {
      iterations++;
      continueLoop = false;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: subtaskSystemPrompt,
        messages,
        tools: toolSchemas.length > 0 ? toolSchemas as Anthropic.Tool[] : undefined,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        continueLoop = true;
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const tool = allowedTools.find(t => t.name === toolUse.name);
          if (tool) {
            const result = await tool.execute(toolUse.input, context);

            // Track file operations
            const toolInput = toolUse.input as Record<string, unknown>;
            if (toolUse.name === 'write_file' && result.success) {
              filesCreated.push(toolInput.path as string);
            } else if (toolUse.name === 'edit_file' && result.success) {
              filesModified.push(toolInput.path as string);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.success ? result.output : `Error: ${result.error}`,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      } else {
        // Extract final text response
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        return {
          summary: textBlock?.text || 'Subtask completed',
          filesCreated,
          filesModified,
          success: true,
        };
      }
    }

    return {
      summary: 'Subtask completed (max iterations reached)',
      filesCreated,
      filesModified,
      success: true,
    };
  }

  private zodToJsonSchema(schema: z.ZodType<unknown>): object {
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

    if (schema instanceof z.ZodString) return { type: 'string' };
    if (schema instanceof z.ZodNumber) return { type: 'number' };
    if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
    if (schema instanceof z.ZodArray) {
      return { type: 'array', items: this.zodToJsonSchema(schema.element) };
    }
    if (schema instanceof z.ZodEnum) {
      return { type: 'string', enum: schema.options };
    }
    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    return { type: 'string' };
  }

  setModel(model: string): void {
    this.model = model;
  }
}
