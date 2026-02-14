/**
 * Isometric rendering. Programmatic shapes, sprite-ready.
 */

const COLORS = {
    grid: 'rgba(88, 166, 255, 0.08)',
    mineral: '#58a6ff',
    mineralDepleted: '#30363d',
    vespene: '#3fb950',
    commandCenter: '#8b949e',
    commandCenterAccent: '#58a6ff',
    barracks: '#6e7681',
    supplyDepot: '#484f58',
    scv: '#d29922',
    marine: '#a371f7',
    selection: 'rgba(88, 166, 255, 0.6)',
    buildingConstruct: 'rgba(210, 153, 34, 0.4)',
};

let canvas, ctx;

const camera = window.camera = {
    x: 0,
    y: 0,
};

function initRender(c) {
    canvas = c;
    ctx = c.getContext('2d');
}

function getRenderOffset() {
    const baseScreen = worldToScreen(CONFIG.MAP_COLS / 2 - 0.5, CONFIG.MAP_ROWS / 2 - 0.5);
    return {
        x: (canvas.width / 2) + camera.x - baseScreen.x,
        y: (canvas.height / 2) + camera.y - baseScreen.y,
    };
}

function drawIsometricTile(gridX, gridY, color, ox, oy) {
    const { x, y } = worldToScreen(gridX, gridY);
    const sx = x + ox;
    const sy = y + oy;
    const tw = CONFIG.TILE_WIDTH;
    const th = CONFIG.TILE_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(sx, sy + th / 2);
    ctx.lineTo(sx + tw / 2, sy);
    ctx.lineTo(sx + tw, sy + th / 2);
    ctx.lineTo(sx + tw / 2, sy + th);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawMineralPatch(entity, ox, oy) {
    const { x, y } = worldToScreen(entity.gridX, entity.gridY);
    const sx = x + ox + CONFIG.TILE_WIDTH / 4;
    const sy = y + oy + CONFIG.TILE_HEIGHT / 4;
    const remaining = entity.minerals / 1500;
    ctx.fillStyle = remaining > 0 ? COLORS.mineral : COLORS.mineralDepleted;
    ctx.globalAlpha = 0.6 + remaining * 0.4;
    ctx.beginPath();
    ctx.arc(sx, sy, CONFIG.TILE_WIDTH / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawBuilding(entity, ox, oy) {
    const def = BUILDINGS[entity.type];
    if (!def) return;
    const w = (def.width || 1) * (CONFIG.TILE_WIDTH / 2);
    const h = (def.height || 1) * (CONFIG.TILE_HEIGHT / 2);
    const { x, y } = worldToScreen(entity.gridX + (def.width || 1) / 2, entity.gridY + (def.height || 1) / 2);
    const sx = x + ox - w / 2;
    const sy = y + oy - h / 2;

    let fill = COLORS.commandCenter;
    if (entity.type === ENTITY_TYPES.BARRACKS) fill = COLORS.barracks;
    if (entity.type === ENTITY_TYPES.SUPPLY_DEPOT) fill = COLORS.supplyDepot;
    if (entity.type === ENTITY_TYPES.REFINERY) fill = COLORS.vespene;

    if (entity.buildProgress < 100) {
        ctx.fillStyle = COLORS.buildingConstruct;
        ctx.fillRect(sx, sy, w, h);
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(sx, sy, w * (entity.buildProgress / 100), h);
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = fill;
        ctx.fillRect(sx, sy, w, h);
        ctx.strokeStyle = COLORS.commandCenterAccent;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, w, h);
    }

    if (entity.selected) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 2, sy - 2, w + 4, h + 4);
    }
}

function drawSCV(entity, ox, oy) {
    const { x, y } = worldToScreen(entity.gridX, entity.gridY);
    const sx = x + ox;
    const sy = y + oy;
    ctx.fillStyle = entity.state === 'mining' ? '#f0883e' : COLORS.scv;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    if (entity.state === 'mining') {
        const p = (entity.miningProgress || 0) / (UNITS[ENTITY_TYPES.SCV].miningTimeSeconds || 2);
        ctx.fillStyle = COLORS.mineral;
        ctx.globalAlpha = 0.5 + p * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    if (entity.state === 'returning') {
        ctx.fillStyle = COLORS.mineral;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    if (entity.selected) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawMarine(entity, ox, oy) {
    const { x, y } = worldToScreen(entity.gridX, entity.gridY);
    const sx = x + ox;
    const sy = y + oy;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = COLORS.marine;
    ctx.fillRect(-4, -3, 8, 6);
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(4, -1, 6, 2);
    ctx.restore();
    if (entity.selected) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 6, sy - 5, 16, 10);
    }
}

function isExplored(explored, gridX, gridY, width, height) {
    if (!explored) return true;
    const w = width || 1;
    const h = height || 1;
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const gx = Math.floor(gridX) + dx;
            const gy = Math.floor(gridY) + dy;
            if (gy >= 0 && gy < explored.length && gx >= 0 && gx < (explored[0] || []).length && explored[gy][gx]) {
                return true;
            }
        }
    }
    return false;
}

function render(state, selectionBox) {
    if (!canvas || !ctx) return;
    const { entities, explored } = state;
    const ox = getRenderOffset().x;
    const oy = getRenderOffset().y;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectionBox && selectionBox.start && selectionBox.current) {
        const x = Math.min(selectionBox.start.x, selectionBox.current.x);
        const y = Math.min(selectionBox.start.y, selectionBox.current.y);
        const w = Math.abs(selectionBox.current.x - selectionBox.start.x);
        const h = Math.abs(selectionBox.current.y - selectionBox.start.y);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(88, 166, 255, 0.1)';
        ctx.fillRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    for (let row = 0; row < CONFIG.MAP_ROWS; row++) {
        for (let col = 0; col < CONFIG.MAP_COLS; col++) {
            if (explored && !explored[row][col]) {
                drawIsometricTile(col, row, 'rgba(0,0,0,0.92)', ox, oy);
            } else {
                drawIsometricTile(col, row, COLORS.grid, ox, oy);
            }
        }
    }

    const drawOrder = entities
        .filter(e => {
            if (e.type === ENTITY_TYPES.MINERAL_PATCH || e.type === ENTITY_TYPES.VESPENE_GEYSER) return false;
            return isExplored(explored, e.gridX, e.gridY, e.width, e.height);
        })
        .sort((a, b) => {
            const ax = a.gridX + ((a.width || 1) / 2);
            const ay = a.gridY + ((a.height || 1) / 2);
            const bx = b.gridX + ((b.width || 1) / 2);
            const by = b.gridY + ((b.height || 1) / 2);
            return (ax + ay) - (bx + by);
        });

    entities.filter(e => e.type === ENTITY_TYPES.MINERAL_PATCH && isExplored(explored, e.gridX, e.gridY, 1, 1))
        .forEach(e => drawMineralPatch(e, ox, oy));

    drawOrder.forEach(e => {
        if (e.type === ENTITY_TYPES.COMMAND_CENTER || e.type === ENTITY_TYPES.BARRACKS ||
            e.type === ENTITY_TYPES.SUPPLY_DEPOT || e.type === ENTITY_TYPES.REFINERY) {
            drawBuilding(e, ox, oy);
        } else if (e.type === ENTITY_TYPES.SCV) {
            drawSCV(e, ox, oy);
        } else if (e.type === ENTITY_TYPES.MARINE) {
            drawMarine(e, ox, oy);
        }
    });
}
