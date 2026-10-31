-- Deterministic 3D serpentine plan, base-relative.
--
-- The base is the dock cell. The first leg descends straight down the dock's
-- shaft to startY, then walks to the sector's first row. Each layer walks a
-- serpentine over the sector; every layer drops `layerStep` at the end.
--
-- The executor only needs (leg, offset) to resume, and the same spec always
-- produces the same legs, which is what the shared vectors pin down.
local M = {}

local function addLine(legs, dir, length, layer, strip)
  if length > 0 then
    legs[#legs + 1] = {
      kind = "line",
      dir = dir,
      length = length,
      layer = layer,
      strip = strip,
    }
  end
end

function M.build(spec)
  local sector = spec.sector or {}
  local x0 = sector.x0 or 0
  local x1 = sector.x1 or 0
  local z0 = sector.z0 or 0
  local z1 = sector.z1 or 0
  local legs = {}

  -- The shaft is the dock column: straight down, no staging cell.
  if spec.startY < 0 then
    legs[#legs + 1] = {
      kind = "down",
      dir = 0,
      length = -spec.startY,
      layer = 0,
      strip = 0,
    }
  end

  if x0 < 0 then
    addLine(legs, 3, -x0, 0, 0) -- west
  elseif x0 > 0 then
    addLine(legs, 1, x0, 0, 0) -- east
  end
  if z0 < 0 then
    addLine(legs, 0, -z0, 0, 0) -- north
  elseif z0 > 0 then
    addLine(legs, 2, z0, 0, 0) -- south
  end

  local width = x1 - x0
  local strips = math.floor((z1 - z0) / spec.spacing) + 1
  local y = spec.startY
  local layer = 0
  local zDir = 1
  local xDir = 1 -- east; flips every strip

  while y >= spec.endY do
    for strip = 0, strips - 1 do
      addLine(legs, xDir, width, layer, strip)
      xDir = (xDir == 1) and 3 or 1
      if strip < strips - 1 then
        addLine(legs, zDir == 1 and 2 or 0, spec.spacing, layer, strip)
      end
    end

    if y - spec.layerStep < spec.endY then break end
    legs[#legs + 1] = {
      kind = "down",
      dir = 0,
      length = spec.layerStep,
      layer = layer,
      strip = strips - 1,
    }
    y = y - spec.layerStep
    zDir = -zDir
    layer = layer + 1
  end

  return legs
end

function M.total(legs)
  local sum = 0
  for i = 1, #legs do sum = sum + legs[i].length end
  return sum
end

function M.blocksBefore(legs, legIndex)
  local sum = 0
  for i = 1, math.min(legIndex - 1, #legs) do sum = sum + legs[i].length end
  return sum
end

function M.progressPercent(legs, progress)
  local total = M.total(legs)
  if total == 0 then return 100 end
  local done = M.blocksBefore(legs, progress.leg) + math.max(0, progress.offset)
  return math.min(100, math.floor((done / total) * 1000 + 0.5) / 10)
end

function M.copyProgress(p)
  return {
    leg = p.leg or 1,
    offset = p.offset or 0,
    layer = p.layer or 0,
    strip = p.strip or 0,
  }
end

-- Advance past complete legs. Returns true when the whole plan is complete.
function M.normalize(legs, progress)
  while progress.leg <= #legs do
    local leg = legs[progress.leg]
    if progress.offset < leg.length then
      progress.layer = leg.layer
      progress.strip = leg.strip
      return false
    end
    progress.leg = progress.leg + 1
    progress.offset = 0
  end
  return true
end

function M.complete(legs, progress)
  return progress.leg > #legs
end

function M.validate(spec, hard)
  hard = hard or {}
  if type(spec) ~= "table" then return nil, "missing mission spec" end
  if spec.kind ~= "branchMine" then return nil, "unknown mission kind" end
  if type(spec.sector) ~= "table" then return nil, "missing sector" end
  if type(spec.startY) ~= "number" or type(spec.endY) ~= "number" then
    return nil, "missing Y range"
  end
  if spec.startY > 0 then return nil, "startY must be <= 0 (base is y=0)" end
  if spec.endY > spec.startY then return nil, "endY must be at or below startY" end
  if -spec.endY > (hard.maxDepth or 200) then
    return nil, "depth exceeds local cap"
  end
  local width = (spec.sector.x1 or 0) - (spec.sector.x0 or 0)
  local depth = (spec.sector.z1 or 0) - (spec.sector.z0 or 0)
  if width < 1 or depth < 1 then return nil, "sector is empty" end
  if width > (hard.maxWidth or 256) or depth > (hard.maxWidth or 256) then
    return nil, "sector exceeds local cap"
  end
  if type(spec.layerStep) ~= "number" or spec.layerStep < 1 then
    return nil, "layerStep must be >= 1"
  end
  if type(spec.spacing) ~= "number" or spec.spacing < 2 then
    return nil, "spacing must be >= 2"
  end
  if type(spec.maxTripBlocks) ~= "number" or spec.maxTripBlocks < 1 then
    return nil, "maxTripBlocks must be >= 1"
  end
  if type(spec.maxVeinBlocks) ~= "number" or spec.maxVeinBlocks < 0 then
    return nil, "maxVeinBlocks must be >= 0"
  end
  if type(spec.reserve) ~= "number" or spec.reserve < 0 then
    return nil, "reserve must be >= 0"
  end
  return true
end

return M
