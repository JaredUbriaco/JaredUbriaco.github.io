/**
 * Main game loop and orchestration.
 */

(function() {
    const canvas = document.getElementById('game-canvas');
    const state = createInitialState();
    let lastTime = 0;
    let accumulated = 0;
    let paused = false;
    let speedIndex = 0;
    const SPEEDS = [1, 2, 4];
    let ui = null;
    let aiCooldown = 0;

    function resizeCanvas() {
        const main = document.querySelector('.game-main');
        if (!main) return;
        canvas.width = main.clientWidth - 200;
        canvas.height = main.clientHeight;
    }

    function getEntityAtScreen(canvasX, canvasY) {
        const offset = getRenderOffset();
        const worldClick = screenToWorld(canvasX - offset.x, canvasY - offset.y, 0, 0);
        const clickGridX = worldClick.gridX;
        const clickGridY = worldClick.gridY;
        const SELECT_RADIUS = 14;

        const selectable = state.entities
            .filter(e => e.type !== ENTITY_TYPES.MINERAL_PATCH && e.type !== ENTITY_TYPES.VESPENE_GEYSER)
            .sort((a, b) => {
                const ad = (a.gridX || 0) + (a.gridY || 0) + ((a.width || 1) / 2) + ((a.height || 1) / 2);
                const bd = (b.gridX || 0) + (b.gridY || 0) + ((b.width || 1) / 2) + ((b.height || 1) / 2);
                return bd - ad;
            });
        for (const e of selectable) {
            if (e.width && e.height) {
                if (clickGridX >= e.gridX && clickGridX < e.gridX + e.width &&
                    clickGridY >= e.gridY && clickGridY < e.gridY + e.height) {
                    return e;
                }
            } else if (e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE) {
                const screenPos = worldToScreen(e.gridX, e.gridY);
                const unitSx = screenPos.x + offset.x;
                const unitSy = screenPos.y + offset.y;
                const dist = Math.sqrt((canvasX - unitSx) ** 2 + (canvasY - unitSy) ** 2);
                if (dist <= SELECT_RADIUS) return e;
            }
        }
        for (const e of state.entities) {
            if (e.type === ENTITY_TYPES.MINERAL_PATCH || e.type === ENTITY_TYPES.VESPENE_GEYSER) {
                const screenPos = worldToScreen(e.gridX, e.gridY);
                const sx = screenPos.x + offset.x + CONFIG.TILE_WIDTH / 4;
                const sy = screenPos.y + offset.y + CONFIG.TILE_HEIGHT / 4;
                const dist = Math.sqrt((canvasX - sx) ** 2 + (canvasY - sy) ** 2);
                if (dist <= SELECT_RADIUS) return e;
            }
        }
        return null;
    }

    function getUnitsInBox(sx1, sy1, sx2, sy2) {
        const offset = getRenderOffset();
        const units = state.entities.filter(e =>
            e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE);
        const minX = Math.min(sx1, sx2);
        const maxX = Math.max(sx1, sx2);
        const minY = Math.min(sy1, sy2);
        const maxY = Math.max(sy1, sy2);
        return units.filter(e => {
            const screenPos = worldToScreen(e.gridX, e.gridY);
            const ux = screenPos.x + offset.x;
            const uy = screenPos.y + offset.y;
            return ux >= minX && ux <= maxX && uy >= minY && uy <= maxY;
        });
    }

    function buildUnit(building, unitType) {
        const def = BUILDINGS[building.type];
        if (!def || !def.produces || !def.produces.includes(unitType)) return false;
        const unitDef = UNITS[unitType];
        if (!canAfford(state.map, unitDef.cost)) return false;
        if (!hasSupplySpace(state.map, unitDef.supplyCost || 0)) return false;
        state.map.minerals -= unitDef.cost.minerals || 0;
        state.map.vespene -= unitDef.cost.vespene || 0;
        state.map.supply += unitDef.supplyCost || 0;
        building.buildQueue = building.buildQueue || [];
        building.buildQueue.push({
            type: unitType,
            buildTime: unitDef.buildTime,
            cost: unitDef.cost,
            supplyCost: unitDef.supplyCost || 0,
        });
        return true;
    }

    function togglePause() {
        paused = !paused;
        document.getElementById('btn-pause').textContent = paused ? '▶' : '⏸';
    }

    function cycleSpeed() {
        speedIndex = (speedIndex + 1) % SPEEDS.length;
        document.getElementById('btn-speed').textContent = SPEEDS[speedIndex] + 'x';
    }

    function tick(timestamp) {
        const delta = lastTime ? Math.min(timestamp - lastTime, 64) : 16;
        lastTime = timestamp;

        if (!paused) {
            const dt = delta * SPEEDS[speedIndex];
            accumulated += dt;

            while (accumulated >= 16) {
                accumulated -= 16;
                state.entities.forEach(e => updateEntity(e, state.entities, state.map, 16));
                aiCooldown++;
                if (aiCooldown >= 30) {
                    aiCooldown = 0;
                    runAIDecision(state.entities, state.map);
                }
            }
        }

        initRender(canvas);
        render(state, ui ? ui.getBoxSelect() : null);
        if (ui) {
            ui.updateResourceUI(state.map);
            ui.updateSelectionPanel();
        }

        if (checkWinCondition(state.entities, state.map)) {
            if (ui) ui.showWin();
            return;
        }

        requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    initRender(canvas);
    ui = initUI({
        state,
        getEntityAtScreen,
        getUnitsInBox,
        buildUnit,
        togglePause,
        cycleSpeed,
    });

    if (ui) ui.setStatus('Colony operational. Drag to select • Right-click to move • Alt+drag or middle-mouse to pan');

    requestAnimationFrame(tick);

    window.game = {
        get state() { return state; },
        getEntityAtScreen,
        getUnitsInBox,
        buildUnit,
        togglePause,
        cycleSpeed,
    };
})();
