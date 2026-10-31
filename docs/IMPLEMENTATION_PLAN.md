# Tethys implementation plan

Status: draft, 2026-10-31. Supersedes nothing; `docs/SPEC.md` is the requirements
document and this is the build plan.

## 1. Goal

One control plane for a small fleet of CC: Tweaked computers and turtles, plus
other remote sources later. The operator uses a React dashboard to assign roles,
start and stop work, watch telemetry, and remove machines. The machines execute
bounded work on their own and tolerate the server being offline.

Non-goals for v1: multi-operator accounts, public multi-tenant hosting, GPS,
voxel-perfect world maps, and any control loop that requires a live connection.

## 2. What already exists

### 2.1 This repository

- `docs/SPEC.md` — requirements.
- `server/main.py` — one line, `import fastapi`. Replaced by this plan.
- `client/`, `agents/`, `utils/` — empty.
- Remote: `https://github.com/Igidn/tethys.git`.
- `.venv` has FastAPI and Starlette, but no uvicorn.

### 2.2 Prior art: `~/Desktop/cc-util`

A working mining console with the same shape. It is messy in the role code but
its transport, publishing, and recovery design are sound. We port the ideas, not
the files:

| cc-util piece | Decision |
|---|---|
| GitHub release as tunnel rendezvous | keep, with two tags instead of one |
| Flat assets + `manifest.json` | keep, with sizes and checksums |
| WS `/ws`, `hello`/`welcome`/`command` | keep, generalized |
| Deterministic plan shared by server and turtle | keep, with golden vectors |
| Dock re-zero, tape, journal, fuel budget | keep, port to `agents/mining` |
| Single `state.json` rewritten per heartbeat | replace with SQLite |
| In-memory pending command map | replace with a `commands` table |
| One tag for code and address | split into `live` and `agent-v*` |
| Installer polls for a role by turtle id | replace with a pairing code |

### 2.3 Infrastructure on this machine

```
opentunnel 0.6.1, profile "default"
tunnel:  pagbc52drfuq.opentunnel.xyz
route:   dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz → 127.0.0.1:3000
service: connected
```

Decisions taken:

- Reuse the existing route. Tethys binds `127.0.0.1:3000`, so the public URL is
  `https://dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz` and the CC:T rule is
  the single hostname `dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz` (or
  `*.pagbc52drfuq.opentunnel.xyz` if you prefer not to edit it again).
- cc-util is retired. Its console currently holds port 3000 as a node process
  and must be stopped before Tethys starts.
- TLS terminates at the opentunnel edge with a CA-signed certificate, so CC:T
  accepts it without config and the local server stays plain HTTP.

## 3. Architecture

```
 CC:T turtle / computer                  this Mac                        GitHub
┌──────────────────────┐        ┌────────────────────────┐        ┌──────────────────┐
│ /tethys/boot.lua     │        │ FastAPI on :3000       │        │ live             │
│   link (WS) ─────────┼──wss──▶│   /ws    hub           │        │   server.json    │
│   supervisor         │        │   /api/* REST + admin  │        │   install.lua    │
│   roles/mining       │◀──http─┤   SQLite server/data   │        │   runtime.json   │
│   roles/music        │        │   client/dist (static) │        │ agent-v1.4.0     │
│   lib/*              │        │                        │        │   lib__*.lua     │
└──────────────────────┘        └───────────┬────────────┘        └────────▲─────────┘
        ▲                                   │                              │
        │              opentunnel edge      │                              │
        └──── https://dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz ────────┘
                                                          publish via gh CLI
```

### 3.1 The hosting split

| Surface | Lives | Mutability | Purpose |
|---|---|---|---|
| Agent code, installer, address | GitHub releases | immutable tags + one pointer | bootstrap, updates |
| All state | `server/data/tethys.db` | constant | agents, jobs, commands, events |
| Dashboard | served by the server | build artifact | operator UI |

GitHub is an immutable address book. The tunnel is mutable state. That line is
what makes "server offline means do nothing" fall out naturally: an agent can
always find the address, and has nothing to do until the server answers.

### 3.2 Trust boundaries

- **Agent → server**: agent id plus a 32-hex secret, sent on REST headers and in
  the WS `hello`. Only `sha256(secret)` is stored. Compare with
  `hmac.compare_digest`.
- **Browser → server**: `ADMIN_TOKEN` bearer. The dashboard accepts
  `?token=...` once and keeps it in `localStorage`.
- **Server → agent**: server is authoritative for *what* to do, never for *how*.
  No `forward`, `dig`, or raw peripheral calls cross the wire.
- **Agent**: authoritative for safety. It may refuse a job, abort, or park
  without asking.

## 4. Release topology

Two tags, because code and address change at different rates:

```
live                 mutable, clobbered on every publish
  server.json        { url, protocol, updatedAt }
  install.lua        the wget entrypoint
  runtime.json       { version, tag, files[] }  ← the current pointer

agent-v1.4.0         immutable, never re-uploaded
  lib__link.lua
  lib__util.lua
  mining__plan.lua
  ...
```

- `server.json` exists so the installer never hardcodes a hostname. It also
  survives the tunnel being deleted and recreated, which the route reuse does not
  protect against.
- `runtime.json` on `live` is the pointer. The server mirrors it into the
  `releases` table and decides per agent which version to offer.
- Immutable code tags let an agent be pinned or rolled back without re-uploading
  anything: rollback is one pointer rewrite.
- Release asset names are flat (`mining__plan.lua`) because GitHub forbids `/`.
  `runtime.json` maps flat names back to runtime paths.
- Release asset downloads do not consume the GitHub API rate limit, which
  matters because every machine shares the Minecraft server's IP.

## 5. Repository layout

```
docs/
  SPEC.md
  IMPLEMENTATION_PLAN.md
AGENT.md                    how to change and ship agent code
client/                     Vite + React + TS
  src/
  package.json
server/
  app/
    main.py                 FastAPI app, lifespan, static mount
    config.py               .env loader, paths
    db.py                   sqlite3 connection, WAL, migrations
    schema.sql              tables and indexes
    auth.py                 agent + admin auth
    enroll.py               /api/enroll, pairing codes
    hub.py                  /ws agent channel, heartbeats, commands
    runtime.py              release pointer, update decisions
    mining.py               plan, sector allocation, vectors
    music.py                playlist manifests
    tunnel.py               opentunnel route check + publish
    publish.py              build manifest, upload to GitHub
    api.py                  admin REST
  data/                     gitignored: tethys.db, backups
  .env                      gitignored
  tests/
agents/
  VERSION                   single source of truth, e.g. 1.0.0
  install.lua               wget run entrypoint
  boot.lua                  runs current/, falls back to prev/
  main.lua                  link + supervisor in parallel
  lib/
    util.lua                json, atomic write, log, checksum
    identity.lua            /tethys/identity.json
    resolve.lua             server.json with TTL cache
    link.lua                WS, outbox, backoff, reconnect
    updater.lua             manifest fetch, staging, swap, rollback
    hal.lua                 turtle/computer API wrapper, mockable
  mining/
    plan.lua pose.lua tape.lua nav.lua fuel.lua dock.lua miner.lua
  music/
    playlist.lua player.lua
  tests/
    run.lua                 desktop Lua harness
    plan_vectors.json       shared with the server
tools/
  publish.py                publish agent runtime to GitHub
```

On the turtle the installed tree is:

```
/startup.lua                shell.run("/tethys/boot.lua")
/tethys/
  boot.lua
  identity.json             id, secret, role, serverUrl, createdAt
  config.json               server-provided config, role scoped
  version                   currently applied version
  current/                  live runtime
  prev/                     previous runtime, boot fallback
  .staging/                 download target, never on package.path
  state/                    per-role checkpoints and journals
```

## 6. Server design

### 6.1 Stack

Python 3.12+, FastAPI, uvicorn, stdlib `sqlite3`. No ORM. Route handlers are
plain `def` so FastAPI runs them in its threadpool; SQLite calls never block the
event loop. One connection per request, `PRAGMA journal_mode=WAL`,
`busy_timeout=5000`.

Dependencies to add: `uvicorn[standard]`, `pydantic-settings` (or a 20-line env
loader), `httpx` for the publish tool, `pytest`.

### 6.2 Configuration (`server/.env`)

```sh
HOST=127.0.0.1
PORT=3000
ADMIN_TOKEN=            # openssl rand -hex 32
PUBLIC_URL=https://dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz
GITHUB_REPO=Igidn/tethys
LIVE_TAG=live
DATA_DIR=data
HEARTBEAT_MS=5000
STALE_MS=20000
COMMAND_RETRY_MS=8000
```

`PUBLIC_URL` wins over tunnel discovery. `tunnel.py` only runs
`opentunnel route add 127.0.0.1:3000` when `PUBLIC_URL` is empty, and otherwise
uses `opentunnel status` to verify the route still points at our port.

### 6.3 Schema

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,            -- 16 hex, generated on the machine
  secret_hash    TEXT NOT NULL,               -- sha256 hex
  computer_id    INTEGER,
  label          TEXT,
  role           TEXT NOT NULL DEFAULT 'unassigned',
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|active|removed
  pairing_code   TEXT UNIQUE,
  channel        TEXT NOT NULL DEFAULT 'stable',   -- stable|canary|pinned:1.3.9
  runtime        TEXT,                        -- last reported agent version
  state          TEXT,                        -- idle|running|draining|halted
  pose_json      TEXT,
  fuel           INTEGER,
  inventory_json TEXT,
  config_json    TEXT,
  created_at     INTEGER NOT NULL,
  approved_at    INTEGER,
  last_seen      INTEGER
);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  kind          TEXT NOT NULL,                -- mining|music|airship
  spec_json     TEXT NOT NULL,
  state         TEXT NOT NULL,                -- offered|active|paused|done|failed
  progress_json TEXT,
  stats_json    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE commands (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL REFERENCES agents(id),
  op           TEXT NOT NULL,
  payload_json TEXT,
  state        TEXT NOT NULL,                 -- queued|sent|acked|expired
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  acked_at     INTEGER
);

CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  agent_id  TEXT,
  kind      TEXT NOT NULL,
  data_json TEXT
);
CREATE INDEX events_ts ON events(ts);

CREATE TABLE releases (
  version       TEXT PRIMARY KEY,
  tag           TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'stable',
  published_at  INTEGER
);

CREATE TABLE playlists (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  published_at  INTEGER
);
```

Why SQLite here and not cc-util's JSON file: the event log and telemetry grow
without bound, and rewriting a single blob on every heartbeat is the main source
of jank in the old console. WAL gives concurrent reads while the hub writes.

Retention: delete events older than 14 days on startup and once a day. Keep
`jobs` forever; they are small.

### 6.4 Endpoints

Agent-facing (id + secret):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/enroll` | register a fresh machine, returns `{code}` |
| GET | `/api/enroll/status` | installer polls until a role is assigned |
| POST | `/api/register` | idempotent boot registration, returns role + config |
| GET | `/api/runtime/latest` | the version this agent should run |
| GET | `/api/health` | liveness, no auth |

Operator-facing (`Authorization: Bearer $ADMIN_TOKEN`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | full snapshot for the dashboard |
| POST | `/api/agents/{id}/approve` | `{role, config}` from a pairing code |
| POST | `/api/agents/{id}/role` | change role, pushes `assignRole` |
| POST | `/api/agents/{id}/config` | push role config |
| DELETE | `/api/agents/{id}` | tombstone + `uninstall` command |
| POST | `/api/agents/{id}/jobs` | start work |
| POST | `/api/jobs/{id}/abort` | abort or recall |
| GET | `/api/events?since=` | event log paging |
| POST | `/api/releases/refresh` | pull `live/runtime.json` now |
| POST | `/api/releases/{version}/promote` | point `live` at an existing tag |

Public: `GET /health`, and `/` serves `client/dist` with SPA fallback.

Approval takes a pairing code, not an agent id: the operator types the code the
machine is showing. Six characters from a 30-symbol alphabet (no `0/O/1/I`).
Failed attempts are rate limited per IP and per code.

### 6.5 Hub

`/ws` is handled by a manually routed `upgrade` handler, not by attaching a
second `WebSocketServer` with a path. cc-util learned this the hard way: two
servers on one HTTP server make each other answer 400 for the other's path. The
browser channel is SSE (`/api/stream`) rather than Socket.IO, which removes the
whole class of upgrade-routing conflicts.

Hub responsibilities:

- authenticate the `hello` within 10 seconds, else close 4001
- one connection per agent; a new connection closes the old with 4002
- touch `last_seen` on heartbeat
- flush queued commands from the `commands` table on connect
- retry unacked commands twice, then mark `expired`
- mark agents `stale` after `STALE_MS`, but never expire their jobs
- re-offer the active job on reconnect (idempotent: same job id and spec is acked
  as `already-running`)

### 6.6 Tunnel and publishing

On startup, if `PUBLIC_URL` is set, verify with `opentunnel status` that a route
targets our port and log a warning otherwise. If it is not set, run
`opentunnel route add 127.0.0.1:3000` and parse the URL from the output, then
fall back to `opentunnel status`.

Publishing is a separate CLI (`tools/publish.py`) and is not part of server
startup. The old console published on every boot, which meant a server restart
could silently ship half-finished Lua. Publishing should be a deliberate act
with a version number.

## 7. Agent design

### 7.1 Boot chain

`startup.lua` runs `/tethys/boot.lua`. `boot.lua`:

1. Reads `/tethys/version` and `/tethys/prev/`.
2. `pcall`s `/tethys/current/main.lua` with `package.path` pointing at
   `current/`.
3. On a Lua error, prints the traceback, copies `prev/` over `current/` if
   `prev/` exists, reports the fault on the next successful connection, and
   reboots after 5 seconds.
4. On a clean return, waits 5 seconds and loops.

`main.lua` runs `parallel.waitForAll(link.run, supervisor.run)` inside its own
`pcall` loop. Nothing in the runtime may ever exit to the shell: a turtle sitting
at a `>` prompt is a turtle that has stopped working.

### 7.2 Link

Same shape as cc-util's `lib/link.lua`, which is proven through the tunnel:

- resolve `server.json` with a 10 minute TTL, fall back to the cached URL when
  the fetch fails, so a GitHub outage does not strand a working machine
- `http.websocket` with a 10 second receive timeout in the loop
- `hello` carries pose, fuel, inventory, state, job id, version
- outbox of up to 200 messages while disconnected, flushed after `welcome`
- exponential backoff 1s → 30s, and a forced URL refresh after three failures
- heartbeat on the server's `heartbeatMs`, default 5000

### 7.3 Offline rules

These are the contract that satisfies "if the server is offline, do nothing":

```
idle    + link lost  → poll, never start new work
running + link lost  → finish the current bounded trip, dock, park, poll
running + abort      → drain to the dock, report, park
halted/paused        → never auto-resume after a reboot
```

"Do nothing" must not be read literally as "stop mid-tunnel": a turtle frozen
underground is worse than one that finishes its trip and parks. A job is always
self-contained and bounded so it can complete or abort with zero server contact.

### 7.4 Supervisor

`supervisor.run` reads `identity.role` and dispatches to a role module. Roles are
folders, not branches: `mining`, `music`, `idle`. Changing a role is a command,
not a reinstall. The loop re-reads `bus.role` each iteration so `assignRole`
takes effect without a reboot.

## 8. Protocol v1

JSON over WebSocket. Envelope `{v:1, type, ...}`.

Agent → server: `hello`, `heartbeat`, `progress`, `ack`, `result`, `event`,
`pong`.

Server → agent: `welcome`, `command`, `error`.

Commands: `assignRole`, `assignConfig`, `startJob`, `abort`, `returnHome`,
`update`, `uninstall`, `ping`. Unknown ops must be acked `unknown-op`, never
ignored, so the server can detect a version skew instead of retrying forever.

`hello`:

```json
{"v":1,"type":"hello","id":"a1b2c3d4e5f60718","secret":"<32 hex>",
 "computerId":12,"label":"miner-1","fw":"1.0.0",
 "pose":{"x":0,"y":0,"z":0,"f":0},"fuel":980,"inventory":[],
 "state":"idle","jobId":null}
```

`welcome`:

```json
{"v":1,"type":"welcome","agentId":"a1b2c3d4e5f60718","role":"mining",
 "config":{...},"serverTime":1767225600000,
 "runtime":{"version":"1.4.0","tag":"agent-v1.4.0","files":[...]},
 "job":{"id":"...","kind":"mining","spec":{...}}}
```

`command`:

```json
{"v":1,"type":"command","id":"<uuid>","seq":42,"op":"startJob",
 "job":{"id":"...","kind":"mining","spec":{...}}}
```

Rules:

- Commands are idempotent by `id`. A resend with the same id and spec is acked
  `already-running`.
- A resend with the same id and a *different* spec replaces the job, so a
  server-side correction is not swallowed as a duplicate.
- `result` and `progress` carry `jobId`. The server ignores results for jobs that
  are already closed, and never resurrects a paused job from a late message.
- Breaking changes bump `v` and are rejected by both sides.

## 9. Enrollment

1. Operator runs on the machine:
   ```
   wget run https://github.com/Igidn/tethys/releases/download/live/install.lua
   ```
2. Installer checks `http` is enabled and `http.checkURL` accepts the tunnel
   host. If not, it prints the exact `computercraft-server.toml` rule to add.
3. It reads an existing `/tethys/identity.json` or generates 48 hex characters:
   first 16 are the id, remaining 32 the secret.
4. Reads `live/server.json` for the URL, or accepts `--url`.
5. `POST /api/enroll` → `{code:"K7M2QP"}`.
6. Prints the code large on screen and polls `/api/enroll/status` every 2s for
   10 minutes.
7. Operator opens the dashboard, types `K7M2QP`, picks a role and initial
   config.
8. Installer receives `{role, config}`, writes `identity.json`, `config.json`,
   installs `startup.lua` (backing up a foreign one to `startup.lua.bak` once),
   downloads the runtime for that role, and reboots.
9. On boot, `POST /api/register` is idempotent. Re-enrolling reuses the identity
   and keeps the role.

Removal: `DELETE /api/agents/{id}` sets `status='removed'` and queues
`uninstall`. The agent wipes `/tethys` and `startup.lua`, then halts. A removed
id is rejected at enroll and register, so a machine that was offline during
removal cannot silently rejoin.

## 10. Updater

Manifest (`live/runtime.json`):

```json
{"version":"1.4.0","tag":"agent-v1.4.0","generatedAt":1767225600000,
 "files":[{"path":"lib/link.lua","asset":"lib__link.lua",
           "size":6967,"fnv":"8f2a11c3"}]}
```

Agent flow:

1. On `welcome`, compare `runtime.version` to `/tethys/version`. If equal, stop.
2. Download every file to `/tethys/.staging/`, checking `size` and a 32-bit
   FNV-1a checksum implemented in `lib/util.lua`. Checksums detect corruption,
   not tampering; TLS covers integrity.
3. Write `/tethys/.staging/version`. Do not touch `current/` yet.
4. Apply only when the supervisor is `idle`. Move `current/` → `prev/`, then
   `.staging/` → `current/`, then `os.reboot()`.
5. `boot.lua` falls back to `prev/` if the new runtime raises on startup.

Storage: a full runtime is roughly 120 KB. Keeping two copies is acceptable on a
1 MB computer and a non-issue on a 2 MB one.

The server decides rollout via `agents.channel`: `stable` gets the latest,
`canary` gets it first, `pinned:1.3.9` never moves. Rollback is a pointer rewrite
in `live`, not a re-upload.

## 11. Mining role

Port from `cc-util/mine/lib`, keeping the recovery model intact:

- `hal.lua` wraps turtle calls so the runtime can be tested on desktop Lua.
- `pose.lua` station-local pose, `{x,y,z,f}` with `f` in `{0,1,2,3}`.
- `dock.lua` physical re-zero fixture. The dock is `{0,0,0,0}` in every station
  frame. No GPS in v1.
- `tape.lua` per-trip operation stack, popped on the way home.
- `state.lua` checkpoint plus append-only journal. Every move is journaled
  before it is attempted.
- `fuel.lua` exact round-trip budget with hard caps the server cannot widen.
- `plan.lua` deterministic expansion of a job spec into an ordered block plan.
- `miner.lua` trip executor: bounded new-block budget, unload, refuel, return.

Rules that matter more than the code:

- `turtle.forward()` returning `false` is normal. Never assume a move succeeded.
- Fail toward the dock. Never improvise a route inside a live tunnel.
- Stop on lava, fire, an unbreakable block, or a full inventory, return, report.
- A job is a sequence of trips, not one expedition.

**Plan duplication.** The server needs the same plan to draw a map and allocate
sectors. Two implementations will drift, so `agents/tests/plan_vectors.json`
holds golden inputs and outputs, and both `server/tests/test_mining.py` and
`agents/tests/run.lua` must match it. This is the only reliable way to keep a
TypeScript/Python and a Lua copy honest.

**Chunk loading** is the top reliability risk and no code fixes it. Turtles in
unloaded chunks freeze. Keep sectors inside simulation distance
(`SECTOR_HALF=48` is the safe square for an 8 chunk radius, since
`48 <= floor(128/√2)`), use a chunk loader, or keep a player nearby. The server
should refuse to create a job whose sector exceeds the configured maximum.

Multi-machine: one sector per turtle, split into X lanes so two turtles at one
station never target the same block. No shared corridors in v1.

## 12. Music role

CC:T plays **DFPWM** (48 kHz mono, about 6 KB/s), not mp3 or ogg. Encoding
happens in CI:

```
ffmpeg -i track.flac -ac 1 -ar 48000 -c:a dfpwm track.dfpwm
```

If the local ffmpeg lacks the `dfpwm` encoder, a ~60 line Python port of the
codec is enough; it is a one-bit delta modulator.

Playback streams, never caches:

```lua
local dec = require("cc.audio.dfpwm").make_decoder()
local res = http.get(track.url)
while true do
  local chunk = res.read(16 * 1024)
  if not chunk then break end
  local pcm = dec(chunk)
  while not speaker.playAudio(pcm) do os.pullEvent("speaker_audio_empty") end
end
```

Sync: the playlist manifest carries `startAt` (epoch ms) per track and a
`playlistId`. The agent computes its clock offset from `serverTime` in `welcome`
and starts each track at the agreed instant. One honest limitation: seeking
DFPWM means decoding from byte zero, which is slower than real time on a
computer. A late joiner therefore waits for the next track boundary instead of
fast-forwarding. Multiple speakers are driven by one computer over a wired
network; each needs its own `playAudio` call.

Storage on the machine: zero audio. Only the manifest is cached, and it is
small.

## 13. Testing

- **Server**: pytest against a temporary SQLite file. Cover enroll, approve,
  command queue replay, stale marking, tombstoned ids, job idempotency.
- **Agents**: desktop Lua 5.1 harness with a mock HAL, as cc-util does. Cover
  movement failure, fuel exhaustion, inventory full, interrupted move recovery,
  updater staging and rollback, plan vectors.
- **Protocol**: one Python client that speaks v1 and drives a full enroll →
  approve → job → result cycle without Minecraft.
- **Smoke**: `curl /health`, then a real turtle through pairing. This is the only
  test that proves the whitelist and the tunnel are right.

## 14. Build order

Each phase ends with something demonstrable.

**Phase 0 — Skeleton (half a day).**
Stop the cc-util console, free port 3000, FastAPI app with `/health`, SQLite
schema and migrations, config loader, `live/server.json` published.
Acceptance: `curl https://<tunnel>/health` returns ok from outside the machine,
and a turtle can `wget` `install.lua` from the `live` release.

**Phase 1 — Enrollment (one day).**
Installer, enroll endpoints, pairing codes, dashboard list and approve, startup
install, hello loop with no roles.
Acceptance: a fresh turtle shows a code, the operator approves it, the machine
reboots and appears online in the dashboard.

**Phase 2 — Link and commands (one day).**
WS hub, heartbeat, stale detection, persisted command queue with ack and retry,
role change, remove and uninstall, SSE dashboard updates.
Acceptance: kill the server mid-session, restart it, the agent reconnects and
runs a command that was queued while it was down.

**Phase 3 — Mining (three to four days).**
Port the libs, implement the Python plan, generate the shared vectors, run one
turtle in a 16×16 sector, then two turtles in lanes.
Acceptance: ten consecutive trips without intervention. Kill the server
mid-trip: the turtle docks and parks. Cut the tunnel: the same.

**Phase 4 — Updater (one day).**
`tools/publish.py`, staging, checksums, boot fallback, channels, promote and
rollback.
Acceptance: publish 1.0.1, watch an idle turtle update and reboot. Publish a
deliberately broken build, confirm `prev/` recovery and a reported fault.

**Phase 5 — Music (two to three days).**
Encoder pipeline, playlist manifests, sync, multi-speaker.
Acceptance: two computers start the same track within 100 ms and stay in sync
for a full song.

**Phase 6 — Hardening.**
launchd unit for the server, nightly DB backup, event retention, log rotation,
a `tethys status` CLI.

## 15. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Laptop sleeps, tunnel drops | fleet idles | offline rules; agents park, they do not fail |
| Tunnel deleted or recreated | hostname changes | `server.json` on GitHub; installer re-run |
| CC:T whitelist blocks the tunnel | nothing works | exact hostname rule documented in the installer output |
| Release CDN caches a clobbered asset | agents see an old pointer for minutes | pointer has a version; agents retry, never loop on failure |
| Chunk unloading freezes turtles | lost trips | sector size cap, chunk loader, visible `stale` state |
| Plan drift between Python and Lua | wrong maps, refused jobs | golden vectors in CI |
| Two agents claim one sector | duplicated work | lane allocation server-side, job spec carries the lane |
| `math.random` for the secret | weak secret | acceptable on a private server behind an unguessable route; note it |
| No auth rotation | stolen secret lives forever | `POST /api/agents/{id}/rotate` reissues on next boot |

Open decisions:

1. Is the tunnel hostname whitelisted exactly, or as `*.pagbc52drfuq.opentunnel.xyz`?
2. Sector size and turtle count for the first real run.
3. Does music need a shared queue, or one playlist at a time?
4. Airship control: is it in scope for v1.1 or later?
5. Do we want a small CLI (`tethys`) for local ops, or dashboard only?

## 16. Progress

**Phase 0 — complete (2026-10-31).**

- [x] cc-util console stopped, port 3000 free, tunnel route reused
- [x] `server/app/config.py` env loader, `server/.env` generated with a token
- [x] `server/app/schema.sql` and `server/app/db.py`, WAL, `user_version = 1`
- [x] `server/app/tunnel.py` route discovery and verification
- [x] `GET /health` with database and tunnel detail, SPA fallback
- [x] `tools/publish.py` with dry run, pointer-only, canary, installer flags
- [x] `live` release created, `server.json` published and reachable over HTTPS
- [x] 6 pytest cases covering health, schema idempotency, and route parsing

Verified: `curl https://dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz/health`
returns `ok: true`, `tunnel.verified: true`, target `127.0.0.1:3000`.

Not yet: `install.lua` is published with Phase 1. A live cc-util agent is still
polling `/ws` through the tunnel and receives 403; it backs off and retries. It
must be reinstalled with Tethys.

**Phase 1 — complete (2026-10-31).**

Scope grew by one item: the WS hub skeleton (`hello`/`welcome`/`heartbeat`) is
here because "appears online in the dashboard" is the phase acceptance test.
The command queue, retry, and removal-driven wipe stay in Phase 2.

- [x] `agents/install.lua`: identity generation, GitHub rendezvous, pairing
      banner, approval poll, flat-asset download, `prev/` rotation, startup hook
- [x] `agents/boot.lua`: stable entry outside `current/`, rollback to `prev/`
- [x] `agents/main.lua` and `agents/lib/{util,identity,resolve,link,supervisor}`
- [x] `agents/tests/run.lua`: 13 checks under luajit (syntax plus pure helpers)
- [x] `server/app/{auth,store,enroll,hub,api}.py`; routers wired in `main.py`
- [x] `POST /api/enroll`, `GET /api/enroll/status`, `POST /api/register`
- [x] `GET /ws` with hello auth, pending rejection, welcome, heartbeat, sweeper
- [x] admin `/api/state`, `/api/events`, approve, role change, remove
- [x] dashboard: token gate, pending cards with pairing codes, fleet table
- [x] `tools/publish.py` stages flat asset names (`lib__link.lua`) and skips
      `install.lua` from the runtime manifest
- [x] 21 pytest cases (enrollment, pairing, auth, WS handshake, telemetry)

Verified over the public tunnel: enroll returns a 6-char code, `/api/state`
shows it, register returns 409 while pending, approve sets the role, register
returns `role` and `config`, a `wss://…/ws` client receives `welcome` and shows
online, and heartbeat telemetry lands in `/api/state`. `agent-v0.1.0` carries
seven assets whose sizes match `live/runtime.json`; `/` serves the built SPA.

Known gap: `install.lua` reads `textutils`/`os.epoch`, so the desktop harness
only loads it for syntax. A mock HAL arrives with the mining runtime.

**Phase 2 — complete (2026-11-01).**

- [x] persisted command queue (`commands` table, schema 2 adds `sent_at` and
      `result_json`); commands are written before they are sent
- [x] delivery on connect, immediate notify when online, four attempts at 15 s
      intervals, then `failed`
- [x] agent-side ledger so a retry is re-acked but not re-executed
- [x] ops `setRole`, `setConfig`, `reboot`, `wipe`; `update` acks `unsupported`
      until Phase 4
- [x] role and config changes survive a reboot because the agent persists them
- [x] removal queues a wipe and holds the machine in `removing` until it acks;
      `?force=true` drops it immediately
- [x] SSE `/api/stream` with full state snapshots and keepalives; the dashboard
      reads it with `fetch` so the token stays in a header
- [x] dashboard row actions (reboot, uninstall, remove) and a recent-commands log
- [x] 33 pytest cases and 27 Lua checks

Verified over the public tunnel: a role change reaches a connected machine in
about 0.2 s; a role change made while it is offline arrives in the next
`welcome` plus `setRole`; acks move the command to `done`; removal queues `wipe`,
re-enrollment is refused while `removing`, and SSE emits a state frame
immediately.

Note: the server's `/ws` closes a silent socket after `staleMs` (10 s), so an
agent must heartbeat. `db.connect()` no longer sets `journal_mode` per
connection; doing that under concurrent writes returned `database is locked`.



## 17. Quick start

```sh
# 0. free the port
kill 7672                     # cc-util console, if still running

# 1. server
cd server
cp .env.example .env
openssl rand -hex 32          # paste into ADMIN_TOKEN
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 3000

# 2. confirm the route still points here
opentunnel status

# 3. publish the pointer and installer
python ../tools/publish.py --version 1.0.0 --with-installer

# 4. install on a machine
#    wget run https://github.com/Igidn/tethys/releases/download/live/install.lua
```
