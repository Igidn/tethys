-- Durable trip checkpoint + append-only intent journal.
--
-- Every move is written twice: an intent before the turtle API call and a
-- commit after it. If the chunk unloads or the computer reboots between those
-- writes, the fuel counter is the witness: a successful translation spends
-- exactly one fuel, turns are free.
--
-- The checkpoint holds the tape as of `seq`; the journal is truncated on every
-- checkpoint. Old journal lines are ignored because their seq is <= the
-- checkpoint's seq.
local util = require("lib.util")
local pose = require("lib.pose")
local tape = require("lib.tape")

local M = {}

M.STATE = "/tethys/state/mining.json"
M.JOURNAL = "/tethys/state/mining.log"

local seq = 0
local pending = nil

local function fuelText(value)
  if value == "unlimited" then return "unlimited" end
  if type(value) == "number" then return tostring(math.floor(value)) end
  return "nil"
end

local function parseFuel(text)
  if text == "unlimited" then return "unlimited" end
  return tonumber(text)
end

local function applyMove(p, ops, op)
  ops[#ops + 1] = op
  pose.apply(p, op)
end

local function applyRetrace(p, ops, inv)
  if #ops > 0 then
    table.remove(ops)
    pose.apply(p, inv)
  end
end

local function resolvePending(p, getFuel, ppos, ops)
  local now = getFuel()
  local success = false
  local uncertain = false

  if not pose.isTranslation(p.op) then
    -- Turns consume no fuel, so there is no witness.
    success = true
    uncertain = true
    if p.kind == "retrace" then
      applyRetrace(ppos, ops, p.op)
    else
      applyMove(ppos, ops, p.op)
    end
    return success, uncertain
  end

  if type(p.fuel) == "number" and type(now) == "number" then
    if now == p.fuel - 1 then
      success = true
    elseif now == p.fuel then
      success = false
    else
      success = now < p.fuel
      uncertain = true
    end
  else
    -- Unlimited fuel gives no witness; assume the move completed.
    success = true
    uncertain = true
  end

  if success then
    if p.kind == "retrace" then
      applyRetrace(ppos, ops, p.op)
    else
      applyMove(ppos, ops, p.op)
    end
  end
  return success, uncertain
end

--- Load the checkpoint and replay the journal tail.
function M.load(getFuel)
  local snap = util.readJson(M.STATE)
  if type(snap) ~= "table" then return nil end

  local ppos = pose.copy(snap.pose or pose.new(0, 0, 0, 0))
  local ops = {}
  if type(snap.tape) == "table" then
    for i = 1, #snap.tape do ops[i] = snap.tape[i] end
  end

  seq = tonumber(snap.seq) or 0
  pending = nil
  local uncertain = false
  local checkpointSeq = seq

  local text = util.readFile(M.JOURNAL) or ""
  for line in text:gmatch("[^\r\n]+") do
    local tag = line:sub(1, 1)
    if tag == "I" then
      local s, mode, op, fuel = line:match("^I%s+(%d+)%s+(%S+)%s+(%S+)%s+(%S+)$")
      s = tonumber(s)
      if s and s > checkpointSeq then
        if pending then
          local _, bad = resolvePending(pending, getFuel, ppos, ops)
          uncertain = uncertain or bad
        end
        pending = { seq = s, kind = mode, op = op, fuel = parseFuel(fuel) }
        seq = math.max(seq, s)
      end
    elseif tag == "C" then
      local s, op = line:match("^C%s+(%d+)%s+(%S+)$")
      s = tonumber(s)
      if s and s > checkpointSeq then
        if pending and pending.seq == s then
          applyMove(ppos, ops, pending.op)
          pending = nil
        else
          applyMove(ppos, ops, op)
        end
        seq = math.max(seq, s)
      end
    elseif tag == "R" then
      local s, op = line:match("^R%s+(%d+)%s+(%S+)$")
      s = tonumber(s)
      if s and s > checkpointSeq then
        if pending and pending.seq == s then
          applyRetrace(ppos, ops, pending.op)
          pending = nil
        else
          applyRetrace(ppos, ops, op)
        end
        seq = math.max(seq, s)
      end
    elseif tag == "F" then
      local s = tonumber(line:match("^F%s+(%d+)$"))
      if s and pending and pending.seq == s then pending = nil end
    end
  end

  if pending then
    local _, bad = resolvePending(pending, getFuel, ppos, ops)
    uncertain = uncertain or bad
    pending = nil
  end

  snap.pose = ppos
  snap.tape = tape.deserialize(ops)
  snap.seq = seq
  snap.progress = snap.progress or { leg = 1, offset = 0, layer = 0, strip = 0 }
  snap.stats = snap.stats or { blocks = 0, ores = 0, trips = 0 }
  snap.uncertain = uncertain
  snap.tripActive = snap.tripActive and true or false
  snap.paused = snap.paused and true or false
  snap.halted = snap.halted and true or false
  return snap
end

function M.intent(op, fuel)
  seq = seq + 1
  util.append(M.JOURNAL, ("I %d move %s %s\n"):format(seq, op, fuelText(fuel)))
  pending = { seq = seq, kind = "move", op = op, fuel = fuel }
  return seq
end

function M.intentRetrace(op, fuel)
  seq = seq + 1
  util.append(M.JOURNAL, ("I %d retrace %s %s\n"):format(seq, op, fuelText(fuel)))
  pending = { seq = seq, kind = "retrace", op = op, fuel = fuel }
  return seq
end

function M.commit(op)
  if not pending then return end
  util.append(M.JOURNAL, ("C %d %s\n"):format(pending.seq, op))
  pending = nil
end

function M.commitRetrace(op)
  if not pending then return end
  util.append(M.JOURNAL, ("R %d %s\n"):format(pending.seq, op))
  pending = nil
end

function M.fail()
  if not pending then return end
  util.append(M.JOURNAL, ("F %d\n"):format(pending.seq))
  pending = nil
end

function M.currentSeq()
  return seq
end

function M.resetJournal()
  seq = 0
  pending = nil
  util.writeFile(M.JOURNAL, "")
end

--- Write a checkpoint, then clear the journal.
function M.save(snap)
  local data = {
    mission = snap.mission,
    progress = snap.progress,
    tripActive = snap.tripActive and true or false,
    pose = snap.pose,
    tape = snap.tape,
    stats = snap.stats,
    seq = seq,
    paused = snap.paused and true or false,
    halted = snap.halted and true or false,
    updatedAt = util.now(),
  }
  if type(snap.tape) == "table" and snap.tape.ops then
    data.tape = tape.serialize(snap.tape)
  end
  local ok, err = util.writeJson(M.STATE, data)
  if not ok then return nil, err end
  util.writeFile(M.JOURNAL, "")
  return true
end

return M
