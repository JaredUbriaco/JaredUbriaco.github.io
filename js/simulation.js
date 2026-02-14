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

function findNearestForFaction(scv, entities) {
        const maxDist = scv.faction === 'enemy' ? 30 : Infinity;
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of entities) {
        if (e.type !== ENTITY_TYPES.MINERAL_PATCH) continue;
        if (!e.minerals || e.minerals < (UNITS[ENTITY_TYPES.SCV].mineralsPerTrip || 5)) continue;
        const d = distance(scv.gridX, scv.gridY, e.gridX, e.gridY);
        if (d < nearestDist && d < maxDist) {
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

function updateEntity(entity, entities, map, deltaTime, enemyMap) {
    const resourceMap = entity.faction === 'enemy' ? (enemyMap || map) : map;
    if (entity.type === ENTITY_TYPES.SCV) {
        updateSCV(entity, entities, resourceMap, deltaTime);
        return;
    }
    if (entity.type === ENTITY_TYPES.MARINE) {
        updateMarine(entity, deltaTime);
        return;
    }
    if (entity.type === ENTITY_TYPES.COMMAND_CENTER || entity.type === ENTITY_TYPES.BARRACKS ||
        entity.type === ENTITY_TYPES.SUPPLY_DEPOT || entity.type === ENTITY_TYPES.REFINERY) {
        const bmap = entity.faction === 'enemy' ? (enemyMap || map) : map;
        updateBuilding(entity, entities, bmap, deltaTime);
    }
}

function updateSCV(scv, entities, map, deltaTime) {
    const def = UNITS[ENTITY_TYPES.SCV];
    const dtSec = deltaTime / 1000;
    const speed = scv.moveSpeed * dtSec;

    if (scv.state === 'returning') {
        const cc = entities.find(e => e.type === ENTITY_TYPES.COMMAND_CENTER && (e.faction || 'player') === (scv.faction || 'player'));
        if (!cc) {
            scv.state = 'idle';
            return;
        }
        const dx = cc.gridX + cc.width / 2 - scv.gridX;
        const dy = cc.gridY + cc.height / 2 - scv.gridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.4) {
            map.minerals += def.mineralsPerTrip;
            if (map.mineralsCollected !== undefined) map.mineralsCollected += def.mineralsPerTrip;
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

    if (scv.state === 'moving' && scv.targetX !== null && scv.targetY !== null) {
        const dx = scv.targetX - scv.gridX;
        const dy = scv.targetY - scv.gridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.35) {
            scv.gridX = scv.targetX;
            scv.gridY = scv.targetY;
            scv.targetX = null;
            scv.targetY = null;
            scv.state = 'idle';
            return;
        }
        scv.gridX += (dx / dist) * speed;
        scv.gridY += (dy / dist) * speed;
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
        const patch = findNearestForFaction(scv, entities);
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
        if (building.faction) unit.faction = building.faction;
        entities.push(unit);
        map.supply = (map.supply || 0) + (queued.supplyCost || 0);
    }
}

function runEnemyAIDecision(entities, enemyMap) {
    const enemyEntities = entities.filter(e => e.faction === 'enemy');
    const enemyCc = enemyEntities.find(e => e.type === ENTITY_TYPES.COMMAND_CENTER);
    if (!enemyCc || !enemyMap) return;
    const scvCount = enemyEntities.filter(e => e.type === ENTITY_TYPES.SCV).length;
    const hasDepot = enemyEntities.some(e => e.type === ENTITY_TYPES.SUPPLY_DEPOT);
    const supplyCap = enemyMap.supplyCap || 11;
    const supply = enemyMap.supply || 0;

    if (enemyCc.buildQueue && enemyCc.buildQueue.length > 0) return;
    if (!hasSupplySpace({ supply, supplyCap }, 1) && !hasDepot) return;
    if (scvCount < 8 && canAfford(enemyMap, { minerals: 50 }) && hasSupplySpace({ supply, supplyCap }, 1)) {
        enemyCc.buildQueue = enemyCc.buildQueue || [];
        enemyCc.buildQueue.push({ type: ENTITY_TYPES.SCV, buildTime: UNITS[ENTITY_TYPES.SCV].buildTime, cost: { minerals: 50 }, supplyCost: 1 });
        enemyMap.minerals -= 50;
    }
}

function runAIDecision(entities, map) {
    const playerEntities = entities.filter(e => !e.faction || e.faction === 'player');
    const scvCount = playerEntities.filter(e => e.type === ENTITY_TYPES.SCV).length;
    const depotCount = playerEntities.filter(e => e.type === ENTITY_TYPES.SUPPLY_DEPOT).length;
    const depotComplete = playerEntities.some(e => e.type === ENTITY_TYPES.SUPPLY_DEPOT && (e.buildProgress === undefined || e.buildProgress >= 100));
    const barracksCount = playerEntities.filter(e => e.type === ENTITY_TYPES.BARRACKS).length;
    const supply = map.supply || 0;
    const supplyBlocked = !hasSupplySpace(map, 1);

    for (const e of entities) {
        if (e.faction && e.faction !== 'player') continue;
        if (e.type !== ENTITY_TYPES.COMMAND_CENTER && e.type !== ENTITY_TYPES.BARRACKS) continue;
        if (e.buildQueue && e.buildQueue.length > 0) continue;

        if (e.type === ENTITY_TYPES.COMMAND_CENTER) {
            // 10 supply: first Supply Depot (100 minerals) — ~1:00
            if (depotCount < 1 && supply >= (BUILD_ORDER.FIRST_DEPOT_AT_SUPPLY || 10) && canAfford(map, { minerals: 100 })) {
                if (tryBuild(entities, map, ENTITY_TYPES.SUPPLY_DEPOT)) continue;
            }
            // 17-18 supply: second Supply Depot
            if (depotCount < 2 && supply >= (BUILD_ORDER.SECOND_DEPOT_AT_SUPPLY || 17) && canAfford(map, { minerals: 100 })) {
                if (tryBuild(entities, map, ENTITY_TYPES.SUPPLY_DEPOT)) continue;
            }
            // 12 supply: first Barracks (150 minerals) — ~1:30
            if (barracksCount < 1 && depotComplete && supply >= (BUILD_ORDER.FIRST_BARRACKS_AT_SUPPLY || 12) && canAfford(map, { minerals: 150 })) {
                if (tryBuild(entities, map, ENTITY_TYPES.BARRACKS)) continue;
            }
            // Second Barracks — ~2:15
            if (barracksCount < 2 && depotComplete && canAfford(map, { minerals: 150 })) {
                if (tryBuild(entities, map, ENTITY_TYPES.BARRACKS)) continue;
            }
            // SCVs: constant production up to 16 per mineral line
            if (scvCount < (BUILD_ORDER.SCVS_TARGET || 16) && canAfford(map, UNITS[ENTITY_TYPES.SCV].cost) && hasSupplySpace(map, 1)) {
                e.buildQueue.push({
                    type: ENTITY_TYPES.SCV,
                    buildTime: UNITS[ENTITY_TYPES.SCV].buildTime,
                    cost: UNITS[ENTITY_TYPES.SCV].cost,
                    supplyCost: 1,
                });
                map.minerals -= UNITS[ENTITY_TYPES.SCV].cost.minerals;
            }
        }
        if (e.type === ENTITY_TYPES.BARRACKS && (e.buildProgress === undefined || e.buildProgress >= 100)) {
            const marineCount = playerEntities.filter(x => x.type === ENTITY_TYPES.MARINE).length;
            if (marineCount < 20 && canAfford(map, UNITS[ENTITY_TYPES.MARINE].cost) && hasSupplySpace(map, 1)) {
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

    const offsets = [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 2], [-3, 2], [2, 3], [-2, 3], [4, 0], [-4, 1], [5, 1], [-2, 4], [2, -2], [0, 5], [5, -1], [-4, 2]];
    for (const [dx, dy] of offsets) {
        const gx = cc.gridX + dx;
        const gy = cc.gridY + dy;
        if (gx >= 0 && gx + def.width <= CONFIG.MAP_COLS && gy >= 0 && gy + def.height <= CONFIG.MAP_ROWS) {
            const blocking = entities.some(e => {
                if (e.type === ENTITY_TYPES.MINERAL_PATCH || e.type === ENTITY_TYPES.VESPENE_GEYSER) return false;
                const ew = e.width || 1;
                const eh = e.height || 1;
                return e.gridX < gx + def.width && e.gridX + ew > gx &&
                    e.gridY < gy + def.height && e.gridY + eh > gy;
            });
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

const VISION_UNIT = 5;
const VISION_BUILDING = 6;

function updateExplored(entities, explored) {
    if (!explored) return;
    for (const e of entities) {
        let range = 0;
        let cx, cy;
        if (e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE) {
            range = VISION_UNIT;
            cx = Math.floor(e.gridX);
            cy = Math.floor(e.gridY);
        } else if (e.width && e.height) {
            range = VISION_BUILDING;
            cx = e.gridX + Math.floor(e.width / 2);
            cy = e.gridY + Math.floor(e.height / 2);
        }
        if (range > 0) {
            for (let dy = -range; dy <= range; dy++) {
                for (let dx = -range; dx <= range; dx++) {
                    if (dx * dx + dy * dy <= range * range) {
                        const rx = cx + dx;
                        const ry = cy + dy;
                        if (rx >= 0 && rx < CONFIG.MAP_COLS && ry >= 0 && ry < CONFIG.MAP_ROWS) {
                            explored[ry][rx] = true;
                        }
                    }
                }
            }
        }
    }
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
