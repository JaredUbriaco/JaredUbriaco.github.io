/**
 * Game constants and entity definitions.
 * Sprite-ready: entity types map to future sprite keys.
 */

const CONFIG = {
    TILE_WIDTH: 64,
    TILE_HEIGHT: 32,
    MAP_COLS: 40,
    MAP_ROWS: 40,
    WIN_CONDITION: {
        totalUnits: 20,
        totalBuildings: 4,
        mineralsCollected: 2000,
    },
};

// Build order thresholds (SC2-style)
const BUILD_ORDER = {
    SUPPLY_DEPOT_WHEN_SUPPLY_USED: 10,   // Build depot when supply at/near cap (10-12 used)
    SCVS_MIN_FOR_DEPOT: 10,              // Minimum SCVs before depot allowed
    SCVS_TARGET_BEFORE_DEPOT: 12,        // Aim for 10-12 SCVs before first depot
    SCVS_BEFORE_BARRACKS: 13,            // 13-15 SCVs before barracks
    SCVS_IDEAL_SINGLE_BASE: 22,          // 16 minerals + 6 gas per base (gas not implemented)
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
        width: 3,
        height: 2,
        produces: [ENTITY_TYPES.SCV],
        builds: [ENTITY_TYPES.SUPPLY_DEPOT, ENTITY_TYPES.BARRACKS],
    },
    [ENTITY_TYPES.BARRACKS]: {
        name: 'Barracks',
        cost: { minerals: 150 },
        buildTime: 46,
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
        width: 2,
        height: 1,
    },
    [ENTITY_TYPES.REFINERY]: {
        name: 'Refinery',
        cost: { minerals: 75 },
        buildTime: 30,
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
        mineralsPerTrip: 10,
        miningTimeSeconds: 2.5,
        moveSpeed: 8,
    },
    [ENTITY_TYPES.MARINE]: {
        name: 'Marine',
        cost: { minerals: 50, vespene: 0 },
        buildTime: 24,
        supplyCost: 1,
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
