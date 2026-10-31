-- Role supervisor. Dispatches to a role module based on bus.role.
-- Roles are folders under agents/<role>/, not branches.
local util = require("lib.util")
local hal = require("lib.hal")

local M = {}

local function inventory()
  return hal.inventory()
end

function M.run(identity, bus)
  bus.status = function()
    local status = {
      state = bus.state or "idle",
      pose = bus.pose,
    }
    if hal then
      status.fuel = hal.fuel()
      status.inventory = hal.inventory()
    end
    return status
  end

  util.log("supervisor: role", tostring(bus.role or identity.role or "unassigned"))

  while true do
    local role = bus.role or identity.role or "unassigned"
    if role == "unassigned" then
      bus.state = "unassigned"
      os.sleep(0.25)

    elseif role == "mining" then
      local spec = bus.spec
      if spec then
        bus.state = "mining"
        local result, err = require("mining.miner").run(bus)
        util.log("supervisor: mining", result or "stopped", err or "")

        local status = "failed"
        if result == "done" then status = "done"
        elseif result == "paused" then status = "paused" end

        sendResult(bus, spec, status, err)

        -- Clear the local mission so a reboot does not revive a finished job.
        local snap = require("lib.journal").load(hal.fuel)
        if snap and snap.mission and snap.mission.id == spec.id then
          snap.mission = nil
          snap.tripActive = false
          snap.tape = {}
          require("lib.journal").save(snap)
        end

        bus.spec = nil
        bus.jobId = nil
        bus.abort = false
        bus.returnHome = false
        if status == "paused" then
          bus.blocked = true
          bus.state = "paused"
        elseif status == "done" then
          bus.blocked = false
          bus.state = "idle"
        else
          bus.blocked = true
          bus.state = "halted"
        end
      else
        os.sleep(0.25)
      end

    else
      bus.state = "idle"
      os.sleep(0.25)
    end
  end
end

--- Send a job result to the server (best effort, may be offline).
function sendResult(bus, spec, status, err)
  if bus.send then
    bus.send({
      type = "result",
      id = bus.jobId,
      missionId = spec.id,
      status = status,
      error = err,
      stats = bus.stats,
      progress = bus.progress,
    })
  end
end

return M

