-- Trip executor for the mining role.
--
-- Each turtle is assigned one lane within a sector. It starts at its surface
-- station, walks to its lane's descent point, digs down to the mining level,
-- mines serpentine within its lane, then returns to the station to refuel
-- and deposit. Every turtle descends at its own X so no two turtles share a
-- shaft column -- no shaft lock, no cross-turtle coordination needed.
--
-- Station layout (turtle at base, facing north / -Z):
--   front  (north, -Z): fuel chest   (lava buckets; empty bucket dropped back)
--   back   (south, +Z): depot chest  (all mined inventory dropped here)
--
-- Each trip:
--   1. Walk on surface from station base to the lane's descent X
--   2. Descend at the lane's descent point to startY (on the trip tape)
--   3. Replay the mining plan to the frontier (on the tape)
--   4. Mine up to maxTripBlocks blocks, with bounded ore detours (on the tape)
--   5. Retrace the full trip tape all the way back to the surface station
--   6. Refuel at the fuel chest, deposit at the depot chest
--   7. Repeat until the plan is complete
--
-- Fuel: a trip needs |startY| (down) + blocks mined + |startY| (up) +
-- station moves. The reserve covers the full round trip so the turtle never
-- strands itself underground.

local util = require("lib.util")
local pose = require("lib.pose")
local tape = require("lib.tape")
local plan = require("lib.plan")
local hal = require("lib.hal")
local nav = require("lib.nav")
local journal = require("lib.journal")
local safety = require("lib.safety")

local M = {}

local HARD = {
  maxDepth = 2000,
  maxWidth = 1024,
}
local SAVE_EVERY = 8

local function send(bus, msg)
  if bus.send then bus.send(msg) end
end

local function progressMsg(bus, snap, trip, stateName)
  if bus then
    bus.pose = trip and trip.pose or snap.pose
    bus.progress = snap.progress
    bus.stats = snap.stats
    bus.state = stateName or "mining"
  end
  send(bus, {
    type = "progress",
    pose = trip and trip.pose or snap.pose,
    fuel = hal.fuel(),
    inventory = hal.inventory(),
    state = stateName or "mining",
    stats = snap.stats,
    progress = snap.progress,
  })
end

local function saveSnap(snap, mission, trip, active)
  snap.mission = { id = mission.id, spec = mission.spec }
  snap.tripActive = active and true or false
  if trip then
    snap.pose = trip.pose
    snap.tape = trip.tape
  end
  return journal.save(snap)
end

-- Suck fuel items from the chest directly in front of the turtle.
local function suckFuel()
  local total = 0
  for _ = 1, 16 do
    if not hal.suck() then break end
    total = total + 1
  end
  return total
end

-- Drop every inventory stack into the chest directly behind the turtle.
local function depositInventory()
  local dropped = 0
  local previous = hal.selectedSlot()
  for slot = 1, 16 do
    local item = hal.itemDetail(slot)
    if item then
      hal.select(slot)
      if hal.drop() then dropped = dropped + 1 end
    end
  end
  hal.select(previous)
  return dropped
end

-- Refuel from inventory. Lava buckets give 1000 fuel each; empty buckets
-- are dropped back into the fuel chest.
local function refuelFromInventory()
  local previous = hal.selectedSlot()
  local refueled = false
  for slot = 1, 16 do
    local item = hal.itemDetail(slot)
    if item and hal.isFuel(item.name) then
      if hal.select(slot) then
        local ok, err = hal.refuel()
        if ok then
          refueled = true
          hal.drop() -- drop empty bucket back into fuel chest
        end
      end
    end
  end
  hal.select(previous)
  return refueled
end

--- Service at the station: face fuel chest (front), suck + refuel + drop
-- bucket, then face depot chest (back) and deposit all inventory.
local function stationService(trip, base)
  local f = base.f
  local ok, err = nav.face(trip, f)
  if not ok then return nil, "face fuel: " .. tostring(err) end
  suckFuel()
  refuelFromInventory()

  local back = (f + 2) % 4
  ok, err = nav.face(trip, back)
  if not ok then return nil, "face depot: " .. tostring(err) end
  local dropped = depositInventory()
  if dropped > 0 then
    util.log("miner: deposited", dropped, "stacks at depot")
  end

  nav.face(trip, f)
  return true
end

--- Compute this turtle's lane sector within the overall sector.
-- Lanes split the X range; all lanes share the same Z range.
-- Returns world coordinates of the lane's descent point and a sector relative
-- to that descent point (for the plan).
local function laneInfo(spec)
  local sector = spec.sector
  local lane = tonumber(spec.lane) or 0
  local laneCount = tonumber(spec.laneCount) or 1
  if laneCount < 1 then laneCount = 1 end
  if lane < 0 then lane = 0 end
  if lane >= laneCount then lane = laneCount - 1 end

  local width = sector.x1 - sector.x0
  local laneWidth = math.floor(width / laneCount)
  local x0 = sector.x0 + lane * laneWidth
  local x1 = lane == laneCount - 1 and sector.x1 or (x0 + laneWidth)
  if x1 < x0 + 1 then x1 = x0 + 1 end

  -- Sector relative to the descent point (x0, z0) for the plan.
  local relSector = {
    x0 = 0,
    x1 = x1 - x0,
    z0 = 0,
    z1 = sector.z1 - sector.z0,
  }

  return {
    descentX = x0,
    descentZ = sector.z0,
    sector = relSector,
    laneWidth = laneWidth,
  }
end

--- Build a mining-only plan (no descent leg) at the mining depth.
-- The plan starts at (0,0,0) = the bottom of the descent shaft.
local function miningPlan(spec, info)
  local miningSpec = {
    kind = spec.kind,
    sector = info.sector,
    startY = 0,
    endY = spec.endY - spec.startY, -- negative depth relative to mining level
    layerStep = spec.layerStep,
    spacing = spec.spacing,
    maxTripBlocks = spec.maxTripBlocks,
    maxVeinBlocks = spec.maxVeinBlocks,
    reserve = spec.reserve,
    base = { x = 0, y = 0, z = 0, f = 0 },
  }
  return plan.build(miningSpec)
end

--- Walk on the surface from station base to the lane's descent X, then dig
-- down to the mining level. Every step goes on the trip tape so retrace can
-- bring the turtle all the way back.
local function descend(trip, spec, info, base, bus)
  local down = spec.startY < 0 and -spec.startY or 0
  if down == 0 then return true end

  -- Walk on the surface from station base to the lane's descent X. Each lane
  -- descends at its own X so turtles never share a shaft column.
  local dx = info.descentX - base.x
  if dx ~= 0 then
    local faceDir = dx > 0 and 1 or 3 -- east or west
    local ok, err = nav.face(trip, faceDir)
    if not ok then return nil, "face lane: " .. tostring(err) end
    for _ = 1, math.abs(dx) do
      if bus.abort then return nil, "stopped" end
      local sok, serr = nav.step(trip, "forward")
      if not sok then return nil, "walk to lane: " .. tostring(serr) end
    end
  end

  -- Dig down to startY at the lane's descent X.
  for i = 1, down do
    if bus.abort then return nil, "stopped" end
    local data = hal.inspectDown()
    if data and safety.hazard(data) then
      return nil, ("lava at Y%d"):format(trip.pose.y - 1)
    end
    if data and not safety.passable(data) then
      local dok, derr = hal.digDown()
      if not dok then
        return nil, ("shaft blocked at Y%d: %s"):format(trip.pose.y - 1, tostring(derr))
      end
    end
    local mok, merr = nav.down(trip, 1)
    if not mok then
      return nil, ("descent failed at Y%d: %s"):format(trip.pose.y, tostring(merr))
    end
    if i % 64 == 0 then
      util.log("miner: descended", i, "of", down)
    end
  end
  return true
end

--- Replay the mining plan from the start to the frontier (progress point).
-- Completed legs are re-walked without mining. Returns true on success.
local function travelTo(trip, legs, progress, bus)
  local dummy = { ores = 0 }
  for i = 1, progress.leg - 1 do
    local leg = legs[i]
    local ok, err = executeLeg(trip, leg, leg.length, false, bus, dummy)
    if not ok then return nil, err end
  end
  if progress.leg <= #legs then
    local leg = legs[progress.leg]
    local ok, err = executeLeg(trip, leg, progress.offset, false, bus, dummy)
    if not ok then return nil, err end
  end
  return true
end

--- Execute a plan leg: move `count` steps in `dir` (or down for "down" legs).
local function executeLeg(trip, leg, count, mining, bus, stats)
  if count <= 0 then return true end
  if leg.kind == "down" then
    for _ = 1, count do
      if bus.abort then return nil, "stopped" end
      local ok, err = moveDownOne(trip, mining, bus, stats)
      if not ok then return nil, err end
    end
  else
    local ok, err = nav.face(trip, leg.dir)
    if not ok then return nil, err end
    for _ = 1, count do
      if bus.abort then return nil, "stopped" end
      ok, err = moveOne(trip, mining, bus, stats)
      if not ok then return nil, err end
    end
  end
  return true
end

--- Mine within the lane up to the budget. Returns blocks mined or nil, err.
local function mineTrip(trip, legs, progress, spec, snap, budget, bus)
  local mined = 0
  local sinceSave = 0

  while mined < budget do
    if bus.abort then return nil, "aborted" end
    if nav.shouldEnd(trip, 8) then break end
    if mined % 4 == 0 and hal.usedSlots() >= 15 then break end
    if plan.normalize(legs, progress) then break end

    local leg = legs[progress.leg]
    local ok, err
    if leg.kind == "down" then
      ok, err = moveDownOne(trip, true, bus, snap.stats)
    else
      ok, err = nav.face(trip, leg.dir)
      if ok then ok, err = moveOne(trip, true, bus, snap.stats) end
    end
    if not ok then return nil, err end

    progress.offset = progress.offset + 1
    mined = mined + 1
    snap.stats.blocks = snap.stats.blocks + 1
    bus.progress = progress
    bus.pose = trip.pose
    bus.stats = snap.stats
    progressMsg(bus, snap, trip, "mining")

    local sok, serr = scanVeins(trip, spec, snap.stats, bus)
    if not sok then return nil, serr end

    sinceSave = sinceSave + 1
    if sinceSave >= SAVE_EVERY then
      saveSnap(snap, { id = spec.id, spec = spec }, trip, true)
      progressMsg(bus, snap, trip, "mining")
      sinceSave = 0
    end
  end

  return mined
end

local function moveOne(trip, mining, bus, stats)
  local data = hal.inspect()
  if safety.hazard(data) then return nil, "lava ahead" end
  local wasOre = mining and hal.ore(data)
  local oreName = wasOre and data.name or nil
  if not safety.passable(data) then
    local ok, err = hal.dig()
    if not ok then return nil, "dig failed: " .. tostring(err) end
  end
  local ok, err = nav.step(trip, "forward")
  if not ok then return nil, err end
  if wasOre then
    stats.ores = stats.ores + 1
    send(bus, {
      type = "event",
      kind = "ore",
      data = { x = trip.pose.x, y = trip.pose.y, z = trip.pose.z, name = oreName },
    })
  end
  return true
end

local function moveDownOne(trip, mining, bus, stats)
  local data = hal.inspectDown()
  if safety.hazard(data) then return nil, "lava below" end
  local wasOre = mining and hal.ore(data)
  local oreName = wasOre and data.name or nil
  if not safety.passable(data) then
    local ok, err = hal.digDown()
    if not ok then return nil, "digDown failed: " .. tostring(err) end
  end
  local ok, err = nav.down(trip, 1)
  if not ok then return nil, err end
  if wasOre then
    stats.ores = stats.ores + 1
    send(bus, {
      type = "event",
      kind = "ore",
      data = { x = trip.pose.x, y = trip.pose.y, z = trip.pose.z, name = oreName },
    })
  end
  return true
end

--- Depth-first bounded vein mining. Returns to entry cell after each branch.
local function veinMine(trip, dir, ctx, spec, stats, bus)
  if bus.abort then return nil, "stopped" end
  if ctx.count >= spec.maxVeinBlocks then return true end

  local x, y, z = targetPose(trip, dir)
  local key = ("%d,%d,%d"):format(x, y, z)
  if ctx.visited[key] then return true end

  local data = inspectDir(trip, dir)
  if not hal.ore(data) then return true end
  if nav.shouldEnd(trip, 8) then return nil, "fuel reserve" end

  ctx.visited[key] = true
  ctx.count = ctx.count + 1
  local entry = tape.length(trip.tape)

  local ok, err = moveInto(trip, dir)
  if not ok then
    if err == "fuel reserve" then return nil, err end
    local rok, rerr = nav.retraceTo(trip, entry)
    if not rok then return nil, rerr end
    return true
  end

  stats.ores = stats.ores + 1
  send(bus, {
    type = "event",
    kind = "ore",
    data = { x = trip.pose.x, y = trip.pose.y, z = trip.pose.z, name = data.name },
  })

  local dirs = { 0, 1, 2, 3, "up", "down" }
  for i = 1, #dirs do
    local sok, serr = veinMine(trip, dirs[i], ctx, spec, stats, bus)
    if not sok then return nil, serr end
    local rok, rerr = nav.retraceTo(trip, entry)
    if not rok then return nil, rerr end
  end
  return true
end

local function scanVeins(trip, spec, stats, bus)
  if spec.maxVeinBlocks <= 0 then return true end
  local base = tape.length(trip.tape)
  local ctx = { visited = {}, count = 0 }
  local dirs = { 0, 1, 2, 3, "up", "down" }
  for i = 1, #dirs do
    local ok, err = veinMine(trip, dirs[i], ctx, spec, stats, bus)
    if not ok then return nil, err end
    local rok, rerr = nav.retraceTo(trip, base)
    if not rok then return nil, rerr end
  end
  return true
end

local function inspectDir(trip, dir)
  if dir == "up" then return hal.inspectUp() end
  if dir == "down" then return hal.inspectDown() end
  local original = trip.pose.f
  local ok = nav.face(trip, dir)
  if not ok then return nil end
  local data = hal.inspect()
  nav.face(trip, original)
  return data
end

local function targetPose(trip, dir)
  if dir == "up" then return trip.pose.x, trip.pose.y + 1, trip.pose.z end
  if dir == "down" then return trip.pose.x, trip.pose.y - 1, trip.pose.z end
  local dx, dz = pose.vec(dir)
  return trip.pose.x + dx, trip.pose.y, trip.pose.z + dz
end

local function moveInto(trip, dir)
  if dir == "up" then
    local ok, err = hal.digUp()
    if not ok then return nil, err or "digUp failed" end
    return nav.up(trip, 1)
  elseif dir == "down" then
    local ok, err = hal.digDown()
    if not ok then return nil, err or "digDown failed" end
    return nav.down(trip, 1)
  else
    local ok, err = nav.face(trip, dir)
    if not ok then return nil, err end
    ok, err = hal.dig()
    if not ok then return nil, err or "dig failed" end
    return nav.step(trip, "forward")
  end
end

--- Retrace the full trip tape back to the surface station.
local function retraceTrip(trip, bus)
  while tape.length(trip.tape) > 0 do
    if bus.abort then return nil, "aborted" end
    local ok, err = nav.retraceOne(trip)
    if not ok then return nil, err end
  end
  return true
end

--- Recover an interrupted trip after a reboot: retrace the tape to the dock.
local function recover(snap, bus)
  if not snap.tripActive then return true end
  if tape.length(snap.tape) > 0 then
    util.log("miner: recovering interrupted trip,", tape.length(snap.tape), "ops")
    local trip = nav.new(hal, snap.tape, snap.reserve or 0, snap.pose)
    local ok, err = nav.retraceAll(trip)
    if not ok then
      send(bus, { type = "event", kind = "recovery_failed", data = { error = err } })
      return nil, "recovery failed: " .. tostring(err)
    end
    snap.pose = pose.copy(trip.pose)
  end
  snap.tripActive = false
  snap.tape = tape.new()
  if bus then
    bus.pose = snap.pose
    bus.progress = snap.progress
    bus.stats = snap.stats
  end
  journal.save(snap)
  return true
end

--- @return "done"|"paused"|nil, error
function M.run(bus)
  local spec = bus.spec
  if not spec then return nil, "no mining spec" end

  local valid, verr = plan.validate(spec, HARD)
  if not valid then return nil, "invalid mission spec: " .. tostring(verr) end

  spec.maxTripBlocks = math.min(spec.maxTripBlocks, 2000)
  spec.maxVeinBlocks = math.min(spec.maxVeinBlocks, 64)
  spec.reserve = math.max(spec.reserve or 0, 64)

  local info = laneInfo(spec)
  local legs = miningPlan(spec, info)
  if #legs == 0 then return nil, "empty plan" end

  local base = spec.base or { x = 0, y = 0, z = 0, f = 0 }

  -- Fuel needed for a full round trip: down + up + station moves + margin.
  local roundTripFuel = (base.y - spec.startY) * 2 + 64
  local tripReserve = math.max(spec.reserve, roundTripFuel)

  local snap = journal.load(hal.fuel)
  if not snap then
    snap = {
      progress = plan.copyProgress({ leg = 1, offset = 0, layer = 0, strip = 0 }),
      stats = { blocks = 0, ores = 0, trips = 0 },
      tripActive = false,
      pose = pose.copy(base),
      tape = tape.new(),
      reserve = tripReserve,
    }
    journal.resetJournal()
    saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
  elseif snap.mission and snap.mission.id == spec.id then
    spec.id = spec.id or snap.mission.id
  else
    snap.mission = { id = spec.id, spec = spec }
    snap.progress = plan.copyProgress({ leg = 1, offset = 0, layer = 0, strip = 0 })
    snap.stats = { blocks = 0, ores = 0, trips = 0 }
    snap.tripActive = false
    snap.pose = pose.copy(base)
    snap.tape = tape.new()
    snap.reserve = tripReserve
    journal.resetJournal()
    saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
  end

  snap.paused = false
  snap.halted = false
  saveSnap(snap, { id = spec.id, spec = spec }, nil, snap.tripActive and true or false)

  local rok, rerr = recover(snap, bus)
  if not rok then return nil, rerr end

  if bus then
    bus.pose = snap.pose
    bus.progress = snap.progress
    bus.stats = snap.stats
  end

  progressMsg(bus, snap, nil, "idle")

  while true do
    if bus.abort then
      snap.halted = true
      saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
      return nil, "aborted"
    end
    if bus.returnHome then
      snap.paused = true
      saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
      return "paused"
    end

    -- Start a new trip at the station.
    local trip = nav.new(hal, tape.new(), tripReserve, pose.copy(base))
    snap.tripActive = true
    snap.pose = trip.pose
    snap.tape = trip.tape
    saveSnap(snap, { id = spec.id, spec = spec }, trip, true)

    -- Service at station: refuel and deposit before leaving.
    stationService(trip, base)

    -- Check fuel for the round trip.
    local fuel = hal.fuel()
    if type(fuel) == "number" and fuel < tripReserve then
      util.log("miner: insufficient fuel for round trip: need", tripReserve, "have", fuel)
      snap.tripActive = false
      saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
      return nil, "insufficient fuel for round trip"
    end

    -- Walk to lane descent X and descend to the mining level (on the tape).
    local dok, derr = descend(trip, spec, info, base, bus)
    if not dok then
      util.log("miner: descent failed:", derr or "unknown")
      local retOK, retErr = retraceTrip(trip, bus)
      snap.tripActive = false
      snap.tape = tape.new()
      snap.pose = pose.copy(trip.pose)
      saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
      if bus.abort then
        snap.halted = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return nil, "aborted"
      end
      if bus.returnHome then
        snap.paused = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return "paused"
      end
      return nil, "descent failed: " .. tostring(derr)
    end

    -- Travel to the frontier: replay the plan to the progress point (on the tape).
    local tok, terr = travelTo(trip, legs, snap.progress, bus)
    if not tok then
      util.log("miner: travel to frontier failed:", terr or "unknown")
      local retOK, retErr = retraceTrip(trip, bus)
      snap.tripActive = false
      snap.tape = tape.new()
      snap.pose = pose.copy(trip.pose)
      saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
      if bus.abort then
        snap.halted = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return nil, "aborted"
      end
      if bus.returnHome then
        snap.paused = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return "paused"
      end
      return nil, "travel failed: " .. tostring(terr)
    end

    -- Mine within the lane.
    local mined, merr = mineTrip(trip, legs, snap.progress, spec, snap, spec.maxTripBlocks, bus)

    -- Return to the station: retrace the full tape (back through descent,
    -- walk back to station base).
    local retOK, retErr = retraceTrip(trip, bus)
    if retOK then
      stationService(trip, base)
    else
      util.log("miner: retrace to station failed:", retErr or "unknown")
    end

    tape.clear(trip.tape)
    snap.tape = tape.new()
    snap.tripActive = false
    snap.pose = pose.copy(trip.pose)
    snap.stats.trips = snap.stats.trips + 1

    saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
    progressMsg(bus, snap, nil, "idle")

    if plan.normalize(legs, snap.progress) then
      return "done"
    end
    if not mined then
      if bus.abort then
        snap.halted = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return nil, "aborted"
      end
      if bus.returnHome then
        snap.paused = true
        saveSnap(snap, { id = spec.id, spec = spec }, nil, false)
        return "paused"
      end
      return nil, "mine failed: " .. tostring(merr)
    end
    if mined == 0 then
      return nil, "no progress this trip (fuel or inventory)"
    end
  end
end

return M
