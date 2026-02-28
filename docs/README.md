# Happy Coder for Cursor - Documentation

This folder documents how Happy Coder for Cursor works internally, with a focus on protocol, backend architecture, deployment, and the CLI tool.

## Index

### Core Documentation
- **[protocol.md](protocol.md)**: Wire protocol (WebSocket), payload formats, sequencing, and concurrency rules.
- **[api.md](api.md)**: HTTP endpoints and authentication flows.
- **[encryption.md](encryption.md)**: Encryption boundaries and on-wire encoding.
- **[backend-architecture.md](backend-architecture.md)**: Internal backend structure, data flow, and key subsystems.
- **[deployment.md](deployment.md)**: How to deploy the backend and required infrastructure.
- **[cli-architecture.md](cli-architecture.md)**: CLI and daemon architecture and how they interact with the server.

### Session & Protocol
- **[session-protocol.md](session-protocol.md)**: Unified encrypted chat event protocol.
- **[session-protocol-claude.md](session-protocol-claude.md)**: Claude-specific session-protocol flow (legacy, for reference).
- **[session-protocol-cursor.md](session-protocol-cursor.md)**: Cursor Agent session-protocol flow.
- **[permission-resolution.md](permission-resolution.md)**: State-based permission mode resolution across app and CLI.

### Shared Packages
- **[happy-wire.md](happy-wire.md)**: Shared wire schemas/types package and migration notes.

## Cursor Agent Specifics

The key difference from the original Happy Coder (Claude Code) is how Cursor Agent handles multi-turn conversations:

1. **No `--input-format stream-json`**: Cursor Agent doesn't support stdin-based message streaming
2. **Per-turn process spawning**: Each conversation turn spawns a new `agent` process
3. **`--resume` for context**: Session continuity is maintained via `--resume <session-id>`
4. **`system/init` for session ID**: The session ID is extracted from the first `system/init` message in stream-json output
5. **Thinking state from stream**: Instead of Claude's `fd3` pipe, thinking status comes from `thinking` type messages

## Conventions
- Paths and field names reflect the current implementation in `packages/happy-server`.
- Examples are illustrative; the canonical source is the code.
