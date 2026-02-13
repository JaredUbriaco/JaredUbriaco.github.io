/**
 * Game simulation logic and autonomous AI.
 */

function worldToScreen(gridX, gridY) {
    const tw = CONFIG.TILE_WIDTH;
    const th = CONFIG.TILE_HEIGHT;
    return {
        x: (gridX - gridY) * (tw / 2),
        y: (gridX + gridY) * (th / 2),
    };
}

function screenToWorld(screenX, screenY, offsetX, offsetY) {
    const tw = CONFIG.TILE_WIDTH;
    const th = CONFIG.TILE_HEIGHT;
    const x = screenX - offsetX;
    const y = screenY - offsetY;
    const gridX = (x / (tw / 2) + y / (th / 2)) / 2;
    const gridY = (y / (th / 2) - x / (tw / 2)) / 2;
    return { gridX: Math.floor(gridX + 0.5), gridY: Math.floor(gridY + 0.5) };
}

function distance(ax, ay, bx, by) {
    return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function findNearest(entity, entities, type) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of entities) {
        if (e.type !== type) continue;
        if (type === ENTITY_TYPES.MINERAL_PATCH && (!e.minerals || e.minerals < (UNITS[ENTITY_TYPES.SCV].mineralsPerTrip || 5))) continue;
        const d = distance(entity.gridX, entity.gridY, e.gridX, e.gridY);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = e;
        }
    }
    return nearest;
}

function findNearestBuilding(entity, entities, producesType) {
    for (const e of entities) {
        if (e.type !== ENTITY_TYPES.COMMAND_CENTER && e.type !== ENTITY_TYPES.BARRACKS) continue;
        const def = BUILDINGS[e.type];
        if (!def.produces || !def.produces.includes(producesType)) continue;
        return e;
    }
    return null;
}

function canAfford(map, cost) {
    if (cost.minerals && map.minerals < cost.minerals) return false;
    if (cost.vespene && map.vespene < cost.vespene) return false;
    return true;
}

function hasSupplySpace(map, supplyCost) {
    return map.supply + supplyCost <= map.supplyCap;
}

function updateEntity(entity, entities, map, deltaTime) {
    if (entity.type === ENTITY_TYPES.SCV) {
        updateSCV(entity, entities, map, deltaTime);
        return;
    }
    if (entity.type === ENTITY_TYPES.MARINE) {
        updateMarine(entity, deltaTime);
        return;
    }
    if (entity.type === ENTITY_TYPES.COMMAND_CENTER || entity.type === ENTITY_TYPES.BARRACKS ||
        entity.type === ENTITY_TYPES.SUPPLY_DEPOT || entity.type === ENTITY_TYPES.REFINERY) {
        updateBuilding(entity, entities, map, deltaTime);
    }
}

function updateSCV(scv, entities, map, deltaTime) {
    const def = UNITS[ENTITY_TYPES.SCV];
    const dtSec = deltaTime / 1000;
    const speed = scv.moveSpeed * dtSec;

    if (scv.state === 'returning') {
        const cc = entities.find(e => e.type === ENTITY_TYPES.COMMAND_CENTER);
        if (!cc) {
            scv.state = 'idle';
            return;
        }
        const dx = cc.gridX + cc.width / 2 - scv.gridX;
        const dy = cc.gridY + cc.height / 2 - scv.gridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.4) {
            map.minerals += def.mineralsPerTrip;
            map.mineralsCollected += def.mineralsPerTrip;
            scv.state = 'idle';
            scv.targetId = null;
            return;
        }
        scv.gridX += (dx / dist) * speed;
        scv.gridY += (dy / dist) * speed;
        return;
    }

    if (scv.state === 'mining') {
        scv.miningProgress = (scv.miningProgress || 0) + dtSec;
        if (scv.miningProgress >= def.miningTimeSeconds) {
            scv.miningProgress = 0;
            scv.state = 'returning';
            scv.targetId = null;
        }
        return;
    }

    if (scv.state === 'moving_to_mineral') {
        const patch = entities.find(e => e.id === scv.targetId);
        if (!patch || patch.minerals < def.mineralsPerTrip) {
            scv.state = 'idle';
            scv.targetId = null;
            return;
        }
        const dx = patch.gridX - scv.gridX;
        const dy = patch.gridY - scv.gridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
            scv.state = 'mining';
            scv.miningProgress = 0;
            patch.minerals -= def.mineralsPerTrip;
            if (patch.minerals < 0) patch.minerals = 0;
            return;
        }
        scv.gridX += (dx / dist) * speed;
        scv.gridY += (dy / dist) * speed;
        return;
    }

    if (scv.state === 'idle' || scv.state === 'moving') {
        const patch = findNearest(scv, entities, ENTITY_TYPES.MINERAL_PATCH);
        if (patch) {
            scv.targetId = patch.id;
            scv.state = 'moving_to_mineral';
        }
    }
}

function updateMarine(marine, deltaTime) {
    if (marine.state === 'moving' && marine.targetX !== null) {
        const speed = marine.moveSpeed * (deltaTime / 1000) * 6;
        const dx = marine.targetX - marine.gridX;
        const dy = marine.targetY - marine.gridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.3) {
            marine.gridX = marine.targetX;
            marine.gridY = marine.targetY;
            marine.state = 'idle';
            marine.targetX = null;
            marine.targetY = null;
        } else {
            marine.gridX += (dx / dist) * speed;
            marine.gridY += (dy / dist) * speed;
        }
    }
}

function updateBuilding(building, entities, map, deltaTime) {
    if (building.buildProgress < 100 && building.buildTimeTotal) {
        building.buildProgress += (100 / (building.buildTimeTotal * 60)) * (deltaTime / 1000) * 60;
        if (building.buildProgress >= 100) {
            building.buildProgress = 100;
            const def = BUILDINGS[building.type];
            if (def && def.supplyProvided) map.supplyCap += def.supplyProvided;
        }
        return;
    }
    if (!building.buildQueue || building.buildQueue.length === 0) return;
    const queued = building.buildQueue[0];
    queued.progress = (queued.progress || 0) + (100 / queued.buildTime) * (deltaTime / 1000);
    if (queued.progress >= 100) {
        building.buildQueue.shift();
        const spawnX = building.gridX + building.width;
        const spawnY = building.gridY + Math.floor(building.height / 2);
        const unit = createEntity(queued.type, spawnX, spawnY);
        entities.push(unit);
        map.supply += queued.supplyCost || 0;
    }
}

function runAIDecision(entities, map) {
    const scvCount = entities.filter(e => e.type === ENTITY_TYPES.SCV).length;
    const hasDepot = entities.some(e => e.type === ENTITY_TYPES.SUPPLY_DEPOT);
    const hasBarracks = entities.some(e => e.type === ENTITY_TYPES.BARRACKS);

    for (const e of entities) {
        if (e.type !== ENTITY_TYPES.COMMAND_CENTER && e.type !== ENTITY_TYPES.BARRACKS) continue;
        if (e.buildQueue && e.buildQueue.length > 0) continue;

        if (e.type === ENTITY_TYPES.COMMAND_CENTER) {
            if (!hasSupplySpace(map, 1) && !hasDepot && canAfford(map, { minerals: 100 })) {
                tryBuild(entities, map, ENTITY_TYPES.SUPPLY_DEPOT);
                continue;
            }
            if (scvCount < 15 && canAfford(map, UNITS[ENTITY_TYPES.SCV].cost) && hasSupplySpace(map, 1)) {
                e.buildQueue.push({
                    type: ENTITY_TYPES.SCV,
                    buildTime: UNITS[ENTITY_TYPES.SCV].buildTime,
                    cost: UNITS[ENTITY_TYPES.SCV].cost,
                    supplyCost: 1,
                });
                map.minerals -= UNITS[ENTITY_TYPES.SCV].cost.minerals;
                continue;
            }
            if (!hasBarracks && hasDepot && canAfford(map, { minerals: 150 })) {
                tryBuild(entities, map, ENTITY_TYPES.BARRACKS);
            }
        }
        if (e.type === ENTITY_TYPES.BARRACKS) {
            const marineCount = entities.filter(x => x.type === ENTITY_TYPES.MARINE).length;
            if (marineCount < 10 && canAfford(map, UNITS[ENTITY_TYPES.MARINE].cost) && hasSupplySpace(map, 1)) {
                e.buildQueue.push({
                    type: ENTITY_TYPES.MARINE,
                    buildTime: UNITS[ENTITY_TYPES.MARINE].buildTime,
                    cost: UNITS[ENTITY_TYPES.MARINE].cost,
                    supplyCost: 1,
                });
                map.minerals -= UNITS[ENTITY_TYPES.MARINE].cost.minerals;
            }
        }
    }
}

function tryBuild(entities, map, buildingType) {
    const def = BUILDINGS[buildingType];
    if (!def || !canAfford(map, def.cost)) return null;
    if (def.requires && !entities.some(e => e.type === def.requires)) return null;

    const cc = entities.find(e => e.type === ENTITY_TYPES.COMMAND_CENTER);
    if (!cc) return null;

    const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]];
    for (const [dx, dy] of offsets) {
        const gx = cc.gridX + dx;
        const gy = cc.gridY + dy;
        if (gx >= 0 && gx + def.width <= CONFIG.MAP_COLS && gy >= 0 && gy + def.height <= CONFIG.MAP_ROWS) {
            const blocking = entities.some(e =>
                e.gridX < gx + def.width && e.gridX + (e.width || 1) > gx &&
                e.gridY < gy + def.height && e.gridY + (e.height || 1) > gy
            );
            if (!blocking) {
                map.minerals -= def.cost.minerals;
                const b = createEntity(buildingType, gx, gy);
                b.buildProgress = 0;
                b.buildTimeTotal = def.buildTime;
                entities.push(b);
                return b;
            }
        }
    }
    return null;
}

function checkWinCondition(entities, map) {
    const win = CONFIG.WIN_CONDITION;
    const unitCount = entities.filter(e => e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE).length;
    const buildingCount = entities.filter(e =>
        e.type === ENTITY_TYPES.COMMAND_CENTER || e.type === ENTITY_TYPES.BARRACKS ||
        e.type === ENTITY_TYPES.SUPPLY_DEPOT || e.type === ENTITY_TYPES.REFINERY
    ).length;
    return unitCount >= win.totalUnits && buildingCount >= win.totalBuildings && map.mineralsCollected >= win.mineralsCollected;
}
