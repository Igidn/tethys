-- Thin, mockable wrapper around the turtle API. The miner only talks to this
-- module, which is what lets the simulator run the same movement code.
local M = {}

local backend = turtle

local FUEL_ITEMS = {
  ["minecraft:coal"] = true,
  ["minecraft:charcoal"] = true,
  ["minecraft:coal_block"] = true,
  ["minecraft:blaze_rod"] = true,
  ["minecraft:lava_bucket"] = true,
  ["minecraft:dried_kelp_block"] = true,
}

function M.setBackend(value) backend = value end
function M.getBackend() return backend end

function M.fuel()
  if not backend then return 0 end
  return backend.getFuelLevel()
end

function M.move(op)
  if not backend then return false, "no turtle backend" end
  local ok, err = backend[op]()
  if not ok then return false, err or (op .. " failed") end
  return true
end

function M.turnLeft() return M.move("turnLeft") end
function M.turnRight() return M.move("turnRight") end

function M.dig()
  if not backend then return false, "no turtle backend" end
  return backend.dig()
end

function M.digUp()
  if not backend then return false, "no turtle backend" end
  return backend.digUp()
end

function M.digDown()
  if not backend then return false, "no turtle backend" end
  return backend.digDown()
end

local function inspectWith(fn)
  if not backend or not fn then return nil end
  local ok, data = fn()
  if not ok then return nil end
  return data
end

function M.inspect() return inspectWith(backend and backend.inspect) end
function M.inspectUp() return inspectWith(backend and backend.inspectUp) end
function M.inspectDown() return inspectWith(backend and backend.inspectDown) end

function M.passable(data)
  if not data then return true end
  local name = data.name or ""
  return name == "minecraft:air"
    or name == "minecraft:cave_air"
    or name == "minecraft:void_air"
    or name == "minecraft:water"
    or name == "minecraft:flowing_water"
    or name == "minecraft:bubble_column"
end

function M.hazard(data)
  if not data then return false end
  local name = data.name or ""
  return name:find("lava", 1, true) ~= nil
    or name == "minecraft:fire"
    or name == "minecraft:soul_fire"
end

function M.ore(data)
  if not data then return false end
  local tags = data.tags
  if type(tags) == "table" then
    if tags["c:ores"] or tags["forge:ores"] then return true end
  end
  local name = data.name or ""
  return name:find("_ore", 1, true) ~= nil
    or name:find("ancient_debris", 1, true) ~= nil
end

function M.itemDetail(slot)
  if not backend then return nil end
  local a, b = backend.getItemDetail(slot)
  -- CC:T returns a table or nil; some mocks return (boolean, table).
  if type(a) == "table" then return a end
  if a == true then return b end
  return nil
end

function M.inventory()
  local out = {}
  if not backend then return out end
  for slot = 1, 16 do
    local item = M.itemDetail(slot)
    if item then
      out[#out + 1] = { slot = slot, name = item.name, count = item.count or 0 }
    end
  end
  return out
end

function M.usedSlots()
  return #M.inventory()
end

function M.select(slot)
  if not backend then return false end
  return backend.select(slot)
end

function M.selectedSlot()
  if not backend then return 1 end
  return backend.getSelectedSlot()
end

function M.dropDown()
  if not backend then return false end
  return backend.dropDown()
end

function M.drop()
  if not backend then return false end
  return backend.drop()
end

function M.suck()
  if not backend then return false end
  return backend.suck()
end

function M.suckDown()
  if not backend or not backend.suckDown then return false end
  return backend.suckDown()
end

function M.refuel()
  if not backend then return false end
  return backend.refuel()
end

function M.isFuel(name)
  return FUEL_ITEMS[name] == true
end

function M.findFuelSlot()
  for slot = 1, 16 do
    local item = M.itemDetail(slot)
    if item and FUEL_ITEMS[item.name] then return slot end
  end
  return nil
end

function M.refuelFromInventory(limit)
  local slot = M.findFuelSlot()
  if not slot then return false, "no fuel in inventory" end
  local previous = M.selectedSlot()
  if not M.select(slot) then return false, "select failed" end
  local ok, err
  if limit and backend and backend.refuel then
    ok, err = backend.refuel(limit)
  else
    ok, err = M.refuel()
  end
  pcall(M.select, previous)
  if not ok then return false, err or "refuel failed" end
  return true
end

--- Drop every slot except `keepSlot` down into the dock chest.
function M.unload(keepSlot)
  local previous = M.selectedSlot()
  local dropped = 0
  for slot = 1, 16 do
    if slot ~= keepSlot then
      if M.select(slot) and M.itemDetail(slot) then
        if M.dropDown() then dropped = dropped + 1 end
      end
    end
  end
  pcall(M.select, previous)
  return dropped
end

return M
