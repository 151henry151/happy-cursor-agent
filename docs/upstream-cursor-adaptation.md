# Upstream Cursor adaptation (commit 1c8bd64)

This doc summarizes the [initial Happy Coder for Cursor Agent commit](https://github.com/solarcell1475/happy-cursor-agent/commit/1c8bd64bd54c0f319ed7361c6ac519bfdcac1f63) and how our fork aligns or differs.

## What upstream did

- **New `cursor/` module**: `cursorLocal`, `cursorRemote`, `cursorRemoteLauncher`, `cursorQuery` (SDK), `runCursor`, `session`, `utils/cursorPath`.
- **Per-turn process model**: Cursor Agent does not support `--input-format stream-json`. Each user message is handled by spawning a new `agent` process with the prompt as the last argument and `--output-format stream-json`. Multi-turn context uses `--resume <session-id>` (session ID from `system/init` in the stream).
- **Session ID**: From the Cursor Agent stream-json `system/init` message, not from a Hook Server (unlike Claude).
- **Thinking state**: From stream-json `thinking` messages instead of Claude’s fd3 pipe.
- **Permission mapping**: `bypassPermissions`/`yolo` → `--force`, `plan` → `--mode plan`, `read-only` → `--mode ask`.
- **Agent binary**: `getCursorAgentPath()` resolves `agent` via `CURSOR_AGENT_PATH`, `~/.local/bin/agent`, `/usr/local/bin/agent`, or `which agent`.
- **cursorQuery**: Spawns `agent -p --output-format stream-json --trust [--resume <id>] [--model ...] [--workspace ...] "<prompt>"` and reads NDJSON from stdout; message types are compatible with the Claude SDK so existing converters/formatters work.

See `docs/session-protocol-cursor.md` in the repo for the protocol description.

## What upstream did *not* do (in that commit)

- **Daemon spawn for Cursor**: In the same commit, the daemon’s `run.ts` only handled `claude`, `codex`, and `gemini` in the spawn switch. Passing `agent: 'cursor'` would return “Unsupported agent type: 'cursor'”. So the web → daemon → `happy cursor` flow was not wired in that single commit; they may not have had it fully working end-to-end.

## Our fork

- We kept the same **cursor/** design: `cursorRemote` + `cursorQuery` per-turn spawn, same message flow and SDK compatibility.
- We **added** Cursor to the daemon: normalized `options.agent` and a `case 'cursor'` so the daemon spawns `happy cursor --happy-starting-mode remote --started-by daemon`.
- We added **message delivery diagnostics** in the CLI (`apiSession.ts`: socket `new-message` logging, `fetchMessages` count, `routeIncomingMessage` and decrypt error handling) and optional server logging for `new-message` emit count.
- We added **polling** in the CLI (e.g. every 2.5s) so messages can be received via REST if the socket push is missed, and fixed first-message handling when `lastSeq === 0`.

If the agent still does not respond, the next place to look is whether the web app’s POST to `/v3/sessions/:id/messages` succeeds and whether the CLI log shows “Received new-message event” or “fetchMessages response” with `count > 0` and “Routed user message to callback/queue”.
