# DeepAgents Harness: Origin and Construction

## Overview

DeepAgents is a Python framework for building AI agents capable of handling long-horizon, multi-step tasks. This document describes the origin of the project and the technical approach used to construct the agent harness.

---

## Origin and Motivation

### The Problem Statement

The project addresses a documented limitation in agent architectures: simple LLM tool-calling loops—where a language model repeatedly calls tools in sequence—tend to fail when applied to complex, multi-step tasks. The README describes agents built this way as "shallow" agents.

Research from METR (Model Evaluation and Threat Research) is cited in the project documentation, noting that "agent task length [is] doubling every 7 months," indicating growing demand for agents that can sustain longer task horizons.

### Primary Inspiration

The project README contains the following acknowledgement:

> "This project was primarily inspired by Claude Code, and initially was largely an attempt to see what made Claude Code general purpose, and make it even more so."

This statement establishes that the harness was created through analysis of Claude Code's architecture, with the goal of extracting generalizable patterns and making them available as an open-source framework.

### Secondary Inspirations

In addition to Claude Code, the documentation references two other applications as exemplars of successful long-horizon agents:

1. **Manus** - Referenced with a YouTube link as an example of deep agent architecture
2. **Deep Research** - Mentioned as another application demonstrating the four-principle approach

---

## The Four Principles

The project identifies four common elements present in successful agent applications:

| Principle | Purpose |
|-----------|---------|
| **Planning Tool** | Enables task decomposition and progress tracking |
| **Filesystem Access** | Provides context offloading and variable-length storage |
| **Sub-agent Delegation** | Allows isolated execution with separate context windows |
| **Detailed Prompting** | Guides agent behavior through comprehensive instructions |

These four principles form the architectural foundation of the DeepAgents harness.

---

## Technical Implementation

### Framework Selection

The harness is built on top of:

- **LangChain** (v1.1.0+) - Agent abstractions and middleware system
- **LangGraph** - State graph orchestration for agent execution
- **LangChain-Anthropic** (v1.2.0+) - Claude model integration

The agent produced by `create_deep_agent()` is a compiled LangGraph `StateGraph`, which allows integration with LangGraph's streaming, checkpointing, and human-in-the-loop capabilities.

### Middleware Architecture

The harness implements each of the four principles through separate middleware components. The factory function `create_deep_agent()` (located in `libs/deepagents/deepagents/graph.py`) assembles these middleware in the following order:

```python
deepagent_middleware = [
    TodoListMiddleware(),
    FilesystemMiddleware(backend=backend),
    SubAgentMiddleware(...),
    SummarizationMiddleware(...),
    AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore"),
    PatchToolCallsMiddleware(),
]
```

#### Middleware Components

**TodoListMiddleware** (from LangChain)
- Provides `write_todos` and `read_todos` tools
- Enables agents to decompose tasks and track progress
- Implements the "planning tool" principle

**FilesystemMiddleware** (from DeepAgents)
- Provides seven tools: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, and `execute`
- Implements path validation to prevent directory traversal
- Supports pluggable backends for different storage mechanisms
- Implements the "filesystem access" principle

**SubAgentMiddleware** (from DeepAgents)
- Provides the `task` tool for spawning isolated subagents
- Subagents receive their own context window, preventing pollution of the main agent's context
- Supports both declarative subagent specifications and pre-compiled LangGraph graphs
- Implements the "sub-agent delegation" principle

**SummarizationMiddleware** (from LangChain)
- Monitors context length and triggers automatic summarization
- Default trigger: 170,000 tokens (or 85% of max_input_tokens if model profile available)
- Preserves recent messages while compressing older context

**AnthropicPromptCachingMiddleware** (from LangChain-Anthropic)
- Caches system prompts to reduce API costs
- Configured to ignore non-Anthropic models

**PatchToolCallsMiddleware** (from DeepAgents)
- Repairs dangling tool calls that may result from interruptions

**HumanInTheLoopMiddleware** (from LangChain, optional)
- Added when `interrupt_on` configuration is provided
- Pauses execution for human approval on sensitive operations

### Backend System

The filesystem middleware operates through a pluggable backend protocol. Four backend implementations are provided:

| Backend | Storage Location | Persistence |
|---------|------------------|-------------|
| StateBackend | LangGraph state | Ephemeral (conversation-scoped) |
| FilesystemBackend | Local disk | Persistent |
| StoreBackend | LangGraph Store | Persistent (cross-conversation) |
| CompositeBackend | Routes paths to different backends | Configurable |

The `StateBackend` is the default, storing files as in-memory dictionaries within the LangGraph state.

### System Prompt Construction

The documentation states that the default system prompt is:

> "heavily based on and inspired by attempts to replicate Claude Code's system prompt"

Two community reverse-engineering efforts are referenced:
- `github.com/kn1026/cc/blob/main/claudecode.md`
- `github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-code.md`

The documentation notes that this prompt was "made more general purpose than Claude Code's system prompt" to support a wider range of use cases beyond coding tasks.

Each middleware component injects its own instructions into the system prompt, explaining the tools it provides and guidance for their use.

### Default Model

The harness defaults to Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) with a max_tokens setting of 20,000. This can be overridden by passing any LangChain-compatible model to the factory function.

---

## Factory Function Interface

The `create_deep_agent()` function accepts the following parameters:

| Parameter | Type | Purpose |
|-----------|------|---------|
| `model` | str \| BaseChatModel | LLM to use |
| `tools` | Sequence | Custom tools to add |
| `system_prompt` | str | Additional instructions (appended to defaults) |
| `middleware` | Sequence | Additional middleware |
| `subagents` | list | Custom subagent definitions |
| `backend` | BackendProtocol | Storage backend |
| `interrupt_on` | dict | HITL configuration |
| `checkpointer` | Checkpointer | State persistence |
| `store` | BaseStore | Long-term storage |

The function returns a compiled `StateGraph` configured with a recursion limit of 1,000.

---

## Project Structure

The harness is organized as a monorepo with three packages:

```
deepagents/
├── libs/
│   ├── deepagents/          # Core library
│   │   ├── deepagents/
│   │   │   ├── graph.py           # Factory function
│   │   │   ├── middleware/        # Filesystem, subagents, patches
│   │   │   └── backends/          # Storage implementations
│   │   └── tests/
│   ├── deepagents-cli/      # Interactive terminal interface
│   └── harbor/              # Benchmark integration
```

---

## Dependencies

Core library requirements from `pyproject.toml`:

- `langchain>=1.1.0`
- `langchain-core>=1.1.0`
- `langchain-anthropic>=1.2.0`
- `wcmatch` (for glob pattern matching)

Python version requirement: `>=3.11,<4.0`

---

## Summary

The DeepAgents harness was constructed by:

1. Identifying four principles common to successful long-horizon agents (planning, filesystem, subagents, prompting)
2. Drawing primary inspiration from Claude Code's architecture
3. Implementing each principle as modular LangChain middleware
4. Providing a pluggable backend system for storage flexibility
5. Creating a factory function that assembles these components into a LangGraph agent

The result is a framework that encapsulates patterns observed in production agent applications while remaining extensible for custom use cases.
