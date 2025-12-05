import { v4 as uuidv4 } from 'uuid';
import {
  ApprovalRequest,
  ApprovalResponse,
  SessionApprovalState,
  APPROVAL_REQUIRED_TOOLS,
  DANGEROUS_PATTERNS,
} from './types.js';

export class ApprovalManager {
  private sessionStates = new Map<string, SessionApprovalState>();
  private pendingApprovals = new Map<string, {
    resolve: (approved: boolean) => void;
    request: ApprovalRequest;
  }>();

  getOrCreateSessionState(sessionId: string): SessionApprovalState {
    if (!this.sessionStates.has(sessionId)) {
      this.sessionStates.set(sessionId, {
        trustedTools: new Set(),
        trustedPatterns: new Map(),
      });
    }
    return this.sessionStates.get(sessionId)!;
  }

  /**
   * Check if tool execution requires approval
   */
  checkApproval(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): { needsApproval: boolean; request?: ApprovalRequest } {
    // Tools that don't need approval
    if (!APPROVAL_REQUIRED_TOOLS.has(toolName)) {
      return { needsApproval: false };
    }

    const state = this.getOrCreateSessionState(sessionId);
    const isDangerous = this.isDangerousCommand(toolName, toolInput);
    const summary = this.generateSummary(toolName, toolInput);

    // Dangerous commands ALWAYS require approval
    if (isDangerous) {
      return {
        needsApproval: true,
        request: this.createRequest(sessionId, toolName, toolInput, summary, true),
      };
    }

    // Check if tool is globally trusted for session
    if (state.trustedTools.has(toolName)) {
      return { needsApproval: false };
    }

    // Check if command matches a trusted pattern
    if (this.matchesTrustedPattern(state, toolName, toolInput)) {
      return { needsApproval: false };
    }

    // Needs approval
    return {
      needsApproval: true,
      request: this.createRequest(sessionId, toolName, toolInput, summary, false),
    };
  }

  private createRequest(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    summary: string,
    isDangerous: boolean
  ): ApprovalRequest {
    return {
      requestId: uuidv4(),
      sessionId,
      toolName,
      toolInput,
      summary,
      isDangerous,
      timestamp: Date.now(),
      suggestedPattern: this.suggestPattern(toolName, toolInput),
    };
  }

  private isDangerousCommand(toolName: string, input: Record<string, unknown>): boolean {
    if (toolName === 'execute_shell') {
      const command = input.command as string;
      return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
    }
    return false;
  }

  private matchesTrustedPattern(
    state: SessionApprovalState,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    const patterns = state.trustedPatterns.get(toolName);
    if (!patterns || patterns.size === 0) return false;

    const commandStr = this.getPatternMatchString(toolName, input);

    for (const pattern of patterns) {
      if (this.matchesGlob(commandStr, pattern)) {
        return true;
      }
    }
    return false;
  }

  private getPatternMatchString(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'execute_shell':
        return input.command as string;
      case 'write_file':
      case 'edit_file':
        return input.path as string;
      default:
        return JSON.stringify(input);
    }
  }

  private matchesGlob(str: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(str);
  }

  private generateSummary(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'execute_shell':
        return `Run: ${input.command}`;
      case 'write_file':
        return `Write to: ${input.path}`;
      case 'edit_file':
        return `Edit: ${input.path}`;
      default:
        return `Execute ${toolName}`;
    }
  }

  /**
   * Generate a suggested pattern from the command/path
   */
  suggestPattern(toolName: string, input: Record<string, unknown>): string | undefined {
    if (toolName === 'execute_shell') {
      const command = (input.command as string).trim();
      // Extract the base command (first word)
      const parts = command.split(/\s+/);
      if (parts.length > 0) {
        // Suggest "command *" pattern
        return `${parts[0]} *`;
      }
    } else if (toolName === 'write_file' || toolName === 'edit_file') {
      const path = input.path as string;
      // Suggest directory/* pattern
      const lastSlash = path.lastIndexOf('/');
      if (lastSlash > 0) {
        const dir = path.substring(0, lastSlash);
        return `${dir}/*`;
      }
    }
    return undefined;
  }

  /**
   * Register a pending approval request
   * Returns a promise that resolves when user responds
   */
  async waitForApproval(request: ApprovalRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(request.requestId, { resolve, request });

      // Timeout after 5 minutes - auto-deny
      setTimeout(() => {
        if (this.pendingApprovals.has(request.requestId)) {
          this.pendingApprovals.delete(request.requestId);
          resolve(false);
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Handle approval response from frontend
   */
  handleResponse(response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(response.requestId);
    if (!pending) {
      return false; // Request expired or already handled
    }

    const { resolve, request } = pending;
    this.pendingApprovals.delete(response.requestId);

    const state = this.getOrCreateSessionState(request.sessionId);

    switch (response.decision) {
      case 'allow_once':
        resolve(true);
        break;

      case 'allow_pattern':
        if (response.pattern) {
          if (!state.trustedPatterns.has(request.toolName)) {
            state.trustedPatterns.set(request.toolName, new Set());
          }
          state.trustedPatterns.get(request.toolName)!.add(response.pattern);
        }
        resolve(true);
        break;

      case 'allow_tool':
        // For dangerous commands, we NEVER allow trusting the whole tool
        if (!request.isDangerous) {
          state.trustedTools.add(request.toolName);
        }
        resolve(true);
        break;

      case 'deny':
        resolve(false);
        break;
    }

    return true;
  }

  /**
   * Clear session state (for testing or session cleanup)
   */
  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }
}
