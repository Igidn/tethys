-- Per-trip trip tape. Deliberately a stack, not a persistent route:
--
--   * the plan is the durable, deterministic route to the frontier;
--   * the tape records only the trip actually walked, so its length is bounded
--     by fuel and the trip budget;
--   * returning home is popping the stack and executing the inverse ops.
--
-- `translations` is the exact fuel cost to return to the dock.
local pose = require("lib.pose")

local M = {}

function M.new()
  return { ops = {}, translations = 0 }
end

function M.push(t, op)
  t.ops[#t.ops + 1] = op
  if pose.isTranslation(op) then
    t.translations = t.translations + 1
  end
end

function M.peek(t)
  return t.ops[#t.ops]
end

function M.pop(t)
  local n = #t.ops
  if n == 0 then return nil end
  local op = t.ops[n]
  t.ops[n] = nil
  if pose.isTranslation(op) then
    t.translations = t.translations - 1
  end
  return op
end

function M.cost(t)
  return t.translations
end

function M.length(t)
  return #t.ops
end

function M.clear(t)
  t.ops = {}
  t.translations = 0
end

function M.truncate(t, n)
  while #t.ops > n do
    M.pop(t)
  end
end

function M.serialize(t)
  local out = {}
  for i = 1, #t.ops do out[i] = t.ops[i] end
  return out
end

function M.deserialize(ops)
  local t = M.new()
  if type(ops) == "table" then
    for i = 1, #ops do
      if type(ops[i]) == "string" then M.push(t, ops[i]) end
    end
  end
  return t
end

return M
