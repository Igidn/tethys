import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveAgent,
  changeRole,
  getState,
  openStream,
  rebootAgent,
  removeAgent,
  uninstallAgent,
  type Agent,
  type Command,
  type Role,
  type State,
} from "./api";

const ROLE_LABEL: Record<Role, string> = {
  unassigned: "unassigned",
  mining: "mining",
  music: "music",
};

function relative(timestamp: number | null, now: number): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Dot({ live }: { live: boolean }) {
  return <span className="dot" data-live={live} aria-hidden="true" />;
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="gate-wrap">
      <form
        className="gate"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.trim());
        }}
      >
        <span className="mark">TETHYS</span>
        <p>
          Paste the admin token from <code>server/.env</code>. It is stored in this
          browser only.
        </p>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="admin token"
          autoFocus
          spellCheck={false}
        />
        <button className="primary" type="submit">
          open console
        </button>
      </form>
    </div>
  );
}

function PendingCard({
  agent,
  roles,
  busy,
  onApprove,
  onDismiss,
}: {
  agent: Agent;
  roles: Role[];
  busy: boolean;
  onApprove: (agent: Agent, role: Role) => void;
  onDismiss: (agent: Agent) => void;
}) {
  const [role, setRole] = useState<Role>("mining");

  return (
    <article className="card pending">
      <div className="code">{agent.pairingCode ?? "------"}</div>
      <div className="pending-meta">
        <span className="mono">computer #{agent.computerId ?? "?"}</span>
        <span className="muted">{agent.label ?? "unlabelled"}</span>
      </div>
      <div className="pending-actions">
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {roles.map((entry) => (
            <option key={entry} value={entry}>
              {ROLE_LABEL[entry] ?? entry}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy} onClick={() => onApprove(agent, role)}>
          approve
        </button>
        <button className="ghost" disabled={busy} onClick={() => onDismiss(agent)}>
          dismiss
        </button>
      </div>
    </article>
  );
}

function FleetRow({
  agent,
  now,
  roles,
  busy,
  onChangeRole,
  onReboot,
  onUninstall,
  onRemove,
}: {
  agent: Agent;
  now: number;
  roles: Role[];
  busy: boolean;
  onChangeRole: (agent: Agent, role: Role) => void;
  onReboot: (agent: Agent) => void;
  onUninstall: (agent: Agent) => void;
  onRemove: (agent: Agent) => void;
}) {
  const removing = agent.status === "removing";
  const state = removing ? "removing" : agent.online ? (agent.state ?? "idle") : "offline";
  const fuel = agent.fuel === "unlimited" ? "∞" : (agent.fuel ?? "—");

  return (
    <tr data-removing={removing}>
      <td>
        <div className="name">
          <Dot live={agent.online && !removing} />
          <span>{agent.label ?? "unlabelled"}</span>
        </div>
        <span className="mono muted small">
          {agent.id.slice(0, 8)} · #{agent.computerId ?? "?"}
        </span>
      </td>
      <td>
        <select
          className="inline"
          value={agent.role}
          disabled={busy || removing}
          onChange={(event) => onChangeRole(agent, event.target.value as Role)}
        >
          {roles.map((entry) => (
            <option key={entry} value={entry}>
              {ROLE_LABEL[entry] ?? entry}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="state" data-state={state}>
          {state}
        </span>
      </td>
      <td className="mono">{agent.runtime ?? "—"}</td>
      <td className="mono">{fuel}</td>
      <td className="mono muted">{relative(agent.lastSeen, now)}</td>
      <td className="right row-actions">
        {removing ? (
          <span className="mono muted small">waiting for wipe</span>
        ) : (
          <>
            <button
              className="ghost small"
              disabled={busy || !agent.online}
              onClick={() => onReboot(agent)}
            >
              reboot
            </button>
            <button className="ghost small" disabled={busy} onClick={() => onUninstall(agent)}>
              uninstall
            </button>
            <button className="ghost small" disabled={busy} onClick={() => onRemove(agent)}>
              remove
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function CommandRow({ command, now }: { command: Command; now: number }) {
  return (
    <li className="log-row">
      <span className="state" data-state={command.state}>
        {command.state}
      </span>
      <span className="mono">{command.op}</span>
      <span className="mono muted small">
        {command.attempts > 0 ? `${command.attempts} attempt${command.attempts === 1 ? "" : "s"}` : "queued"}
      </span>
      <span className="mono muted small right">{relative(command.createdAt, now)}</span>
    </li>
  );
}

export default function App() {
  const [token, setToken] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) {
      window.localStorage.setItem("tethys.token", fromUrl);
      window.history.replaceState({}, "", window.location.pathname);
      return fromUrl;
    }
    return window.localStorage.getItem("tethys.token") ?? "";
  });
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const stop = openStream(
      token,
      (next) => {
        if (cancelled) return;
        setState(next);
        setError(null);
      },
      (cause) => {
        if (!cancelled) setError(cause.message);
      },
    );

    // A first fetch paints immediately instead of waiting for a change.
    void getState(token)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);

  const run = useCallback(
    async (id: string, action: () => Promise<unknown>) => {
      setBusy(id);
      setError(null);
      try {
        await action();
        setState(await getState(token));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(null);
      }
    },
    [token],
  );

  const roles = useMemo<Role[]>(
    () => (state?.config.roles as Role[] | undefined) ?? ["unassigned", "mining", "music"],
    [state],
  );

  if (!token) {
    return (
      <TokenGate
        onSubmit={(value) => {
          window.localStorage.setItem("tethys.token", value);
          setToken(value);
        }}
      />
    );
  }

  const pending = state?.pending ?? [];
  const agents = state?.agents ?? [];
  const commands = state?.commands ?? [];

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="mark">TETHYS</span>
          <span className="sub">control plane</span>
        </div>
        <div className="top-meta">
          <span className="mono tunnel">{state?.tunnel?.host ?? "no tunnel"}</span>
          <span className="pill">
            <Dot live={Boolean(state?.counts.online)} />
            {state?.counts.online ?? 0} online
          </span>
          {state?.counts.removing ? (
            <span className="pill warning">{state.counts.removing} removing</span>
          ) : null}
          <button
            className="ghost small"
            onClick={() => {
              window.localStorage.removeItem("tethys.token");
              setToken("");
              setState(null);
            }}
          >
            lock
          </button>
        </div>
      </header>

      <main>
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        <section>
          <div className="section-head">
            <h2>pending approval</h2>
            <span className="count">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <p className="empty">
              No machines waiting. Run the installer on a computer or turtle to enroll
              one.
            </p>
          ) : (
            <div className="pending-grid">
              {pending.map((agent) => (
                <PendingCard
                  key={agent.id}
                  agent={agent}
                  roles={roles}
                  busy={busy === agent.id}
                  onApprove={(target, role) =>
                    run(target.id, () => approveAgent(token, target.id, role))
                  }
                  onDismiss={(target) => run(target.id, () => removeAgent(token, target.id))}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-head">
            <h2>fleet</h2>
            <span className="count">{agents.length}</span>
          </div>

          {agents.length === 0 ? (
            <p className="empty">No machines enrolled yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>machine</th>
                    <th>role</th>
                    <th>state</th>
                    <th>runtime</th>
                    <th>fuel</th>
                    <th>last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <FleetRow
                      key={agent.id}
                      agent={agent}
                      now={now}
                      roles={roles}
                      busy={busy === agent.id}
                      onChangeRole={(target, role) =>
                        run(target.id, () => changeRole(token, target.id, role))
                      }
                      onReboot={(target) =>
                        run(target.id, () => rebootAgent(token, target.id))
                      }
                      onUninstall={(target) => {
                        if (
                          window.confirm(
                            `Uninstall Tethys from ${target.label ?? target.id.slice(0, 8)}? The machine wipes itself and reboots.`,
                          )
                        ) {
                          void run(target.id, () => uninstallAgent(token, target.id));
                        }
                      }}
                      onRemove={(target) => {
                        if (
                          window.confirm(
                            `Remove ${target.label ?? target.id.slice(0, 8)}? It wipes itself on the next connect.`,
                          )
                        ) {
                          void run(target.id, () => removeAgent(token, target.id));
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="section-head">
            <h2>recent commands</h2>
            <span className="count">{commands.length}</span>
          </div>

          {commands.length === 0 ? (
            <p className="empty">
              No commands yet. Changing a role or rebooting queues work that survives a
              disconnect.
            </p>
          ) : (
            <ul className="log">
              {commands.slice(0, 8).map((command) => (
                <CommandRow key={command.id} command={command} now={now} />
              ))}
            </ul>
          )}
        </section>

        <footer className="foot">
          <span className="mono muted small">
            {state?.config.githubRepo ?? "Igidn/tethys"} · {state?.config.liveTag ?? "live"}
          </span>
          <span className="mono muted small">
            heartbeat {Math.round((state?.config.heartbeatMs ?? 5000) / 1000)}s
          </span>
        </footer>
      </main>
    </>
  );
}
