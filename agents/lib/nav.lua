-- Movement layer: every turtle call goes through here so pose, the trip tape,
-- the fuel invariant, and the journal stay consistent.
local pose = require("lib.pose")
local tape = require("lib.tape")
local safety = require("lib.safety")
local journal = require("lib.journal")

local M = {}

function M.new(hal, tripTape, reserve, startPose)
  return {
    hal = hal,
    tape = tripTape or tape.new(),
    reserve = reserve or 0,
    pose = startPose or pose.new(0, 0, 0, 0),
  }
end

--- A translation: spends one fuel and adds one tape entry.
function M.step(nav, op)
  if not pose.isTranslation(op) then return M.turn(nav, op) end
  if not safety.canStep(nav.hal.fuel(), nav.tape, nav.reserve) then
    return nil, "fuel reserve"
  end
  local fuel = nav.hal.fuel()
  journal.intent(op, fuel)
  local ok, err = nav.hal.move(op)
  if not ok then
    journal.fail()
    return nil, err or (op .. " failed")
  end
  pose.apply(nav.pose, op)
  tape.push(nav.tape, op)
  journal.commit(op)
  return true
end

--- A turn: free, but still taped so the reverse trip restores facing.
function M.turn(nav, op)
  if not safety.canTurn(nav.hal.fuel(), nav.tape, nav.reserve) then
    return nil, "fuel reserve"
  end
  local fuel = nav.hal.fuel()
  journal.intent(op, fuel)
  local ok, err = nav.hal.move(op)
  if not ok then
    journal.fail()
    return nil, err or (op .. " failed")
  end
  pose.apply(nav.pose, op)
  tape.push(nav.tape, op)
  journal.commit(op)
  return true
end

function M.face(nav, facing)
  local ops = pose.turnOps(nav.pose.f, facing)
  for i = 1, #ops do
    local ok, err = M.turn(nav, ops[i])
    if not ok then return nil, err end
  end
  return true
end

function M.forward(nav, count)
  for _ = 1, count or 1 do
    local ok, err = M.step(nav, "forward")
    if not ok then return nil, err end
  end
  return true
end

function M.up(nav, count)
  for _ = 1, count or 1 do
    local ok, err = M.step(nav, "up")
    if not ok then return nil, err end
  end
  return true
end

function M.down(nav, count)
  for _ = 1, count or 1 do
    local ok, err = M.step(nav, "down")
    if not ok then return nil, err end
  end
  return true
end

--- Pop the last op and execute its inverse.
function M.retraceOne(nav)
  local last = tape.peek(nav.tape)
  if not last then return nil, "tape empty" end
  local inv = pose.inverse(last)
  if not inv then return nil, "bad tape op " .. tostring(last) end

  local fuel = nav.hal.fuel()
  if pose.isTranslation(inv) then
    if not safety.canRetrace(fuel, nav.tape, nav.reserve) then
      return nil, "fuel reserve"
    end
  else
    if not safety.canTurn(fuel, nav.tape, nav.reserve) then
      return nil, "fuel reserve"
    end
  end

  journal.intentRetrace(inv, fuel)
  local ok, err = nav.hal.move(inv)
  if not ok then
    journal.fail()
    return nil, err or (inv .. " failed")
  end
  pose.apply(nav.pose, inv)
  tape.pop(nav.tape)
  journal.commitRetrace(inv)
  return true
end

function M.retraceAll(nav)
  while tape.length(nav.tape) > 0 do
    local ok, err = M.retraceOne(nav)
    if not ok then return nil, err end
  end
  return true
end

function M.retraceTo(nav, length)
  while tape.length(nav.tape) > length do
    local ok, err = M.retraceOne(nav)
    if not ok then return nil, err end
  end
  return true
end

function M.cost(nav)
  return tape.cost(nav.tape)
end

function M.shouldEnd(nav, margin)
  return safety.shouldEndTrip(nav.hal.fuel(), nav.tape, nav.reserve, margin)
end

return M
