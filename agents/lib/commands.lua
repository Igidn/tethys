-- Command dispatch and the at-least-once ledger.
--
-- The server retries a command until it sees an ack. The ledger makes a retry
-- idempotent: the same id is acked again, but not executed twice.
local util = require("lib.util")

local M = {}

M.LEDGER = "/tethys/state/commands.json"
M.LEDGER_LIMIT = 100

local function loadLedger()
  local data = util.readJson(M.LEDGER)
  if type(data) ~= "table" then return {} end
  return data
end

local function saveLedger(ledger)
  -- Keep insertion order by rebuilding the list from the newest ids.
  local order = {}
  for id in pairs(ledger) do order[#order + 1] = id end
  table.sort(order, function(a, b)
    return (ledger[a].ts or 0) > (ledger[b].ts or 0)
  end)
  for i = M.LEDGER_LIMIT + 1, #order do ledger[order[i]] = nil end
  util.writeJson(M.LEDGER, ledger)
end

local function record(id, status, result)
  local ledger = loadLedger()
  ledger[id] = { status = status, result = result, ts = util.now() }
  saveLedger(ledger)
end

local function persistIdentity(identity, bus)
  identity.role = bus.role
  identity.config = bus.config
  return require("lib.identity").save(identity)
end

local function restoreStartup()
  if fs.exists("/startup.lua.bak") then
    if fs.exists("/startup.lua") then fs.delete("/startup.lua") end
    fs.copy("/startup.lua.bak", "/startup.lua")
    return
  end
  local handle = fs.open("/startup.lua", "w")
  if handle then
    handle.write('print("Tethys was removed from this computer.")\n')
    handle.close()
  end
end

local handlers = {}

handlers.setRole = function(msg, bus, identity)
  if type(msg.payload) ~= "table" then return "bad-payload" end
  if type(msg.payload.role) == "string" then bus.role = msg.payload.role end
  if type(msg.payload.config) == "table" then bus.config = msg.payload.config end
  persistIdentity(identity, bus)
  util.log("commands: role", tostring(bus.role))
  return "role-assigned"
end

handlers.setConfig = function(msg, bus, identity)
  if type(msg.payload) ~= "table" or type(msg.payload.config) ~= "table" then
    return "bad-payload"
  end
  bus.config = msg.payload.config
  persistIdentity(identity, bus)
  util.writeJson("/tethys/config.json", bus.config)
  util.log("commands: config updated")
  return "config-set"
end

handlers.reboot = function(msg, bus)
  bus.state = "rebooting"
  return "rebooting", nil, function() os.reboot() end
end

handlers.update = function()
  -- Phase 4 installs a new runtime. Ack as failed so the server sees it.
  return "unsupported"
end

handlers.wipe = function(msg, bus)
  bus.state = "removed"
  util.log("commands: wiping this computer")
  return "wiped", nil, function()
    restoreStartup()
    if fs.exists("/tethys") then fs.delete("/tethys") end
    os.reboot()
  end
end

--- Run a command envelope. Returns status, result, after.
function M.handle(msg, bus, identity)
  local id = tostring(msg.id or "")
  if id == "" then return "bad-id" end

  local ledger = loadLedger()
  local seen = ledger[id]
  if seen then
    -- A retry of something already done: ack again, do not re-run.
    return seen.status, seen.result
  end

  local handler = handlers[msg.op]
  if not handler then
    record(id, "unknown-op", nil)
    return "unknown-op"
  end

  local ok, status, result, after = pcall(handler, msg, bus, identity)
  if not ok then
    util.log("commands: " .. tostring(msg.op) .. " failed:", tostring(status))
    record(id, "error", { error = tostring(status) })
    return "error", { error = tostring(status) }
  end

  status = status or "ok"
  record(id, status, result)
  return status, result, after
end

return M
