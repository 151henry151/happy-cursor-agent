# Using the Web UI at p.romptele.com

The Happy web UI is a **client** that talks to your Happy server. Sessions run on **machines** — computers where the Happy CLI is running and connected to the same server.

## Prerequisites: Node.js 20+

The Happy CLI and this repo require **Node.js 20 or newer**. Node 18 will fail (e.g. `yarn install` engine errors, or regex `/v` flag syntax errors). Install Node 20 LTS then run the steps below.

On the romptele server, this project lives at **`/home/henry/webserver/happy-cursor-agent`** (submodule of `my-webserver-setup`). Replace `/path/to/happy-cursor-agent` below with that path or your local clone.

## Why "Please select a machine to start the session"?

A **machine** is a computer that has registered with the server by running the Happy CLI (and optionally the daemon). Until at least one machine is connected, the web UI has nothing to run sessions on, so you must "select a machine" before starting a session.

## Steps to get the web UI working

### 1. Have the web UI and server ready

- You’re logged in at **https://p.romptele.com** (create account or login with mobile app).
- The backend at p.romptele.com is running (Docker stack).

### 2. Run the Happy CLI on a computer (your “machine”)

On the computer that should run Cursor Agent (e.g. your laptop or the same server), use the Happy CLI from this repo and point it at p.romptele.com:

```bash
cd /path/to/happy-cursor-agent
yarn install
export HAPPY_SERVER_URL=https://p.romptele.com
yarn cli auth login
```

The CLI will open (or print) a **terminal connect URL** on the same host as your server (e.g. `https://p.romptele.com/terminal/connect#key=...`). Open that URL in a browser **while logged in to https://p.romptele.com** (same account) and click **Accept Connection** to link this machine to your account. (If the link opened app.happy.engineering instead, you were missing `HAPPY_SERVER_URL` when running the CLI; set it and run `yarn cli auth login` again.)

**Important:** After auth, the machine is only in the CLI. It appears in the web UI **after you start the daemon** (next step). Until then, "Select Machine" will be empty and you'll get "Please select a machine to start the session".

**If you re-run auth login while the daemon is already running:** The daemon keeps using the credentials it had at startup. After you click "Accept Connection", **restart the daemon** on that computer (`yarn cli daemon stop` then `yarn cli daemon start`) so it loads the updated credentials and re-registers the machine. Otherwise the machine list in the web app will stay empty or show "Please select a machine".

### 3. Build the CLI (required before daemon start)

The daemon runs the built CLI (`dist/index.mjs`). Build once from the repo root:

```bash
cd /path/to/happy-cursor-agent
yarn workspace happy-cursor-coder build
```

### 4. Start the daemon (so the machine appears and stays visible)

So the machine stays registered and you can start sessions from the web:

```bash
export HAPPY_SERVER_URL=https://p.romptele.com
yarn cli daemon start
```

**If you see "Unsupported agent type: 'cursor'"** when starting a session from the web UI, the daemon is running an older CLI that doesn’t support Cursor. Pull the latest repo, run `yarn workspace happy-cursor-coder build`, then **restart the daemon** (stop it and run `yarn cli daemon start` again). The daemon runs from source (`tsx src/index.ts`), so it must be restarted to pick up changes.

Or run an interactive session (also registers the machine while it’s running):

```bash
export HAPPY_SERVER_URL=https://p.romptele.com
yarn cli cursor
```

### 5. Install Cursor Agent on the machine (for sessions to respond)

Sessions need an **agent** running on the machine. This fork defaults to **Cursor Agent**. Install it on the same machine where the daemon runs:

- **Cursor Agent**: [Install guide](https://docs.cursor.com/agent) — get the `agent` binary on your PATH so that `happy cursor` can run it.

If you use **Claude** or **Codex** instead (via the agent selector in the UI), install the corresponding CLI on the machine (e.g. `npm install -g @anthropic-ai/claude-code` for Claude) and configure auth.

### 6. Use the web UI

1. Open **https://p.romptele.com** and log in.
2. Click **Start New Session**.
3. Select **Cursor** (default) or Claude/Codex/Gemini in the agent row.
4. When asked to select a machine, choose the machine where the daemon is running.
5. Pick a directory, then start the session and type your prompt (e.g. "test").

### If sending a message returns 404 or "Session not found"

- **Same account required**: When you click "Start New Session", the web app now passes your logged-in credentials to the daemon so the spawned session is created under **your** account. You must be **logged into the web app** when starting the session. If you previously had 404s, ensure you start a **new** session (not an old one from the sidebar) after logging in. If the machine was linked with a different account, log into the web app with that account (or re-link the machine with `yarn cli auth login` and accept in the browser, then restart the daemon) and start a new session.

### If the agent never responds to messages

- **Cursor sessions**: Ensure the Cursor Agent binary is on the machine’s PATH (see step 5). The daemon spawns `happy cursor --happy-starting-mode remote`; that process must be able to run the Cursor agent.
- **Session view**: The input area should show the agent type (e.g. "Cursor") next to the gear. If you see an error icon or no agent label, the session may have been created with an older flow; try starting a new session after rebuilding the web app and CLI.
- **Logs**: On the machine running the daemon, check daemon logs (path printed by `yarn cli daemon logs`) and any terminal where the Cursor process is running for errors when you send a message.

## Summary

| Component        | Role                                                                 |
|-----------------|----------------------------------------------------------------------|
| **Web UI**      | Client: you use it to pick a machine and send prompts.              |
| **Backend**     | Server at p.romptele.com: stores accounts, machines, sessions.       |
| **Happy CLI**   | Runs on a “machine”: registers it with the server and runs Cursor Agent. |

You need at least one machine (Happy CLI + auth + daemon or `happy cursor`) connected to p.romptele.com before the web UI can start a session.
