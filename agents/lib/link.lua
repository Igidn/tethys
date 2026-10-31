-- WebSocket link. Reconnects forever, refreshes the address after repeated
-- failures, and keeps the supervisor running across an outage.
local util = require("lib.util")
local resolve = require("lib.resolve")
local commands = require("lib.commands")

local M = {}

local function heartbeat(bus)
  local payload = bus.status and bus.status() or {}
  payload.v = 1
  payload.type = "heartbeat"
  payload.fw = util.version()
  return payload
end

local function ack(ws, id, status, result)
  pcall(function()
    ws.send(util.jsonEncode({ v = 1, type = "ack", id = id, status = status, result = result }))
  end)
end

function M.handle(msg, bus, ws, identity)
  if msg.type == "command" then
    local status, result, after = commands.handle(msg, bus, identity)
    ack(ws, msg.id, status, result)
    if after then
      -- Give the socket a moment to flush the ack before the machine reboots
      -- or deletes the directory this code was loaded from.
      os.sleep(0.5)
      after()
    end
    return
  end

  if msg.op == "ping" then
    pcall(function()
      ws.send(util.jsonEncode({ v = 1, type = "pong", id = msg.id, seq = msg.seq }))
    end)
    return
  end

  -- Never ignore an unknown message: the server needs to see version skew.
  ack(ws, msg.id, "unknown-op")
end

local function connectOnce(identity, bus)
  local url, err = resolve.current()
  if not url then return nil, "no server address: " .. tostring(err) end

  local ws, werr = http.websocket(resolve.wsUrl(url), {
    ["User-Agent"] = "tethys/" .. util.version(),
  })
  if not ws then return nil, "connect failed: " .. tostring(werr) end

  local hello = {
    v = 1,
    type = "hello",
    id = identity.id,
    secret = identity.secret,
    computerId = os.getComputerID(),
    label = os.getComputerLabel(),
    fw = util.version(),
    state = bus.state or "idle",
  }

  local ok, sendErr = pcall(function() ws.send(util.jsonEncode(hello)) end)
  if not ok then
    pcall(function() ws.close() end)
    return nil, "hello failed: " .. tostring(sendErr)
  end

  local raw = ws.receive(10)
  local welcome = raw and util.jsonDecode(raw) or nil
  if type(welcome) ~= "table" or welcome.type ~= "welcome" then
    pcall(function() ws.close() end)
    local reason = type(welcome) == "table" and welcome.error or "no welcome"
    return nil, "handshake failed: " .. tostring(reason)
  end

  bus.connected = true
  bus.agentId = welcome.agentId or identity.id
  bus.role = welcome.role or bus.role
  bus.config = welcome.config or bus.config
  bus.serverTime = welcome.serverTime
  bus.heartbeatMs = welcome.heartbeatMs or 5000
  util.log("link: connected as", bus.agentId, "role", tostring(bus.role))

  local lastBeat = util.now()
  while true do
    local okRecv, incoming, reason = pcall(function() return ws.receive(0.5) end)
    if not okRecv then break end
    if incoming == nil and reason ~= "Timed out" then break end

    if incoming then
      local msg = util.jsonDecode(incoming)
      if type(msg) == "table" then
        if msg.type == "command" or msg.op then
          M.handle(msg, bus, ws, identity)
        elseif msg.type == "error" then
          util.log("link: server error:", tostring(msg.error))
        end
      end
    end

    if util.now() - lastBeat >= bus.heartbeatMs then
      local payload = heartbeat(bus)
      local sent = pcall(function() ws.send(util.jsonEncode(payload)) end)
      if not sent then break end
      lastBeat = util.now()
    end
  end

  bus.connected = false
  pcall(function() ws.close() end)
  util.log("link: disconnected")
  return true
end

function M.run(identity, bus)
  local backoff = 1
  local failures = 0

  while true do
    local ok, err = connectOnce(identity, bus)
    if ok then
      backoff = 1
      failures = 0
      os.sleep(backoff)
    else
      failures = failures + 1
      util.log("link:", tostring(err))
      if failures >= 3 then
        resolve.refresh()
        failures = 0
      end
      os.sleep(backoff)
      backoff = math.min(backoff * 2, 30)
    end
  end
end

return M
