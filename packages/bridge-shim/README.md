# daemon-bridge-mcp

Stdio MCP server that connects MCP clients (Claude Code, Cursor, and any other Model Context Protocol client) to a running [DAEMON](https://www.daemonide.tech) desktop app.

It exposes DAEMON's bridge tool catalog over MCP: wallet operations, token launch flows, agent memory, and project file reads. The shim itself executes nothing. Every call is forwarded to the DAEMON app on your machine, where policy gating and user approval happen.

**Requires the DAEMON desktop app.** Without DAEMON installed and running, the server starts but every tool call returns a "DAEMON is not running" error. Download DAEMON at [daemonide.tech](https://www.daemonide.tech).

## Setup: Claude Code

1. Install and open the DAEMON desktop app (it registers the bridge on startup).
2. Add the server:

   ```bash
   claude mcp add daemon -- npx -y daemon-bridge-mcp
   ```

   Or add it to `.mcp.json` in your project:

   ```json
   {
     "mcpServers": {
       "daemon": {
         "command": "npx",
         "args": ["-y", "daemon-bridge-mcp"]
       }
     }
   }
   ```

3. Restart Claude Code. The DAEMON tools appear in the tool list; write actions will pause until you approve them inside the DAEMON app.

## Setup: Cursor

1. Install and open the DAEMON desktop app.
2. Create (or edit) `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally:

   ```json
   {
     "mcpServers": {
       "daemon": {
         "command": "npx",
         "args": ["-y", "daemon-bridge-mcp"]
       }
     }
   }
   ```

3. Reload Cursor and enable the `daemon` server under Settings > MCP. Approvals for write actions still happen inside the DAEMON app.

## What tools are exposed

- **Wallet**: read balances, generate wallets, assign project wallets, store a Helius key.
- **Launch**: list launchpads, preflight and create token launches.
- **Memory**: remember, recall, update, and forget agent memory facts.
- **Project files**: project status, file tree, file reads, and file search.

Read-only tools run automatically. Anything that writes or spends requires explicit user approval inside the DAEMON app, and sensitive actions require typed confirmation there.

## Security model

The shim holds no keys and can approve nothing. It talks only to the DAEMON app over the local loopback interface (127.0.0.1), authenticating with a bearer token it reads from a `bridge.json` file in your user profile, written by the app. All risk gating happens server-side in DAEMON: reads are automatic, writes need in-app user approval, sensitive operations need typed confirmation, and reads of secret files (env files, keypairs) are denied outright. Rotating the token in DAEMON settings immediately invalidates existing shims.

## License

MIT
