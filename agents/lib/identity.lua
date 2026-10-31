-- Machine identity, written once by the installer and reused on reinstall.
local util = require("lib.util")

local M = {}
M.PATH = "/tethys/identity.json"

function M.load()
  local data = util.readJson(M.PATH)
  if type(data) ~= "table" then return nil end
  if type(data.id) ~= "string" or type(data.secret) ~= "string" then return nil end
  return data
end

function M.save(data)
  data.updatedAt = util.now()
  return util.writeJson(M.PATH, data)
end

return M
