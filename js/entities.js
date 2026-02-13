/**
 * Entity creation and management.
 * Structure supports sprite swapping later.
 */

let nextEntityId = 1;

function createEntity(type, gridX, gridY, overrides = {}) {
    const id = nextEntityId++;
    const base = {
        id,
        type,
        gridX,
        gridY,
        screenX: 0,
        screenY: 0,
        selected: false,
    };

    if (type === ENTITY_TYPES.MINERAL_PATCH || type === ENTITY_TYPES.VESPENE_GEYSER) {
        const def = RESOURCE_NODES[type];
        return Object.assign(base, {
            minerals: def.minerals || 0,
            vespene: def.vespene || 0,
            width: def.width,
            height: def.height,
        }, overrides);
    }

    if (type === ENTITY_TYPES.SCV) {
        const def = UNITS[ENTITY_TYPES.SCV];
        return Object.assign(base, {
            targetX: null,
            targetY: null,
            targetId: null,
            state: 'idle', // idle, moving_to_mineral, mining, returning
            miningProgress: 0,
            moveSpeed: def.moveSpeed,
        }, overrides);
    }

    if (type === ENTITY_TYPES.MARINE) {
        return Object.assign(base, {
            targetX: null,
            targetY: null,
            state: 'idle',
            moveSpeed: 3,
        }, overrides);
    }

    if (type === ENTITY_TYPES.COMMAND_CENTER || type === ENTITY_TYPES.BARRACKS ||
        type === ENTITY_TYPES.SUPPLY_DEPOT || type === ENTITY_TYPES.REFINERY) {
        const def = BUILDINGS[type];
        return Object.assign(base, {
            width: def.width,
            height: def.height,
            buildProgress: 100, // 0-100, 100 = complete
            buildQueue: [],
        }, overrides);
    }

    return base;
}

function createInitialState() {
    const entities = [];
    const map = {
        minerals: 50,
        vespene: 0,
        supply: 1,
        supplyCap: 17,
        mineralsCollected: 0,
    };

    // Spawn Command Center at center
    const ccX = Math.floor(CONFIG.MAP_COLS / 2) - 1;
    const ccY = Math.floor(CONFIG.MAP_ROWS / 2) - 1;
    const cc = createEntity(ENTITY_TYPES.COMMAND_CENTER, ccX, ccY);
    entities.push(cc);

    // Spawn 1 SCV outside the base (CC is 3x2, so spawn to the right)
    const scv = createEntity(ENTITY_TYPES.SCV, ccX + 4, ccY);
    entities.push(scv);

    // Mineral patches well clear of base - no overlap with CC footprint (ccX to ccX+2, ccY to ccY+1)
    const mineralPositions = [
        [ccX - 7, ccY - 6], [ccX - 6, ccY - 7], [ccX - 5, ccY - 8],
        [ccX + 7, ccY - 5], [ccX + 8, ccY - 4], [ccX + 6, ccY - 6],
        [ccX - 7, ccY + 5], [ccX + 7, ccY + 4],
    ];
    mineralPositions.forEach(([x, y]) => {
        if (x >= 0 && x < CONFIG.MAP_COLS && y >= 0 && y < CONFIG.MAP_ROWS) {
            entities.push(createEntity(ENTITY_TYPES.MINERAL_PATCH, x, y));
        }
    });

    return { entities, map };
}
