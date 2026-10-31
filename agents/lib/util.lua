-- Shared helpers. Everything here must work on CC: Tweaked's Lua 5.1.
local M = {}

function M.ensureDir(path)
  local current = ""
  for part in path:gmatch("[^/]+") do
    current = current .. "/" .. part
    if not fs.exists(current) then fs.makeDir(current) end
  end
end

function M.readFile(path)
  if not fs.exists(path) then return nil end
  local handle = fs.open(path, "rb")
  if not handle then return nil end
  local data = handle.readAll()
  handle.close()
  return data
end

function M.writeFile(path, data)
  local dir = path:match("^(.*)/[^/]+$")
  if dir then M.ensureDir(dir) end
  local handle = fs.open(path, "wb")
  if not handle then return nil, "cannot write " .. path end
  handle.write(data)
  handle.close()
  return true
end

function M.writeAtomic(path, data)
  local tmp = path .. ".tmp"
  local ok, err = M.writeFile(tmp, data)
  if not ok then return nil, err end
  if fs.exists(path) then fs.delete(path) end
  fs.move(tmp, path)
  return true
end

function M.version()
  local text = M.readFile("/tethys/version")
  if not text then return "0.0.0" end
  return (text:gsub("%s+$", ""))
end

function M.now()
  return os.epoch("utc")
end

function M.log(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring(select(i, ...)) end
  local stamp = os.date("%H:%M:%S")
  print(("[%s] %s"):format(stamp, table.concat(parts, " ")))
end

function M.jsonEncode(value)
  if not textutils or not textutils.serializeJSON then return nil end
  local ok, out = pcall(textutils.serializeJSON, value)
  if ok then return out end
  return nil
end

function M.jsonDecode(text)
  if type(text) ~= "string" then return nil end
  if not textutils or not textutils.unserializeJSON then return nil end
  local ok, value = pcall(textutils.unserializeJSON, text)
  if ok then return value end
  return nil
end

function M.readJson(path)
  local text = M.readFile(path)
  if not text then return nil end
  return M.jsonDecode(text)
end

function M.writeJson(path, value)
  return M.writeAtomic(path, M.jsonEncode(value))
end

return M
