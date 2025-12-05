export interface ApprovalRequest {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  summary: string;
  isDangerous: boolean;
  timestamp: number;
  suggestedPattern?: string;
}

export interface ApprovalResponse {
  requestId: string;
  decision: 'allow_once' | 'allow_pattern' | 'allow_tool' | 'deny';
  pattern?: string;
}

export interface SessionApprovalState {
  trustedTools: Set<string>;
  trustedPatterns: Map<string, Set<string>>; // toolName -> Set of glob patterns
}

// Tools that require approval before execution
export const APPROVAL_REQUIRED_TOOLS = new Set([
  'execute_shell',
  'write_file',
  'edit_file',
]);

// Dangerous command patterns that ALWAYS require approval, even if tool is trusted
export const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+(-[rRf]+\s+)*[~\/]/,           // rm -rf with home or root
  /rm\s+-rf\s+\*/,                      // rm -rf *
  /sudo\s+/,                            // Any sudo command
  /mkfs/,                               // Filesystem formatting
  /dd\s+if=/,                           // Raw disk operations
  /chmod\s+777/,                        // Dangerous permissions
  />\s*\/dev\//,                        // Writing to devices
  /curl.*\|\s*(bash|sh)/,               // Pipe curl to shell
  /wget.*\|\s*(bash|sh)/,               // Pipe wget to shell
  /:\s*\(\)\s*\{.*\}.*:/,               // Fork bomb pattern
  /\bkill\s+-9\s+-1\b/,                 // Kill all processes
  />\s*\/etc\//,                        // Writing to /etc
  /npm\s+(exec|x)\s+/,                  // npm exec (can run arbitrary code)
];
