-- Stable boot entry. Lives at /tethys/boot.lua, outside current/, so a broken
-- update can always fall back to prev/ without touching startup.lua.
local CURRENT = "/tethys/current"
local PREV = "/tethys/prev"
local VERSION = "/tethys/version"
local PREV_VERSION = "/tethys/prev-version"

local function read(path)
  if not fs.exists(path) then return nil end
  local handle = fs.open(path, "rb")
  if not handle then return nil end
  local data = handle.readAll()
  handle.close()
  return data
end

local function write(path, data)
  local handle = fs.open(path, "wb")
  if not handle then return false end
  handle.write(data)
  handle.close()
  return true
end

local function restorePrevious()
  if not fs.exists(PREV .. "/main.lua") then return false end
  if fs.exists(CURRENT) then fs.delete(CURRENT) end
  fs.copy(PREV, CURRENT)
  local version = read(PREV_VERSION)
  if version then write(VERSION, version) end
  return true
end

if not fs.exists(CURRENT .. "/main.lua") then
  print("Tethys runtime is missing.")
  if restorePrevious() then
    print("Restored the previous runtime.")
  else
    print("Reinstall from the live release.")
    return
  end
end

print("Tethys " .. (read(VERSION) or "unknown"))

local ok, err = pcall(function()
  local chunk, loadErr = loadfile(CURRENT .. "/main.lua")
  if not chunk then error(loadErr or "could not load main.lua") end
  chunk()
end)

if not ok then
  print("Runtime error: " .. tostring(err))
  if restorePrevious() then
    print("Rolled back to the previous runtime.")
  else
    print("No previous runtime available.")
  end
  print("Rebooting in 5 seconds.")
  os.sleep(5)
  os.reboot()
end
