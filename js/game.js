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

    function getEntityAt(gridX, gridY) {
        for (let i = state.entities.length - 1; i >= 0; i--) {
            const e = state.entities[i];
            const w = e.width || 1;
            const h = e.height || 1;
            if (gridX >= e.gridX && gridX < e.gridX + w && gridY >= e.gridY && gridY < e.gridY + h) {
                return e;
            }
            if (!e.width && e.gridX === Math.floor(gridX) && e.gridY === Math.floor(gridY)) {
                return e;
            }
        }
        return null;
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
        render(state);
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
        getEntityAt,
        buildUnit,
        togglePause,
        cycleSpeed,
    });

    if (ui) ui.setStatus('Colony operational. SCVs gathering minerals.');

    requestAnimationFrame(tick);

    window.game = {
        get state() { return state; },
        getEntityAt,
        buildUnit,
        togglePause,
        cycleSpeed,
    };
})();
