<div align="center"><img src="/.github/logotype-dark.png" width="400" title="Happy Coder for Cursor" alt="Happy Coder for Cursor"/></div>

<h1 align="center">
  Mobile and Web Client for Cursor Agent
</h1>

<h4 align="center">
Control Cursor Agent from anywhere with end-to-end encryption.
</h4>

<div align="center">

[🌐 **Web App**](https://app.happy.engineering) • [📚 **Documentation**](./docs/) • [🎥 **Demo**](https://youtu.be/GCS0OG9QMSE)

</div>

<img width="5178" height="2364" alt="github" src="/.github/header.png" />


<h3 align="center">
Step 1: Install CLI on your computer
</h3>

```bash
npm install -g happy-cursor-coder
```

<h3 align="center">
Run From Source (Repo Checkout)
</h3>

```bash
# from repository root
yarn install
yarn cli --help
yarn cli cursor
```

<h3 align="center">
Step 2: Start using `happy cursor` to control Cursor Agent remotely
</h3>

```bash
# Start Cursor Agent with mobile/web control
happy cursor

# Start in remote mode (for daemon/headless)
happy cursor --happy-starting-mode remote

# Start with auto-approve permissions
happy cursor --yolo

# Use plan mode (read-only)
happy cursor --mode plan
```

<div align="center"><img src="/.github/mascot.png" width="200" title="Happy Coder for Cursor" alt="Happy Coder for Cursor"/></div>

## How does it work?

On your computer, run `happy cursor` to start Cursor Agent through our wrapper. When you want to control your coding agent from your phone or browser, it restarts the session in remote mode using `--resume` for seamless context continuity. To switch back to your computer, just press any key on your keyboard.

### Key Architecture Decisions

Unlike Claude Code which supports bidirectional stdin/stdout streaming (`--input-format stream-json`), **Cursor Agent requires a new process per conversation turn**. We solve this by:

1. Extracting `session_id` from the `system/init` message in `stream-json` output
2. Spawning a new `agent -p --output-format stream-json --resume <session-id>` for each turn
3. Maintaining full conversation context across turns via `--resume`

This is transparent to the user — the mobile/web client sees a continuous conversation.

## 🔥 Why Happy Coder for Cursor?

- 📱 **Mobile access to Cursor Agent** - Check what your AI is building while away from your desk
- 🔔 **Push notifications** - Get alerted when Cursor Agent needs permission or encounters errors
- ⚡ **Switch devices instantly** - Take control from phone or desktop with one keypress
- 🔐 **End-to-end encrypted** - Your code never leaves your devices unencrypted
- 🛠️ **Open source** - Audit the code yourself. No telemetry, no tracking
- 🧪 **Fully tested** - 24 tests covering permissions, thinking state, sessions, multi-turn, abort, and integration

## 📦 Project Components

- **[Happy App](./packages/happy-app)** - Web UI + mobile client (Expo)
- **[Happy CLI](./packages/happy-cli)** - Command-line interface wrapping Cursor Agent
- **[Happy Agent](./packages/happy-agent)** - Remote agent control CLI (create, send, monitor sessions)
- **[Happy Server](./packages/happy-server)** - Backend server for encrypted sync
- **[Happy Wire](./packages/happy-wire)** - Shared message types and Zod schemas

## 🔧 Cursor Agent CLI Compatibility

| Feature | Claude Code | Cursor Agent | Adaptation |
|---------|------------|--------------|------------|
| Permission modes | `permissionMode` | `--force` / `--mode plan` / `--mode ask` / `--sandbox` | Mapped via `mapToCursorPermissionArgs()` |
| System prompts | `--append-system-prompt` | `--mode` parameter | Direct mapping |
| MCP config | `--mcp-config` inline JSON | `.cursor/mcp.json` + `--approve-mcps` | File-based config |
| Tool whitelist | `--allowedTools` | `agent mcp enable/disable` | MCP-level control |
| Thinking status | fd3 pipe | `thinking` messages in `stream-json` | Parsed from output |
| Session ID | Hook server injection | `system/init` message | Extracted from stream |
| Session files | `~/.claude/sessions/*.jsonl` | Not needed | `stream-json` has all info |
| Multi-turn | `--input-format stream-json` | `--resume <session-id>` per turn | New process per turn |
| SDK | `@agentclientprotocol/sdk` | `cursorQuery()` / `cursorQueryMultiTurn()` | Custom implementation |

## 📚 Documentation

- **[CLI Architecture](./docs/cli-architecture.md)** - How the CLI and daemon interact
- **[Encryption](./docs/encryption.md)** - End-to-end encryption details
- **[Protocol](./docs/protocol.md)** - WebSocket wire protocol
- **[Session Protocol](./docs/session-protocol.md)** - Encrypted chat event protocol
- **[Backend Architecture](./docs/backend-architecture.md)** - Server internals
- **[API Reference](./docs/api.md)** - HTTP endpoints and auth flow
- **[Deployment](./docs/deployment.md)** - How to deploy the backend

## 🏗️ Development

```bash
# Install dependencies
yarn install

# Run CLI in development mode
yarn cli cursor

# Run tests
cd packages/happy-cli && yarn test

# Type check
cd packages/happy-cli && yarn typecheck

# Build
cd packages/happy-cli && yarn build
```

## Credits

This project is a fork of [Happy Coder](https://github.com/slopus/happy) by the Happy Coder Contributors, adapted to work with Cursor Agent instead of Claude Code.

## License

MIT License - see [LICENCE](LICENCE) for details.
