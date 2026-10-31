-- Desktop test harness. Runs on Lua 5.1+ (luajit is fine), no Minecraft needed.
--
--   luajit agents/tests/run.lua
--
-- The fake filesystem and OS are enough to exercise the installer-independent
-- helpers and the command dispatcher.

package.path = "agents/?.lua;" .. package.path

local checks = 0

local function check(name, condition)
  checks = checks + 1
  if not condition then
    error("FAIL " .. name, 2)
  end
  print("ok   " .. name)
end

local files = {}
local dirs = {}

local function under(path, root)
  return path == root or path:sub(1, #root + 1) == root .. "/"
end

local function isDir(path)
  if dirs[path] then return true end
  for file in pairs(files) do
    if under(file, path) then return true end
  end
  return false
end

local function copyTree(from, to)
  files[to] = files[from]
  for file in pairs(files) do
    if file ~= from and under(file, from) then
      files[to .. file:sub(#from + 1)] = files[file]
    end
  end
end

local function deleteTree(path)
  for file in pairs(files) do
    if under(file, path) then files[file] = nil end
  end
  for dir in pairs(dirs) do
    if under(dir, path) then dirs[dir] = nil end
  end
end

local function openFile(path, mode)
  if mode == "rb" or mode == "r" then
    if files[path] == nil then return nil end
    local cursor = 1
    return {
      readAll = function() return files[path] end,
      read = function()
        if cursor > #files[path] then return nil end
        local rest = files[path]:sub(cursor)
        cursor = #files[path] + 1
        return rest
      end,
      close = function() end,
    }
  end
  local buffer = ""
  return {
    write = function(data) buffer = buffer .. data end,
    close = function() files[path] = buffer end,
  }
end

fs = {
  exists = function(path) return files[path] ~= nil or isDir(path) end,
  open = openFile,
  makeDir = function(path) dirs[path] = true end,
  delete = deleteTree,
  copy = copyTree,
  move = function(from, to)
    copyTree(from, to)
    deleteTree(from)
  end,
}

local rebooted = 0

os.epoch = function() return 1700000000000 end
os.date = function() return "00:00:00" end
os.sleep = function() end
os.reboot = function() rebooted = rebooted + 1 end

-- A compact JSON codec standing in for textutils. It only has to handle the
-- shapes the runtime actually serializes.
local function encode(value)
  local kind = type(value)
  if kind == "nil" then return "null" end
  if kind == "boolean" then return value and "true" or "false" end
  if kind == "number" then return tostring(value) end
  if kind == "string" then
    return '"' .. value:gsub('[%z\1-\31\\"]', function(char)
      local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
      return map[char] or ("\\u%04x"):format(char:byte())
    end) .. '"'
  end
  if kind == "table" then
    if #value > 0 or next(value) == nil then
      local parts = {}
      for index = 1, #value do parts[index] = encode(value[index]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for key, item in pairs(value) do
      parts[#parts + 1] = encode(tostring(key)) .. ":" .. encode(item)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

local function decode(text)
  local cursor = 1
  local value

  local function skip()
    while text:sub(cursor, cursor):match("%s") do cursor = cursor + 1 end
  end

  local parse

  local function parseString()
    cursor = cursor + 1
    local out = {}
    while true do
      local char = text:sub(cursor, cursor)
      if char == "" then error("unterminated string") end
      cursor = cursor + 1
      if char == '"' then break end
      if char == "\\" then
        local escape = text:sub(cursor, cursor)
        cursor = cursor + 1
        local map = { n = "\n", r = "\r", t = "\t", b = "\b", f = "\f", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
        if map[escape] then
          out[#out + 1] = map[escape]
        elseif escape == "u" then
          local hex = text:sub(cursor, cursor + 3)
          cursor = cursor + 4
          out[#out + 1] = string.char(tonumber(hex, 16) % 256)
        else
          error("bad escape")
        end
      else
        out[#out + 1] = char
      end
    end
    return table.concat(out)
  end

  local function parseNumber()
    local start = cursor
    while text:sub(cursor, cursor):match("[%d%.eE%+%-]") do cursor = cursor + 1 end
    return tonumber(text:sub(start, cursor - 1))
  end

  parse = function()
    skip()
    local char = text:sub(cursor, cursor)
    if char == "{" then
      cursor = cursor + 1
      local out = {}
      skip()
      if text:sub(cursor, cursor) == "}" then cursor = cursor + 1; return out end
      while true do
        skip()
        local key = parseString()
        skip()
        cursor = cursor + 1 -- colon
        out[key] = parse()
        skip()
        local sep = text:sub(cursor, cursor)
        cursor = cursor + 1
        if sep == "}" then break end
      end
      return out
    elseif char == "[" then
      cursor = cursor + 1
      local out = {}
      skip()
      if text:sub(cursor, cursor) == "]" then cursor = cursor + 1; return out end
      while true do
        out[#out + 1] = parse()
        skip()
        local sep = text:sub(cursor, cursor)
        cursor = cursor + 1
        if sep == "]" then break end
      end
      return out
    elseif char == '"' then
      return parseString()
    elseif text:sub(cursor, cursor + 3) == "true" then
      cursor = cursor + 4; return true
    elseif text:sub(cursor, cursor + 4) == "false" then
      cursor = cursor + 5; return false
    elseif text:sub(cursor, cursor + 3) == "null" then
      cursor = cursor + 4; return nil
    end
    return parseNumber()
  end

  value = parse()
  return value
end

textutils = {
  serializeJSON = encode,
  unserializeJSON = decode,
}

files["/tethys/version"] = "1.2.3\n"

-- Syntax ---------------------------------------------------------------------

local sources = {
  "agents/main.lua",
  "agents/boot.lua",
  "agents/install.lua",
  "agents/lib/util.lua",
  "agents/lib/identity.lua",
  "agents/lib/resolve.lua",
  "agents/lib/link.lua",
  "agents/lib/commands.lua",
  "agents/lib/supervisor.lua",
  "agents/mining/miner.lua",
}

for _, path in ipairs(sources) do
  local chunk, err = loadfile(path)
  if not chunk then
    error("syntax error in " .. path .. ": " .. tostring(err))
  end
  check("syntax " .. path, true)
end

-- Helpers --------------------------------------------------------------------

local util = require("lib.util")
check("version trims trailing whitespace", util.version() == "1.2.3")
check("missing version falls back", (function()
  files["/tethys/version"] = nil
  local value = util.version()
  files["/tethys/version"] = "1.2.3\n"
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

-- Commands -------------------------------------------------------------------

local commands = require("lib.commands")
local identity = { id = "aabbccddeeff0011", secret = string.rep("b", 32) }
local bus = { role = "unassigned", config = {}, state = "idle" }

local status = commands.handle(
  { id = "c1", op = "setRole", payload = { role = "mining", config = { sector = 48 } } },
  bus,
  identity
)
check("setRole acks", status == "role-assigned")
check("setRole updates the bus", bus.role == "mining" and bus.config.sector == 48)
check(
  "setRole persists identity",
  util.readJson("/tethys/identity.json").role == "mining"
)

local dupStatus = commands.handle(
  { id = "c1", op = "setRole", payload = { role = "music" } },
  bus,
  identity
)
check("a duplicate id re-acks without re-running", dupStatus == "role-assigned")
check("a duplicate does not change state", bus.role == "mining")

local unknown = commands.handle({ id = "c2", op = "teleport" }, bus, identity)
check("unknown ops are reported", unknown == "unknown-op")

files["/startup.lua.bak"] = "shell.run('old.lua')\n"
files["/startup.lua"] = "-- tethys managed startup\n"
files["/tethys/current/main.lua"] = "return 1\n"

local wipeStatus, _, after = commands.handle({ id = "c3", op = "wipe" }, bus, identity)
check("wipe acks before acting", wipeStatus == "wiped" and type(after) == "function")
check("wipe does not delete before the ack", fs.exists("/tethys/current/main.lua"))

after()
check("wipe restores the previous startup", files["/startup.lua"] == "shell.run('old.lua')\n")
check("wipe removes the runtime", not fs.exists("/tethys"))
check("wipe reboots", rebooted == 1)

local rebootStatus, _, rebootAfter = commands.handle({ id = "c4", op = "reboot" }, bus, identity)
check("reboot acks", rebootStatus == "rebooting")
rebootAfter()
check("reboot reboots", rebooted == 2)

print(("\n%d checks passed"):format(checks))
