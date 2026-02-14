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
    const SPEEDS = [0.5, 1, 2];
    let ui = null;
    let aiCooldown = 0;

    function resizeCanvas() {
        const main = document.querySelector('.game-main');
        if (!main) return;
        canvas.width = main.clientWidth - 200;
        canvas.height = main.clientHeight;
    }

    function getEntityAtScreen(canvasX, canvasY) {
        const draw = canvasToDrawingCoords(canvasX, canvasY);
        const drawX = draw.x;
        const drawY = draw.y;
        const offset = getRenderOffset();
        const worldClick = screenToWorld(drawX - offset.x, drawY - offset.y, 0, 0);
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
                const dist = Math.sqrt((drawX - unitSx) ** 2 + (drawY - unitSy) ** 2);
                if (dist <= SELECT_RADIUS) return e;
            }
        }
        for (const e of state.entities) {
            if (e.type === ENTITY_TYPES.MINERAL_PATCH || e.type === ENTITY_TYPES.VESPENE_GEYSER) {
                const screenPos = worldToScreen(e.gridX, e.gridY);
                const sx = screenPos.x + offset.x + CONFIG.TILE_WIDTH / 4;
                const sy = screenPos.y + offset.y + CONFIG.TILE_HEIGHT / 4;
                const dist = Math.sqrt((drawX - sx) ** 2 + (drawY - sy) ** 2);
                if (dist <= SELECT_RADIUS) return e;
            }
        }
        return null;
    }

    function getUnitsInBox(sx1, sy1, sx2, sy2) {
        const d1 = canvasToDrawingCoords(sx1, sy1);
        const d2 = canvasToDrawingCoords(sx2, sy2);
        const offset = getRenderOffset();
        const units = state.entities.filter(e =>
            (e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE) && !e.faction);
        const minX = Math.min(d1.x, d2.x);
        const maxX = Math.max(d1.x, d2.x);
        const minY = Math.min(d1.y, d2.y);
        const maxY = Math.max(d1.y, d2.y);
        return units.filter(e => {
            const screenPos = worldToScreen(e.gridX, e.gridY);
            const ux = screenPos.x + offset.x;
            const uy = screenPos.y + offset.y;
            return ux >= minX && ux <= maxX && uy >= minY && uy <= maxY;
        });
    }

    function buildBuilding(buildingType) {
        const result = tryBuild(state.entities, state.map, buildingType);
        return !!result;
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
                state.entities.forEach(e => updateEntity(e, state.entities, state.map, 16, state.enemyMap));
                processDeaths(state.entities, state.map, state.enemyMap);
                updateExplored(state.entities, state.explored);
                aiCooldown++;
                if (aiCooldown >= 15) {
                    aiCooldown = 0;
                    runAIDecision(state.entities, state.map);
                    runEnemyAIDecision(state.entities, state.enemyMap);
                }
            }
        }

        initRender(canvas);
        render(state, ui ? ui.getBoxSelect() : null);
        if (ui) {
            ui.updateResourceUI(state.map);
            ui.updateSelectionPanel();
        }

        const winner = checkWinCondition(state.entities, state.map);
        if (winner) {
            if (ui) ui.showWin(winner);
            return;
        }

        requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (!state.enemyMap) state.enemyMap = { minerals: 0, supply: 6, supplyCap: 11 };
    if (!state.explored) {
        state.explored = [];
        for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
            state.explored[r] = [];
            for (let c = 0; c < CONFIG.MAP_COLS; c++) state.explored[r][c] = false;
        }
    }
    initRender(canvas);
    ui = initUI({
        state,
        getEntityAtScreen,
        getUnitsInBox,
        buildUnit,
        buildBuilding,
        togglePause,
        cycleSpeed,
    });

    if (ui) ui.setStatus('Scroll to zoom • Drag to select • Right-click to move • Alt+drag to pan • Red = enemy colony');

    requestAnimationFrame(tick);

    window.game = {
        get state() { return state; },
        getEntityAtScreen,
        getUnitsInBox,
        buildUnit,
        buildBuilding,
        togglePause,
        cycleSpeed,
    };
})();
