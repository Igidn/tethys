-- Tethys runtime entry point. Runs the link and the supervisor side by side and
-- never exits to the shell: a machine at a prompt has stopped working.
package.path = "/tethys/current/?.lua;/tethys/current/?/init.lua;" .. package.path

local util = require("lib.util")
local identity = require("lib.identity")

local id = identity.load()
if not id then
  print("Tethys is not installed on this computer.")
  print("Run the installer from the live release.")
  return
end

util.log("tethys", util.version(), "id", id.id, "role", tostring(id.role or "unassigned"))

while true do
  local bus = {
    connected = false,
    agentId = id.id,
    role = id.role or "unassigned",
    serverUrl = id.serverUrl,
    state = "starting",
  }

  local ok, err = pcall(function()
    parallel.waitForAll(
      function() require("lib.link").run(id, bus) end,
      function() require("lib.supervisor").run(id, bus) end
    )
  end)

  util.log("runtime stopped:", tostring(err or "no error"))
  os.sleep(5)
end
