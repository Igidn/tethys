-- Server address rendezvous. The public URL is published as a release asset on
-- GitHub, which is on the CC:T default allowlist, so the tunnel can move
-- without touching a single machine.
local util = require("lib.util")

local M = {}

M.REPO = "Igidn/tethys"
M.TAG = "live"
M.BASE = "https://github.com/" .. M.REPO .. "/releases/download/" .. M.TAG
M.CACHE = "/tethys/server.json"
M.TTL = 10 * 60 * 1000

local function get(url)
  if not http then return nil, "http is disabled" end
  local response, err = http.get({
    url = url,
    timeout = 20,
    headers = { ["User-Agent"] = "tethys/" .. util.version() },
  })
  if not response then return nil, err or "request failed" end
  local code = response.getResponseCode()
  local body = response.readAll()
  response.close()
  if code ~= 200 then return nil, ("HTTP %d from %s"):format(code, url) end
  return body
end

function M.fetch()
  local body, err = get(M.BASE .. "/server.json")
  if not body then return nil, err end

  local data = util.jsonDecode(body)
  if type(data) ~= "table" or type(data.url) ~= "string" or data.url == "" then
    return nil, "server.json has no url"
  end

  local url = data.url:gsub("/+$", "")
  util.writeJson(M.CACHE, { url = url, fetchedAt = util.now() })
  return url
end

--- Cached URL while fresh, otherwise re-fetch. Falls back to the last known
--- URL so a GitHub outage does not strand a working machine.
function M.current()
  local cached = util.readJson(M.CACHE)
  if type(cached) == "table" and type(cached.url) == "string" then
    if util.now() - (cached.fetchedAt or 0) < M.TTL then
      return cached.url
    end
    local url, err = M.fetch()
    if url then return url end
    util.log("resolve: refresh failed:", err)
    return cached.url
  end
  return M.fetch()
end

function M.refresh()
  return M.fetch()
end

function M.wsUrl(url)
  local base = url:gsub("/+$", "")
  if base:sub(1, 8) == "https://" then
    base = "wss://" .. base:sub(9)
  elseif base:sub(1, 7) == "http://" then
    base = "ws://" .. base:sub(8)
  end
  if base:sub(-3) ~= "/ws" then base = base .. "/ws" end
  return base
end

return M
