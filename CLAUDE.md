# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No npm scripts are defined. Use the PartyKit CLI directly:

- `npx partykit dev` — run the server locally with hot reload; also serves `index.html` and any static assets in the project root at the same origin.
- `npx partykit deploy` — deploy to PartyKit's edge.
- `npm install` — installs the single dev dep (`partykit`).

There are no tests, linter, or formatter configured.

## Architecture

This is a PartyKit real-time multiplayer app. PartyKit gives each "room" a single stateful Durable-Object-style server instance; all clients connecting to the same room URL share that instance's in-memory state.

**Server entry:** [party/server.ts](party/server.ts) — set via `main` in [partykit.json](partykit.json). The exported `GameServer` class is instantiated per room.

**Game model (server-authoritative):**
- An A/B voting game with sequential scenarios. State lives entirely on the server: `hostId`, `scenarioIdx`, `phase` (`"voting" | "revealed"`), and a `votes` map keyed by connection id.
- The first connection to a room becomes the host. If the host disconnects, host is reassigned to the next remaining connection and that client is told via a `{ type: "role", role: "host" }` message.
- Phase machine: `voting` → host sends `advance` → `revealed` → host sends `advance` → next scenario, `voting`, votes cleared. `restart` resets to scenario 0.
- Only the host may send `advance` / `restart`; the server enforces this by comparing `sender.id` to `hostId`. Any new permissioned actions must follow the same gate.

**Wire protocol (JSON over WebSocket):**
- Server → client: `init` (sent on connect, includes role + full snapshot), `state` (full snapshot on phase/scenario change), `tally` (vote counts only), `role` (host handoff).
- Client → server: `vote` (any player, only in `voting` phase, `choice` must be `"A"` or `"B"`), `advance` / `restart` (host only).
- Unparseable messages are silently dropped (`onMessage` try/catches `JSON.parse`).

**Client:** [index.html](index.html) is a single self-contained file — all CSS and the ES-module client script are inlined. PartyKit's dev server serves it at the same origin as the WebSocket endpoint. Room name is hardcoded (`const ROOM = "main"`); to support multiple concurrent games, read it from `location.search` or the path and pass it as the `room` option to `PartySocket`.

**Host targeting:** `PARTYKIT_HOST` in [index.html](index.html) auto-switches between `localhost:1999` and the deployed host string. After running `npx partykit deploy`, update the deployed branch of that ternary (commented `// ▸ Swap PARTYKIT_HOST after ...`) to match the printed hostname.

**Solo mode:** appending `?solo` to the URL bypasses PartyKit entirely. The client stubs `send` to mutate local state directly so the full UI flow can be exercised offline. The same path is used as a fallback when the WebSocket fails to open (`goSolo("offline")`). Keep solo-mode behavior in sync with server semantics when changing the protocol.

**Scenario content:** lives on the **client**, in the `SCENARIOS` array at the top of the inline script in [index.html](index.html). Each entry is `{ setup, choiceA, choiceB, worstA[], worstB[] }`; `worstA`/`worstB` are escalation lines revealed one at a time during the `revealed` phase. The server only tracks `scenarioIdx` — keep both clients on the same deploy or indices will drift.

## Conventions

- Server state is the source of truth; never trust client-sent state echoes. The current code already enforces this — preserve the pattern when adding features.
- Inline comments marked `// ▸ optional ...` in [party/server.ts](party/server.ts) flag intentional extension points (e.g. scoring). Treat them as TODO anchors.
