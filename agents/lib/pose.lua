-- Station-local pose. Facing: 0 = north (-Z), 1 = east (+X),
-- 2 = south (+Z), 3 = west (-X). Pure arithmetic, so the simulator can test
-- movement without the turtle API.
local M = {}

local DX = { [0] = 0, 1, 0, -1 }
local DZ = { [0] = -1, 0, 1, 0 }

local INVERSE = {
  forward = "back",
  back = "forward",
  up = "down",
  down = "up",
  turnLeft = "turnRight",
  turnRight = "turnLeft",
}

function M.new(x, y, z, f)
  return { x = x or 0, y = y or 0, z = z or 0, f = f or 0 }
end

function M.copy(p)
  return { x = p.x, y = p.y, z = p.z, f = p.f }
end

function M.dx(f) return DX[f] end
function M.dz(f) return DZ[f] end

function M.vec(f)
  return DX[f], DZ[f]
end

function M.apply(p, op)
  if op == "forward" then
    p.x = p.x + DX[p.f]
    p.z = p.z + DZ[p.f]
  elseif op == "back" then
    p.x = p.x - DX[p.f]
    p.z = p.z - DZ[p.f]
  elseif op == "up" then
    p.y = p.y + 1
  elseif op == "down" then
    p.y = p.y - 1
  elseif op == "turnLeft" then
    p.f = (p.f + 3) % 4
  elseif op == "turnRight" then
    p.f = (p.f + 1) % 4
  else
    error("unknown pose op: " .. tostring(op))
  end
  return p
end

function M.inverse(op)
  return INVERSE[op]
end

function M.isTranslation(op)
  return op == "forward" or op == "back" or op == "up" or op == "down"
end

-- Absolute facing that points from (0,0) toward (dx,dz).
function M.facingTo(dx, dz)
  if dx == 1 and dz == 0 then return 1 end
  if dx == -1 and dz == 0 then return 3 end
  if dx == 0 and dz == 1 then return 2 end
  if dx == 0 and dz == -1 then return 0 end
  return nil
end

-- Turn operations needed to reach facing f. Returns a list, usually 0-2 ops.
function M.turnOps(from, to)
  local diff = (to - from) % 4
  if diff == 0 then return {} end
  if diff == 1 then return { "turnRight" } end
  if diff == 2 then return { "turnRight", "turnRight" } end
  return { "turnLeft" }
end

function M.key(p)
  return ("%d,%d,%d"):format(p.x, p.y, p.z)
end

return M
