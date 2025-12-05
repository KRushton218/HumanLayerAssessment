import Anthropic from '@anthropic-ai/sdk';

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface NameGenerationInput {
  userMessage: string;
  assistantText: string;
  toolCalls: ToolCall[];
}

interface NameGenerationResult {
  name: string;
  summary: string;
}

export class CheckpointNameGenerator {
  private client: Anthropic | null = null;
  private apiKey: string | undefined;

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate a short name (2-5 words) for a checkpoint
   */
  async generateName(input: NameGenerationInput): Promise<NameGenerationResult> {
    // Strategy 1: Extract from assistant text (free, fast)
    const extracted = this.extractFromText(input.assistantText);
    if (extracted) {
      return {
        name: extracted,
        summary: this.buildToolSummary(input.toolCalls),
      };
    }

    // Strategy 2: Generate from tools (simple cases, no API call)
    if (input.toolCalls.length > 0 && input.toolCalls.length <= 3) {
      return {
        name: this.nameFromTools(input.toolCalls),
        summary: this.buildToolSummary(input.toolCalls),
      };
    }

    // Strategy 3: Haiku summarization (complex cases with 5+ tools)
    if (this.client && input.toolCalls.length >= 5) {
      const name = await this.summarizeWithHaiku(input);
      return {
        name,
        summary: this.buildToolSummary(input.toolCalls),
      };
    }

    // Strategy 4: Simple tool-based name for medium complexity
    if (input.toolCalls.length > 0) {
      return {
        name: this.nameFromTools(input.toolCalls),
        summary: this.buildToolSummary(input.toolCalls),
      };
    }

    // Fallback: Truncate user message
    return {
      name: this.truncateUserMessage(input.userMessage),
      summary: input.toolCalls.length === 0 ? 'Text response only' : this.buildToolSummary(input.toolCalls),
    };
  }

  private extractFromText(text: string): string | null {
    if (!text || text.length < 5) return null;

    // Pattern 1: "I'll [action]" -> extract action
    const illMatch = text.match(/I'll\s+([\w\s]{3,30}?)(?:\.|,|!|\n|$)/i);
    if (illMatch) {
      return this.cleanAndTruncate(illMatch[1]);
    }

    // Pattern 2: "Let me [action]"
    const letMeMatch = text.match(/Let me\s+([\w\s]{3,30}?)(?:\.|,|!|\n|$)/i);
    if (letMeMatch) {
      return this.cleanAndTruncate(letMeMatch[1]);
    }

    // Pattern 3: "Done! [action]" or "Completed [action]"
    const doneMatch = text.match(/(?:Done!?|Completed|Finished)\s+([\w\s]{3,30}?)(?:\.|,|!|\n|$)/i);
    if (doneMatch) {
      return this.cleanAndTruncate(doneMatch[1]);
    }

    // Pattern 4: First sentence if short enough
    const firstSentence = text.match(/^([^.!?\n]{5,40})[.!?]/);
    if (firstSentence) {
      return this.cleanAndTruncate(firstSentence[1]);
    }

    return null;
  }

  private cleanAndTruncate(text: string): string {
    const words = text.trim().split(/\s+/).slice(0, 5);
    // Remove trailing articles/prepositions
    const trailingWords = ['the', 'a', 'an', 'to', 'for', 'with', 'in', 'on', 'at', 'by'];
    while (words.length > 2 && trailingWords.includes(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
    // Capitalize first word
    if (words.length > 0) {
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    }
    return words.join(' ');
  }

  private nameFromTools(tools: ToolCall[]): string {
    if (tools.length === 0) return 'Respond to user';

    const first = tools[0];
    switch (first.name) {
      case 'write_file': {
        const writePath = (first.input.path as string) || '';
        const fileName = writePath.split('/').pop() || 'file';
        return `Create ${fileName}`;
      }
      case 'edit_file': {
        const editPath = (first.input.path as string) || '';
        const editName = editPath.split('/').pop() || 'file';
        return `Edit ${editName}`;
      }
      case 'execute_shell': {
        const cmd = (first.input.command as string) || '';
        const baseCmd = cmd.split(/\s+/)[0];
        if (baseCmd === 'npm') {
          const subCmd = cmd.split(/\s+/)[1] || '';
          return `Run npm ${subCmd}`;
        }
        if (baseCmd === 'git') {
          const subCmd = cmd.split(/\s+/)[1] || '';
          return `Git ${subCmd}`;
        }
        return `Run ${baseCmd}`;
      }
      case 'read_file': {
        if (tools.length === 1) {
          const readPath = (first.input.path as string) || '';
          const readName = readPath.split('/').pop() || 'file';
          return `Read ${readName}`;
        }
        return 'Read files';
      }
      case 'list_directory':
        return 'Explore directory';
      case 'spawn_subtask':
        return 'Run subtask';
      default:
        return `Run ${first.name}`;
    }
  }

  private buildToolSummary(tools: ToolCall[]): string {
    if (tools.length === 0) return 'Text response only';

    const summaries = tools.slice(0, 5).map(t => {
      switch (t.name) {
        case 'write_file':
          return `Write ${t.input.path}`;
        case 'edit_file':
          return `Edit ${t.input.path}`;
        case 'execute_shell':
          return `Run: ${(t.input.command as string)?.slice(0, 50)}`;
        case 'read_file':
          return `Read ${t.input.path}`;
        case 'list_directory':
          return `List ${t.input.path}`;
        default:
          return t.name;
      }
    });

    if (tools.length > 5) {
      summaries.push(`... and ${tools.length - 5} more`);
    }

    return summaries.join(', ');
  }

  private async summarizeWithHaiku(input: NameGenerationInput): Promise<string> {
    const toolList = input.toolCalls.slice(0, 10).map(t => {
      if (t.name === 'write_file') return `wrote ${t.input.path}`;
      if (t.name === 'edit_file') return `edited ${t.input.path}`;
      if (t.name === 'execute_shell') return `ran ${(t.input.command as string)?.slice(0, 30)}`;
      return t.name;
    }).join(', ');

    const prompt = `Summarize this coding action in 2-5 words. Be concise.
User asked: "${input.userMessage.slice(0, 100)}"
Actions: ${toolList}
Reply with ONLY the summary, no quotes or punctuation.`;

    try {
      const response = await this.client!.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0];
      if (text.type === 'text') {
        return text.text.trim().replace(/[".]/g, '');
      }
    } catch (err) {
      console.error('Haiku summarization failed:', err);
    }

    return this.truncateUserMessage(input.userMessage);
  }

  private truncateUserMessage(msg: string): string {
    const words = msg.split(/\s+/).slice(0, 4);
    if (words.length > 0) {
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    }
    return words.join(' ') + (msg.split(/\s+/).length > 4 ? '...' : '');
  }
}
