/**
 * Game constants and entity definitions.
 * Sprite-ready: entity types map to future sprite keys.
 */

const CONFIG = {
    TILE_WIDTH: 64,
    TILE_HEIGHT: 32,
    MAP_COLS: 40,
    MAP_ROWS: 40,
};

// Build order thresholds (SC2 standard opener)
const BUILD_ORDER = {
    FIRST_DEPOT_AT_SUPPLY: 10,           // ~1:00-1:15 — build Supply Depot (100 minerals)
    FIRST_BARRACKS_AT_SUPPLY: 12,        // ~1:30 — build Barracks (150 minerals)
    SECOND_DEPOT_AT_SUPPLY: 17,         // 17-18 supply — second Supply Depot
    SCVS_BEFORE_FIRST_DEPOT: 7,         // 6 start + 1 building — aim for 7 before depot
    SCVS_TARGET: 16,                    // 16 per mineral line (saturation)
};

const ENTITY_TYPES = {
    COMMAND_CENTER: 'command_center',
    BARRACKS: 'barracks',
    SUPPLY_DEPOT: 'supply_depot',
    REFINERY: 'refinery',
    SCV: 'scv',
    MARINE: 'marine',
    MINERAL_PATCH: 'mineral_patch',
    VESPENE_GEYSER: 'vespene_geyser',
};

const BUILDINGS = {
    [ENTITY_TYPES.COMMAND_CENTER]: {
        name: 'Command Center',
        cost: { minerals: 400 },
        buildTime: 100,
        supplyProvided: 11,
        health: 1500,
        armor: 1,
        width: 3,
        height: 2,
        produces: [ENTITY_TYPES.SCV],
        builds: [ENTITY_TYPES.SUPPLY_DEPOT, ENTITY_TYPES.BARRACKS],
    },
    [ENTITY_TYPES.BARRACKS]: {
        name: 'Barracks',
        cost: { minerals: 150 },
        buildTime: 46,
        health: 400,
        armor: 1,
        width: 2,
        height: 2,
        requires: ENTITY_TYPES.SUPPLY_DEPOT,
        produces: [ENTITY_TYPES.MARINE],
    },
    [ENTITY_TYPES.SUPPLY_DEPOT]: {
        name: 'Supply Depot',
        cost: { minerals: 100 },
        buildTime: 30,
        supplyProvided: 8,
        health: 400,
        armor: 1,
        width: 2,
        height: 1,
    },
    [ENTITY_TYPES.REFINERY]: {
        name: 'Refinery',
        cost: { minerals: 75 },
        buildTime: 30,
        health: 500,
        armor: 1,
        width: 2,
        height: 1,
        requiresGeyser: true,
    },
};

const UNITS = {
    [ENTITY_TYPES.SCV]: {
        name: 'SCV',
        cost: { minerals: 50 },
        buildTime: 22,
        supplyCost: 1,
        health: 45,
        armor: 0,
        mineralsPerTrip: 10,
        miningTimeSeconds: 2.5,
        moveSpeed: 8,
    },
    [ENTITY_TYPES.MARINE]: {
        name: 'Marine',
        cost: { minerals: 50, vespene: 0 },
        buildTime: 24,
        supplyCost: 1,
        health: 45,
        armor: 0,
        damage: 6,
        attackRange: 5,
        attackCooldown: 0.61,
        moveSpeed: 3.15,
        sightRange: 9,
    },
};

const RESOURCE_NODES = {
    [ENTITY_TYPES.MINERAL_PATCH]: {
        minerals: 1500,
        width: 1,
        height: 1,
    },
    [ENTITY_TYPES.VESPENE_GEYSER]: {
        vespene: 5000,
        width: 1,
        height: 1,
    },
};
