# Session Protocol: Cursor Agent

This document describes the session-protocol flow specific to the Cursor Agent integration, covering both local and remote modes.

## Architecture Overview

```
┌─────────────┐     ┌────────────┐     ┌──────────────┐
│  Mobile/Web  │◄───►│   Server   │◄───►│  Happy CLI   │
│   Client     │     │  (Relay)   │     │  (Wrapper)   │
└─────────────┘     └────────────┘     └──────┬───────┘
                                              │
                                        ┌─────┴──────┐
                                        │   Cursor    │
                                        │   Agent     │
                                        │  (agent)    │
                                        └────────────┘
```

## Local Mode

In local mode, the user interacts directly with Cursor Agent via terminal:

1. `cursorLocal()` spawns `agent` with `stdio: 'inherit'`
2. User types directly into the agent
3. The Happy CLI monitors for mode switch requests from the mobile app
4. When a switch is requested, the agent process is terminated and restarted in remote mode

## Remote Mode

In remote mode, the mobile/web client sends messages to the agent:

### Per-Turn Process Model

```
Turn 1: agent -p --output-format stream-json --trust "user message 1"
         → system/init (session_id: "abc-123")
         → thinking deltas
         → assistant response
         → result

Turn 2: agent -p --output-format stream-json --trust --resume abc-123 "user message 2"
         → system/init (session_id: "abc-123")
         → thinking deltas
         → assistant response
         → result

... and so on
```

### Message Flow

1. Mobile app sends message via WebSocket → Server → CLI
2. `cursorRemote()` calls `cursorQuery()` with the message as prompt
3. If resuming, includes `--resume <session-id>`
4. Reads NDJSON from stdout:
   - `system/init` → extract `session_id`, report to server
   - `thinking` → update thinking state, report to server
   - `assistant` → forward to mobile app
   - `result` → mark turn complete, wait for next message
5. On next message, spawn new process with `--resume`

### Session ID Lifecycle

```
Initial session:
  system/init → session_id = "abc-123"
  → stored in CursorSession
  → sent to server as metadata

Resume:
  --resume abc-123
  system/init → session_id = "abc-123" (same)
  → context preserved
```

## Thinking State

Cursor Agent emits thinking status via `stream-json` messages:

```json
{"type": "thinking", "subtype": "delta", "content": "Let me think..."}
{"type": "thinking", "subtype": "completed", "content": "Full thought"}
```

This replaces Claude Code's `fd3` pipe mechanism. The `onThinkingChange` callback is driven by these messages.

## Permission Mapping

| Happy Mode | Cursor Agent Flag |
|-----------|------------------|
| `bypassPermissions` / `yolo` | `--force` |
| `plan` | `--mode plan` |
| `read-only` | `--mode ask` |
| `default` | (no flag) |

## Key Differences from Claude Code

| Aspect | Claude Code | Cursor Agent |
|--------|------------|--------------|
| Multi-turn | Single process, stdin streaming | New process per turn |
| Thinking | fd3 pipe | stream-json messages |
| Session ID | Hook server injection | system/init message |
| Session files | ~/.claude/sessions/*.jsonl | Not used |
| SDK | @agentclientprotocol/sdk | Custom cursorQuery() |
| MCP config | --mcp-config inline | .cursor/mcp.json file |
