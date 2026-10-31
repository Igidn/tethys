-- Fuel invariant.
--
-- The trip tape records every translation on the way out, so
-- `tape.translations` is the exact fuel needed to get back to the dock. A new
-- translation must leave enough fuel for a longer tape; a retrace may spend
-- down to the reserve.
local M = {}

function M.available(fuel)
  if fuel == "unlimited" then return math.huge end
  if type(fuel) ~= "number" then return nil end
  return fuel
end

function M.canAfford(fuel, tape, reserve, delta, spend)
  local value = M.available(fuel)
  if value == nil then return false end
  if value == math.huge then return true end
  return (value - spend) >= (tape.translations + delta + reserve)
end

-- Move forward/back/up/down: costs one fuel and adds one translation.
function M.canStep(fuel, tape, reserve)
  return M.canAfford(fuel, tape, reserve, 1, 1)
end

-- Retrace: costs one fuel and removes one translation.
function M.canRetrace(fuel, tape, reserve)
  return M.canAfford(fuel, tape, reserve, -1, 1)
end

-- Turn: free, tape unchanged.
function M.canTurn(fuel, tape, reserve)
  return M.canAfford(fuel, tape, reserve, 0, 0)
end

-- Low enough that the trip should end before the next block.
function M.shouldEndTrip(fuel, tape, reserve, margin)
  local value = M.available(fuel)
  if value == nil then return true end
  if value == math.huge then return false end
  return (value - tape.translations - reserve) <= (margin or 4)
end

return M
