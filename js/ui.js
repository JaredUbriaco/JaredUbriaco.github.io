/**
 * UI updates and input handling.
 */

let selectedEntities = [];
let gameInstance = null;
let boxSelectStart = null;
let boxSelectCurrent = null;
let lastWasBoxSelect = false;
let lastWasPan = false;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

function initUI(game) {
    gameInstance = game;
    const canvas = document.getElementById('game-canvas');
    const panel = document.getElementById('selection-panel');
    const info = document.getElementById('selection-info');
    const buildMenu = document.getElementById('build-menu');
    const statusText = document.getElementById('status-text');
    const winOverlay = document.getElementById('win-overlay');
    const btnPause = document.getElementById('btn-pause');
    const btnSpeed = document.getElementById('btn-speed');

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function updateResourceUI(map) {
        document.getElementById('minerals').textContent = Math.floor(map.minerals);
        document.getElementById('vespene').textContent = Math.floor(map.vespene);
        document.getElementById('supply').textContent = `${map.supply}/${map.supplyCap}`;
    }

    function updateSelectionPanel() {
        if (selectedEntities.length === 0) {
            info.textContent = '—';
            buildMenu.innerHTML = '';
            return;
        }
        const first = selectedEntities[0];
        const units = selectedEntities.filter(e =>
            e.type === ENTITY_TYPES.SCV || e.type === ENTITY_TYPES.MARINE);
        const buildings = selectedEntities.filter(e =>
            BUILDINGS[e.type]);

        if (units.length === selectedEntities.length && units.length > 1) {
            const scvCount = units.filter(u => u.type === ENTITY_TYPES.SCV).length;
            const marineCount = units.filter(u => u.type === ENTITY_TYPES.MARINE).length;
            const parts = [];
            if (scvCount) parts.push(`${scvCount} SCV${scvCount > 1 ? 's' : ''}`);
            if (marineCount) parts.push(`${marineCount} Marine${marineCount > 1 ? 's' : ''}`);
            info.textContent = parts.join(', ');
        } else if (first.type === ENTITY_TYPES.SCV || first.type === ENTITY_TYPES.MARINE) {
            info.textContent = UNITS[first.type].name;
        } else if (BUILDINGS[first.type]) {
            info.textContent = BUILDINGS[first.type].name;
        } else {
            info.textContent = first.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        buildMenu.innerHTML = '';
        if (buildings.length === 1 && buildings[0].buildProgress >= 100) {
            const def = BUILDINGS[buildings[0].type];
            if (def && def.produces) {
                def.produces.forEach(unitType => {
                    const unitDef = UNITS[unitType];
                    if (!unitDef) return;
                    const cost = unitDef.cost;
                    const canAfford = gameInstance && canAfford(gameInstance.state.map, cost);
                    const hasSupply = gameInstance && hasSupplySpace(gameInstance.state.map, unitDef.supplyCost || 0);
                    const btn = document.createElement('button');
                    btn.className = 'build-btn';
                    btn.textContent = `${unitDef.name} (${cost.minerals}M)`;
                    btn.disabled = !canAfford || !hasSupply;
                    btn.onclick = () => {
                        if (gameInstance && canAfford && hasSupply) {
                            gameInstance.buildUnit(buildings[0], unitType);
                            updateSelectionPanel();
                        }
                    };
                    buildMenu.appendChild(btn);
                });
            }
        } else if (units.length > 0) {
            const hint = document.createElement('div');
            hint.className = 'panel-title';
            hint.style.marginTop = '0.5rem';
            hint.textContent = 'Right-click to move';
            hint.style.color = 'var(--text-muted)';
            hint.style.fontSize = '0.7rem';
            buildMenu.appendChild(hint);
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        const pos = getCanvasCoords(e);
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            isPanning = true;
            panStartX = e.clientX - camera.x;
            panStartY = e.clientY - camera.y;
        } else if (e.button === 0 && !e.altKey) {
            boxSelectStart = { x: pos.x, y: pos.y };
            boxSelectCurrent = null;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const pos = getCanvasCoords(e);
        if (isPanning && (e.buttons === 4 || (e.buttons === 1 && e.altKey))) {
            camera.x = e.clientX - panStartX;
            camera.y = e.clientY - panStartY;
        } else if (boxSelectStart && e.buttons === 1 && !e.altKey) {
            boxSelectCurrent = { x: pos.x, y: pos.y };
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 1 || isPanning) {
            if (isPanning) lastWasPan = true;
            isPanning = false;
            if (e.button === 1) return;
        }
        if (e.button === 0 && boxSelectStart) {
            const pos = getCanvasCoords(e);
            const dx = Math.abs(pos.x - boxSelectStart.x);
            const dy = Math.abs(pos.y - boxSelectStart.y);
            if (dx > 5 || dy > 5) {
                lastWasBoxSelect = true;
                const units = gameInstance.getUnitsInBox(
                    boxSelectStart.x, boxSelectStart.y,
                    pos.x, pos.y);
                gameInstance.state.entities.forEach(entity => {
                    entity.selected = units.includes(entity);
                });
                selectedEntities = units;
                updateSelectionPanel();
            }
            boxSelectStart = null;
            boxSelectCurrent = null;
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        boxSelectStart = null;
        boxSelectCurrent = null;
    });

    canvas.addEventListener('click', (e) => {
        if (!gameInstance || e.button !== 0) return;
        if (lastWasBoxSelect || lastWasPan) {
            lastWasBoxSelect = false;
            lastWasPan = false;
            return;
        }
        const pos = getCanvasCoords(e);
        const dx = boxSelectStart ? Math.abs(pos.x - boxSelectStart.x) : 0;
        const dy = boxSelectStart ? Math.abs(pos.y - boxSelectStart.y) : 0;
        if ((boxSelectStart && (dx > 5 || dy > 5))) return;

        const entity = gameInstance.getEntityAtScreen(pos.x, pos.y);
        gameInstance.state.entities.forEach(en => { en.selected = false; });
        if (entity) {
            entity.selected = true;
            selectedEntities = [entity];
        } else {
            selectedEntities = [];
        }
        updateSelectionPanel();
    });

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!gameInstance) return;
        const pos = getCanvasCoords(e);
        const offset = getRenderOffset();
        const { gridX, gridY } = screenToWorld(pos.x - offset.x, pos.y - offset.y, 0, 0);

        const movableUnits = selectedEntities.filter(u =>
            u.type === ENTITY_TYPES.SCV || u.type === ENTITY_TYPES.MARINE);
        movableUnits.forEach(u => {
            u.targetX = gridX;
            u.targetY = gridY;
            u.state = 'moving';
        });
    });

    btnPause.addEventListener('click', () => {
        if (gameInstance) gameInstance.togglePause();
    });

    btnSpeed.addEventListener('click', () => {
        if (gameInstance) gameInstance.cycleSpeed();
    });

    window.uiState = {
        boxSelectStart,
        boxSelectCurrent: () => boxSelectCurrent,
        setBoxSelectCurrent: (v) => { boxSelectCurrent = v; },
    };

    return {
        updateResourceUI,
        updateSelectionPanel,
        setStatus: (text) => { statusText.textContent = text; },
        showWin: () => { winOverlay.classList.remove('hidden'); },
        getBoxSelect: () => ({ start: boxSelectStart, current: boxSelectCurrent }),
    };
}
