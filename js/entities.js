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
        supply: 6,
        supplyCap: 11,
        mineralsCollected: 0,
    };
    const enemyMap = {
        minerals: 50,
        vespene: 0,
        supply: 6,
        supplyCap: 11,
    };

    // Far left = Yellow (bottom-left); Far right = Red (top-right) — diagonally opposite
    // Empty expansion corners (top-left, bottom-right) = mineral-rich
    const ccX = 4;
    const ccY = CONFIG.MAP_ROWS - 8;
    const cc = createEntity(ENTITY_TYPES.COMMAND_CENTER, ccX, ccY);
    cc.buildQueue = [{ type: ENTITY_TYPES.SCV, buildTime: UNITS[ENTITY_TYPES.SCV].buildTime, cost: { minerals: 50 }, supplyCost: 1 }];
    map.minerals = 0;
    entities.push(cc);

    for (let i = 0; i < 6; i++) {
        const scv = createEntity(ENTITY_TYPES.SCV, ccX + 4 + (i % 3), ccY + Math.floor(i / 3));
        entities.push(scv);
    }

    const enemyX = CONFIG.MAP_COLS - 8;
    const enemyY = 4;
    const eCc = createEntity(ENTITY_TYPES.COMMAND_CENTER, enemyX, enemyY);
    eCc.faction = 'enemy';
    eCc.buildQueue = [{ type: ENTITY_TYPES.SCV, buildTime: UNITS[ENTITY_TYPES.SCV].buildTime, cost: { minerals: 50 }, supplyCost: 1 }];
    enemyMap.minerals = 0;
    entities.push(eCc);
    for (let i = 0; i < 6; i++) {
        const eScv = createEntity(ENTITY_TYPES.SCV, enemyX + 4 + (i % 3), enemyY + Math.floor(i / 3));
        eScv.faction = 'enemy';
        eScv.targetId = null;
        entities.push(eScv);
    }

    // Minerals: around each base + dense EMPTY corners (top-left, bottom-right) — neither player starts there
    const allMineralPositions = [
        // Player base (bottom-left / far left)
        [ccX + 4, ccY - 2], [ccX + 3, ccY - 1], [ccX + 6, ccY - 3], [ccX + 2, ccY - 2],
        [ccX - 1, ccY + 1], [ccX + 7, ccY], [ccX + 5, ccY - 4], [ccX + 1, ccY - 3],
        [ccX + 8, ccY - 1], [ccX + 2, ccY + 2], [ccX - 2, ccY - 1], [ccX + 9, ccY - 3],
        // Enemy base (top-right / far right)
        [enemyX - 2, enemyY - 1], [enemyX + 1, enemyY - 2], [enemyX - 3, enemyY + 1],
        [enemyX + 2, enemyY - 3], [enemyX - 1, enemyY + 2], [enemyX + 3, enemyY],
        [enemyX + 4, enemyY - 1], [enemyX - 4, enemyY], [enemyX + 2, enemyY + 2],
        [enemyX - 2, enemyY + 3], [enemyX + 5, enemyY - 2], [enemyX - 5, enemyY + 1],
        // Top-left corner (empty expansion — neither player starts here)
        [2, 2], [4, 3], [6, 2], [3, 5], [5, 6], [8, 4], [10, 3], [7, 7], [2, 8], [6, 9],
        [11, 5], [4, 10], [9, 8], [12, 7], [3, 12], [10, 10], [1, 6], [5, 4], [7, 2], [9, 6],
        [2, 4], [4, 7], [6, 11], [8, 9], [10, 5], [11, 8], [3, 3], [5, 9], [7, 4], [9, 11],
        [1, 4], [2, 6], [4, 2], [6, 5], [8, 2], [10, 7], [11, 10], [12, 4], [3, 8], [5, 2],
        // Bottom-right corner (empty expansion — neither player starts here)
        [37, 37], [35, 36], [33, 35], [36, 34], [38, 35], [34, 37], [37, 33], [35, 38],
        [32, 36], [36, 32], [33, 38], [38, 33], [30, 35], [35, 30], [31, 37], [37, 35], [39, 36],
        [34, 35], [36, 37], [38, 38], [33, 34], [35, 33], [39, 34], [37, 36], [34, 38],
        [31, 36], [33, 37], [36, 35], [38, 37], [32, 38], [35, 37], [39, 38], [37, 38], [36, 39],
        [34, 36], [38, 35], [33, 39], [35, 34], [31, 38], [32, 37],
        // Mid-map (contested — fight toward each other)
        [18, 18], [20, 17], [22, 19], [19, 22], [21, 21], [17, 20], [23, 18], [20, 24],
        [24, 20], [16, 22], [22, 16], [25, 23], [15, 25], [26, 15],
    ];
    const seen = new Set();
    allMineralPositions.forEach(([x, y]) => {
        const key = `${x},${y}`;
        if (!seen.has(key) && x >= 0 && x < CONFIG.MAP_COLS && y >= 0 && y < CONFIG.MAP_ROWS) {
            seen.add(key);
            entities.push(createEntity(ENTITY_TYPES.MINERAL_PATCH, x, y));
        }
    });

    const explored = [];
    for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
        explored[r] = [];
        for (let c = 0; c < CONFIG.MAP_COLS; c++) {
            explored[r][c] = false;
        }
    }
    // Player starts with vision around their base (bottom-left / far left)
    for (let r = ccY - 4; r <= ccY + 6; r++) {
        for (let c = ccX - 4; c <= ccX + 10; c++) {
            if (r >= 0 && r < CONFIG.MAP_ROWS && c >= 0 && c < CONFIG.MAP_COLS) {
                explored[r][c] = true;
            }
        }
    }

    return { entities, map, enemyMap, explored };
}
