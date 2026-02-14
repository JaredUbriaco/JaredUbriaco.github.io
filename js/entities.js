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
    const enemyMap = {
        minerals: 30,
        vespene: 0,
        supply: 1,
        supplyCap: 17,
    };

    // Far left = Player 1 (yellow); Far right = Red player (enemy)
    // Top corners = bases; Bottom corners = empty expansion for either player
    const ccX = 4;
    const ccY = 4;
    const cc = createEntity(ENTITY_TYPES.COMMAND_CENTER, ccX, ccY);
    entities.push(cc);

    const scv = createEntity(ENTITY_TYPES.SCV, ccX + 4, ccY);
    entities.push(scv);

    const enemyX = CONFIG.MAP_COLS - 8;
    const enemyY = 4;
    const eCc = createEntity(ENTITY_TYPES.COMMAND_CENTER, enemyX, enemyY);
    eCc.faction = 'enemy';
    entities.push(eCc);
    const eScv = createEntity(ENTITY_TYPES.SCV, enemyX + 4, enemyY);
    eScv.faction = 'enemy';
    eScv.targetId = null;
    entities.push(eScv);

    // Minerals: around each base + dense bottom corners (expansion) so players survive longer
    const allMineralPositions = [
        // Player base (top-left / far left)
        [ccX + 4, ccY - 2], [ccX + 3, ccY - 1], [ccX + 6, ccY - 3], [ccX + 2, ccY - 2],
        [ccX - 1, ccY + 1], [ccX + 7, ccY], [ccX + 5, ccY - 4], [ccX + 1, ccY - 3],
        [ccX + 8, ccY - 1], [ccX + 2, ccY + 2], [ccX - 2, ccY - 1], [ccX + 9, ccY - 3],
        // Enemy base (top-right / far right)
        [enemyX - 2, enemyY - 1], [enemyX + 1, enemyY - 2], [enemyX - 3, enemyY + 1],
        [enemyX + 2, enemyY - 3], [enemyX - 1, enemyY + 2], [enemyX + 3, enemyY],
        [enemyX + 4, enemyY - 1], [enemyX - 4, enemyY], [enemyX + 2, enemyY + 2],
        [enemyX - 2, enemyY + 3], [enemyX + 5, enemyY - 2], [enemyX - 5, enemyY + 1],
        // Bottom-left corner (empty expansion - build toward from either player)
        [2, 35], [4, 34], [6, 35], [3, 33], [5, 36], [8, 34], [10, 35], [7, 37], [2, 38], [6, 36],
        [11, 35], [4, 37], [9, 38], [12, 36], [3, 39], [10, 37], [1, 36], [5, 38], [7, 35], [9, 36],
        [2, 33], [4, 36], [6, 38], [8, 37], [10, 38], [11, 37], [3, 37], [5, 34], [7, 39], [9, 34],
        [1, 34], [2, 37], [4, 38], [6, 34], [8, 35], [10, 34], [11, 36], [12, 38],
        // Bottom-right corner (empty expansion - build toward from either player)
        [37, 37], [35, 36], [33, 35], [36, 34], [38, 35], [34, 37], [37, 33], [35, 38],
        [32, 36], [36, 32], [33, 38], [38, 33], [30, 35], [35, 30], [31, 37], [37, 35], [39, 36],
        [34, 35], [36, 37], [38, 38], [33, 34], [35, 33], [39, 34], [37, 36], [34, 38],
        [31, 36], [33, 37], [36, 35], [38, 37], [32, 38], [35, 37], [39, 38], [37, 38], [36, 39],
        [34, 36], [38, 35], [33, 39], [35, 34], [31, 38], [32, 37],
        // Mid-map (contested - fight toward each other)
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
    // Player starts with vision around their base (top-left / far left)
    for (let r = ccY - 4; r <= ccY + 6; r++) {
        for (let c = ccX - 4; c <= ccX + 10; c++) {
            if (r >= 0 && r < CONFIG.MAP_ROWS && c >= 0 && c < CONFIG.MAP_COLS) {
                explored[r][c] = true;
            }
        }
    }

    return { entities, map, enemyMap, explored };
}
