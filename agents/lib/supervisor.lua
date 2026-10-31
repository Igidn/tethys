-- Role supervisor. Phase 1 only parks and reports status; role runtimes are
-- added under agents/<role>/ and dispatched from here.
local util = require("lib.util")

local M = {}

local function inventory()
  if not turtle then return nil end
  local items = {}
  for slot = 1, 16 do
    local count = turtle.getItemCount(slot)
    if count and count > 0 then
      local detail = turtle.getItemDetail(slot)
      items[#items + 1] = {
        slot = slot,
        count = count,
        name = detail and detail.name or "unknown",
      }
    end
  end
  return items
end

function M.run(identity, bus)
  bus.status = function()
    local status = {
      state = bus.state or "idle",
      pose = bus.pose,
    }
    if turtle then
      status.fuel = turtle.getFuelLevel()
      status.inventory = inventory()
    end
    return status
  end

  util.log("supervisor: role", tostring(bus.role or identity.role or "unassigned"))

  while true do
    local role = bus.role or identity.role or "unassigned"
    if role == "unassigned" then
      bus.state = "unassigned"
    else
      -- Phase 3 replaces this with the mining runtime.
      bus.state = "idle"
    end
    os.sleep(0.5)
  end
end

return M
