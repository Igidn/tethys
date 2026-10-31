-- Desktop test harness. Runs on Lua 5.1+ (luajit is fine), no Minecraft needed.
--
--   lua agents/tests/run.lua
--
-- Phase 1 covers syntax for every runtime file and the pure helpers. Role
-- behaviour and the mock HAL arrive with the mining runtime.

package.path = "agents/?.lua;" .. package.path

local checks = 0

local function check(name, condition)
  checks = checks + 1
  if not condition then
    error("FAIL " .. name, 2)
  end
  print("ok   " .. name)
end

local files = {
  "agents/main.lua",
  "agents/boot.lua",
  "agents/install.lua",
  "agents/lib/util.lua",
  "agents/lib/identity.lua",
  "agents/lib/resolve.lua",
  "agents/lib/link.lua",
  "agents/lib/supervisor.lua",
}

for _, path in ipairs(files) do
  local chunk, err = loadfile(path)
  if not chunk then
    error("syntax error in " .. path .. ": " .. tostring(err))
  end
  check("syntax " .. path, true)
end

-- Stub the pieces of the CC:T API the pure helpers touch.
local disk = {
  ["/tethys/version"] = "1.2.3\n",
}

fs = {
  exists = function(path) return disk[path] ~= nil end,
  open = function(path)
    if not disk[path] then return nil end
    return {
      readAll = function() return disk[path] end,
      close = function() end,
    }
  end,
}

os.epoch = os.epoch or function() return 0 end

local util = require("lib.util")
check("version trims trailing whitespace", util.version() == "1.2.3")
check("missing version falls back", (function()
  disk["/tethys/version"] = nil
  local value = util.version()
  disk["/tethys/version"] = "1.2.3\n"
  return value == "0.0.0"
end)())

local resolve = require("lib.resolve")
check(
  "https maps to wss and /ws",
  resolve.wsUrl("https://example.test") == "wss://example.test/ws"
)
check(
  "http maps to ws and strips trailing slash",
  resolve.wsUrl("http://example.test/") == "ws://example.test/ws"
)
check(
  "existing /ws is kept",
  resolve.wsUrl("https://example.test/ws") == "wss://example.test/ws"
)

print(("\n%d checks passed"):format(checks))
