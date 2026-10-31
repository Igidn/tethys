-- Tethys installer.
--
--   wget run https://github.com/Igidn/tethys/releases/download/live/install.lua
--
-- Generates or reuses /tethys/identity.json, registers with the control plane,
-- shows a pairing code, waits for the operator to approve a role, installs the
-- published runtime, and reboots.

local REPO = "Igidn/tethys"
local TAG = "live"
local BASE = "https://github.com/" .. REPO .. "/releases/download/" .. TAG
local DEST = "/tethys"
local ID_PATH = DEST .. "/identity.json"
local CONFIG_PATH = DEST .. "/config.json"
local VERSION_PATH = DEST .. "/version"
local PREV_VERSION_PATH = DEST .. "/prev-version"
local CURRENT = DEST .. "/current"
local PREV = DEST .. "/prev"
local STAGING = DEST .. "/.staging"
local INSTALLER_VERSION = "0.2.0"
local APPROVAL_TIMEOUT = 15 * 60 * 1000

-- Helpers --------------------------------------------------------------------

local function ensureDir(path)
  local current = ""
  for part in path:gmatch("[^/]+") do
    current = current .. "/" .. part
    if not fs.exists(current) then fs.makeDir(current) end
  end
end

local function readFile(path)
  if not fs.exists(path) then return nil end
  local handle = fs.open(path, "rb")
  if not handle then return nil end
  local data = handle.readAll()
  handle.close()
  return data
end

local function writeFile(path, data)
  local dir = path:match("^(.*)/[^/]+$")
  if dir then ensureDir(dir) end
  local handle = fs.open(path, "wb")
  if not handle then return nil, "cannot write " .. path end
  handle.write(data)
  handle.close()
  return true
end

local function jsonEncode(value)
  local ok, out = pcall(textutils.serializeJSON, value)
  if ok then return out end
  return "{}"
end

local function jsonDecode(text)
  if type(text) ~= "string" then return nil end
  local ok, value = pcall(textutils.unserializeJSON, text)
  if ok then return value end
  return nil
end

local function headers(extra)
  local merged = { ["User-Agent"] = "tethys-installer/" .. INSTALLER_VERSION }
  for key, value in pairs(extra or {}) do merged[key] = value end
  return merged
end

local function unpackResponse(response, url)
  local code = response.getResponseCode()
  local body = response.readAll()
  response.close()
  if code ~= 200 then
    return nil, ("HTTP %d from %s"):format(code, url), body
  end
  return body
end

local function get(url, extra)
  local response, err = http.get({ url = url, timeout = 30, headers = headers(extra) })
  if not response then return nil, err or "request failed" end
  return unpackResponse(response, url)
end

local function post(url, value, extra)
  local response, err = http.post({
    url = url,
    body = jsonEncode(value),
    timeout = 30,
    headers = headers({ ["Content-Type"] = "application/json" }),
  })
  if not response then return nil, err or "request failed" end
  return unpackResponse(response, url)
end

local function randomHex(count)
  math.randomseed(os.epoch("utc") + os.getComputerID())
  local out = {}
  for i = 1, count do out[i] = string.format("%x", math.random(0, 15)) end
  return table.concat(out)
end

local function boxed(text)
  local pad = 20 - #text
  local left = math.floor(pad / 2)
  return "  |" .. string.rep(" ", left) .. text .. string.rep(" ", pad - left) .. "|"
end

local function banner(code)
  term.clear()
  term.setCursorPos(1, 1)
  print("TETHYS INSTALLER " .. INSTALLER_VERSION)
  print("")
  print("  +--------------------+")
  print(boxed("PAIRING CODE"))
  print(boxed(code))
  print("  +--------------------+")
  print("")
  print("Enter this code in the Tethys dashboard.")
  print("")
  print("computer  #" .. os.getComputerID())
  print("label     " .. tostring(os.getComputerLabel() or "unlabelled"))
  print("")
end

local function fail(message)
  print("")
  print("Install failed: " .. tostring(message))
end

-- Preconditions --------------------------------------------------------------

if not http then
  print("HTTP is disabled on this computer.")
  print("Set http.enabled = true in serverconfig/computercraft-server.toml.")
  return
end

local args = { ... }
local override
for i = 1, #args do
  if args[i] == "--url" and args[i + 1] then override = args[i + 1] end
end

local okUrl, urlReason = http.checkURL(BASE .. "/server.json")
if not okUrl then
  print("This computer may not reach GitHub: " .. tostring(urlReason))
  print("Add to serverconfig/computercraft-server.toml:")
  print('  [[http.rules]]')
  print('      host = "github.com"')
  print('      action = "allow"')
  return
end

-- Identity -------------------------------------------------------------------

ensureDir(DEST)
ensureDir(DEST .. "/state")

local identity = jsonDecode(readFile(ID_PATH) or "") or {}
local id = identity.id
local secret = identity.secret

if type(id) ~= "string" or #id ~= 16 or type(secret) ~= "string" or #secret ~= 32 then
  local entropy = randomHex(48)
  id = entropy:sub(1, 16)
  secret = entropy:sub(17, 48)
  print("generated machine id " .. id)
else
  print("reusing machine id " .. id)
end

-- Server address -------------------------------------------------------------

local url = override and override:gsub("/+$", "")
if not url then
  local body, err = get(BASE .. "/server.json")
  if not body then
    print("Could not read the server address: " .. tostring(err))
    if type(identity.serverUrl) == "string" then
      url = identity.serverUrl
      print("using the last known address " .. url)
    else
      return
    end
  else
    local data = jsonDecode(body)
    if type(data) ~= "table" or type(data.url) ~= "string" then
      print("server.json is malformed.")
      return
    end
    url = data.url:gsub("/+$", "")
  end
end

print("server " .. url)

local okServer, serverReason = http.checkURL(url .. "/api/enroll")
if not okServer then
  local host = url:match("^https?://([^/]+)") or url
  print("This computer may not reach " .. url .. ": " .. tostring(serverReason))
  print("Add to serverconfig/computercraft-server.toml:")
  print('  [[http.rules]]')
  print('      host = "' .. host .. '"')
  print('      action = "allow"')
  return
end

-- Enrollment ----------------------------------------------------------------

print("registering...")
local enrollBody, enrollErr, enrollRaw = post(url .. "/api/enroll", {
  id = id,
  secret = secret,
  computerId = os.getComputerID(),
  label = os.getComputerLabel(),
  version = INSTALLER_VERSION,
})
if not enrollBody then
  fail(enrollErr .. (enrollRaw and (" " .. enrollRaw) or ""))
  return
end

local enrolled = jsonDecode(enrollBody)
if type(enrolled) ~= "table" then
  fail("enroll response is malformed")
  return
end

local role = enrolled.role
local config = nil

-- Save the identity now, so a failed or aborted install reuses the same id and
-- pairing code instead of creating a second pending machine.
writeFile(ID_PATH, jsonEncode({
  id = id,
  secret = secret,
  role = role or "unassigned",
  serverUrl = url,
  createdAt = identity.createdAt or os.epoch("utc"),
  enrolledAt = os.epoch("utc"),
}))

if enrolled.status == "pending" then
  local code = tostring(enrolled.code or "")
  banner(code)
  print("Waiting for approval (Ctrl+T to abort)...")

  local deadline = os.epoch("utc") + APPROVAL_TIMEOUT
  while os.epoch("utc") < deadline do
    local body = get(url .. "/api/enroll/status", {
      ["X-Agent-Id"] = id,
      ["X-Agent-Secret"] = secret,
    })
    if body then
      local data = jsonDecode(body)
      if type(data) == "table" and data.status == "active" then
        role = data.role
        config = data.config
        break
      end
    end
    term.write(".")
    os.sleep(2)
  end

  if not role then
    print("")
    fail("timed out waiting for approval; run the installer again")
    return
  end
  print("")
else
  print("already approved as " .. tostring(role or "unassigned"))
end

-- Install --------------------------------------------------------------------

local function installRuntime()
  local manifestBody, err = get(BASE .. "/runtime.json")
  if not manifestBody then return nil, "could not read runtime.json: " .. tostring(err) end

  local manifest = jsonDecode(manifestBody)
  if type(manifest) ~= "table" or type(manifest.files) ~= "table" then
    return nil, "runtime.json is malformed"
  end
  if type(manifest.tag) ~= "string" or type(manifest.version) ~= "string" then
    return nil, "runtime.json is missing tag or version"
  end

  if fs.exists(STAGING) then fs.delete(STAGING) end
  ensureDir(STAGING)

  local assetBase = ("https://github.com/%s/releases/download/%s"):format(REPO, manifest.tag)
  print("downloading " .. manifest.version .. " (" .. #manifest.files .. " files)")

  for _, file in ipairs(manifest.files) do
    if type(file.path) == "string" and type(file.asset) == "string" then
      local body, ferr = get(assetBase .. "/" .. file.asset)
      if not body then
        return nil, ("download failed for %s: %s"):format(file.asset, tostring(ferr))
      end
      if file.size and #body ~= file.size then
        return nil, ("size mismatch for %s: got %d, expected %d"):format(
          file.path, #body, file.size
        )
      end
      local ok, werr = writeFile(STAGING .. "/" .. file.path, body)
      if not ok then return nil, werr end
      term.write(".")
    end
  end
  term.write("\n")

  if fs.exists(PREV) then fs.delete(PREV) end
  if fs.exists(CURRENT) then
    if fs.exists(VERSION_PATH) then fs.copy(VERSION_PATH, PREV_VERSION_PATH) end
    fs.move(CURRENT, PREV)
  end
  fs.move(STAGING, CURRENT)
  writeFile(VERSION_PATH, manifest.version .. "\n")

  -- boot.lua is installed outside current/ so an update cannot break booting.
  local boot = readFile(CURRENT .. "/boot.lua")
  if boot then writeFile(DEST .. "/boot.lua", boot) end

  return manifest.version
end

local version, installErr = installRuntime()
if not version then
  fail(installErr)
  return
end

writeFile(ID_PATH, jsonEncode({
  id = id,
  secret = secret,
  role = role or "unassigned",
  serverUrl = url,
  createdAt = identity.createdAt or os.epoch("utc"),
  installedAt = os.epoch("utc"),
}))

writeFile(CONFIG_PATH, jsonEncode(config or {}))

-- Startup --------------------------------------------------------------------

if fs.exists("/startup.lua") then
  local old = readFile("/startup.lua") or ""
  if not old:find("tethys", 1, true) and not fs.exists("/startup.lua.bak") then
    fs.copy("/startup.lua", "/startup.lua.bak")
    print("backed up the existing startup.lua")
  end
end

writeFile("/startup.lua", "-- tethys managed startup\nshell.run(\"/tethys/boot.lua\")\n")

print("")
print("installed " .. version .. " for role " .. tostring(role or "unassigned"))
print("rebooting in 3 seconds...")
os.sleep(3)
os.reboot()
