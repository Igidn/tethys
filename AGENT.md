# AGENT.md

Working guide for this repository. Read this before changing agent code, and
before publishing anything that runs on a computer or turtle.

## What this project is

Tethys is a control plane for CC: Tweaked computers and turtles on a private
Minecraft server. The dashboard is a React app, the control plane is FastAPI, and
the machines run a Lua runtime that pulls work from the server.

Three surfaces, three owners:

| Surface | Path | Runs on | Owner |
|---|---|---|---|
| Dashboard | `client/` | browser | operator |
| Control plane | `server/` | this Mac, behind opentunnel | server |
| Agent runtime | `agents/` | CC: Tweaked | the machine |

`docs/SPEC.md` is the requirements. `docs/IMPLEMENTATION_PLAN.md` is the design.
When the two disagree, the spec wins and the plan gets updated.

## Where truth lives

- **GitHub** (`Igidn/tethys`) holds code, the installer, and the published agent
  runtime. It is an immutable address book.
- **The server's SQLite file** (`server/data/tethys.db`) holds everything
  mutable: agents, roles, jobs, commands, events.
- **The machine's disk** (`/tethys/`) holds identity, role config, the applied
  runtime, and per-role checkpoints.

Never commit `server/.env`, `server/data/`, or anything under `/tethys` that was
copied off a machine.

## Ground rules

1. **The server dispatches, the machine decides.** No `forward`, `dig`, or raw
   peripheral call may cross the wire. A job is a bounded intent; safety stays
   local.
2. **Every job must finish or abort with zero server contact.** If a change makes
   a job depend on a live socket, it is wrong.
3. **Fail toward the dock.** Do not add on-the-fly pathfinding inside a tunnel.
4. **Never assume a move succeeded.** `turtle.forward()` returning `false` is
   normal control flow.
5. **Nothing exits to the shell.** A machine at a `>` prompt has stopped working.
   Wrap entry points in `pcall` and loop.
6. **Protocol changes bump `v`.** Unknown ops are acked `unknown-op`, never
   ignored.

## Local development

Server:

```sh
cd server
cp .env.example .env            # ADMIN_TOKEN, PUBLIC_URL, GITHUB_REPO
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 3000
../.venv/bin/pytest
```

Dashboard:

```sh
cd client
npm install
npm run dev                     # Vite, proxies /api and /api/stream to :3000
npm run build                   # output served by FastAPI at /
```

Agents, without Minecraft:

```sh
lua agents/tests/run.lua        # Lua 5.1, mock HAL
```

The tunnel:

```sh
opentunnel status               # route must target 127.0.0.1:3000
```

Port 3000 belongs to Tethys. The old cc-util console used it and is retired; if
something else holds the port, stop it rather than moving Tethys.

---

# Shipping changes to computers and turtles

Agent code only reaches a machine through a GitHub release and an explicit
update command. There is no `git pull` on a turtle, and no file is edited by hand
except in an emergency.

## 1. Versioning

`agents/VERSION` is the single source of truth (`MAJOR.MINOR.PATCH`, no `v`
prefix). Bump it in the same commit as the change:

- **patch** — bug fix, no protocol or config change
- **minor** — new role, new command, new config field
- **major** — anything that breaks protocol `v` compatibility

The version is stamped into the manifest, reported in every `hello`, and shown
in the dashboard. A machine whose version differs from the pointer is visibly
out of date, which is the whole point.

## 2. Test before publishing

```sh
lua agents/tests/run.lua
cd server && ../.venv/bin/pytest
```

If you touched `agents/mining/plan.lua`, regenerate or verify the shared vectors
in `agents/tests/plan_vectors.json`. The server has its own implementation of
the same plan; a mismatch means the dashboard draws a map the turtle will refuse.

## 3. Publish

Publishing is deliberate and never happens on server startup.

```sh
# dry run first: shows files, sizes, checksums, target tags
python tools/publish.py --version 1.4.0 --dry-run

# real publish
python tools/publish.py --version 1.4.0
```

What the tool does:

1. Refuses if `agents/VERSION` does not match `--version`.
2. Walks `agents/`, skipping `tests/`, dotfiles, and `VERSION`.
3. Flattens paths for asset names (`lib/link.lua` → `lib__link.lua`) because
   GitHub forbids `/` in release asset names.
4. Creates the immutable tag `agent-v1.4.0` if it does not exist and uploads the
   assets. **Never re-upload to an existing `agent-v*` tag.** If you need a fix,
   bump the patch version.
5. Writes `runtime.json` (`version`, `tag`, `files[]` with `size` and `fnv`) and
   uploads it to the mutable `live` tag with `--clobber`.
6. Prints the manifest URL and the current pointer.

`--with-installer` also refreshes `live/install.lua`. Do this when the installer
changes, not on every release.

`--canary` publishes the pointer with `channel: canary`, so only machines on the
canary channel see it.

## 4. Roll out

Machines apply updates only when idle. The server decides per machine, so a bad
release does not have to reach the whole fleet.

```sh
# pull the new pointer into the server's releases table
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz/api/releases/refresh

# move one machine first
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://.../api/agents/<id>/channel -d '{"channel":"pinned:1.4.0"}'
```

From the dashboard: **Fleet → agent → update**. This queues an `update` command.
The machine downloads to `/tethys/.staging/`, verifies size and checksum, and
swaps on its next idle moment:

```
current/  →  prev/
.staging/ →  current/
os.reboot()
```

A machine that is mid-job stages the download and reboots after the job ends.
Rebooting mid-tunnel is safe because the job is journaled, but it wastes a trip,
so prefer updating between jobs.

## 5. Roll back

Rollback is a pointer rewrite, not a re-upload. The old tag still exists with its
assets.

```sh
python tools/publish.py --version 1.3.9 --pointer-only
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" .../api/releases/refresh
```

`--pointer-only` skips the walk and upload and only rewrites `live/runtime.json`
from the existing `agent-v1.3.9` assets. Machines pick it up on their next idle
moment.

On-device fallback covers a runtime that cannot boot: `boot.lua` runs `current/`,
and on a Lua error copies `prev/` back over `current/` and reboots. That path is
automatic and needs no operator.

## 6. Emergency: patch one machine by hand

Only when a machine is unreachable by update and physically accessible. This
bypasses the version check, so fix the root cause and publish properly
afterwards.

```
# on the turtle
wget https://github.com/Igidn/tethys/releases/download/agent-v1.4.0/lib__link.lua /tethys/current/lib/link.lua
reboot
```

To reinstall from scratch:

```
wget run https://github.com/Igidn/tethys/releases/download/live/install.lua
```

A reinstall reuses `/tethys/identity.json`, so the machine keeps its id, role,
and job history. Delete the identity only if the machine should be treated as
new.

## 7. Verify

```sh
# what the server thinks is current
curl -s https://.../api/runtime/latest | jq

# what a machine reports
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://.../api/state | jq '.agents[] | {label, runtime, state}'
```

In the dashboard, check the `runtime` column and the event log for
`update_staged`, `update_applied`, and `update_failed`. A machine that staged but
never applied is usually not idle; a machine that rebooted into `prev/` reports
`boot_fallback`.

## 8. Checklist before publishing

- [ ] `agents/VERSION` bumped and matches `--version`
- [ ] `lua agents/tests/run.lua` passes
- [ ] `pytest` passes, plan vectors match
- [ ] No new file reads or writes outside `/tethys/` and `/startup.lua`
- [ ] No new blocking call without a timeout
- [ ] Offline path still finishes or aborts a job
- [ ] Protocol change? `v` bumped and both sides updated
- [ ] `--dry-run` reviewed
- [ ] Published to canary, one machine updated, logs clean, then promoted

## 9. Things that are not obvious

- **Storage is small.** A full runtime is about 120 KB. Do not add a dependency
  on a large asset; music streams, it never caches.
- **The tunnel is a laptop.** It sleeps, it changes networks, it drops. Any code
  path that assumes a socket is alive is a bug.
- **Chunk loading is not a code problem.** A turtle in an unloaded chunk freezes.
  If a machine stops responding with a healthy heartbeat beforehand, look at
  simulation distance, not at the runtime.
- **GitHub release assets are cached.** A clobbered `live` pointer can take a few
  minutes to propagate. Agents retry; do not chase it as a bug.
- **The secret is not cryptographic.** CC:T's `math.random` is seeded from the
  clock and computer id. That is acceptable on a private server behind an
  unguessable route, and it is not acceptable for anything public.
