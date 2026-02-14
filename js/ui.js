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

        if (first.faction === 'enemy') {
            let name = first.type === ENTITY_TYPES.SCV || first.type === ENTITY_TYPES.MARINE
                ? UNITS[first.type].name : BUILDINGS[first.type] ? BUILDINGS[first.type].name
                : first.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            info.textContent = `Enemy ${name}`;
        } else if (units.length === selectedEntities.length && units.length > 1) {
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
        if (first.faction === 'enemy') {
            const hint = document.createElement('div');
            hint.className = 'panel-title';
            hint.style.marginTop = '0.5rem';
            hint.textContent = 'View only — cannot control';
            hint.style.color = 'var(--text-muted)';
            hint.style.fontSize = '0.7rem';
            buildMenu.appendChild(hint);
        } else if (buildings.length === 1 && buildings[0].buildProgress >= 100 && !buildings[0].faction) {
            const def = BUILDINGS[buildings[0].type];
            const map = gameInstance ? gameInstance.state.map : null;

            if (def && def.produces) {
                def.produces.forEach(unitType => {
                    const unitDef = UNITS[unitType];
                    if (!unitDef) return;
                    const cost = unitDef.cost;
                    const affordable = map && canAfford(map, cost);
                    const hasSupply = map && hasSupplySpace(map, unitDef.supplyCost || 0);
                    const btn = document.createElement('button');
                    btn.className = 'build-btn';
                    btn.textContent = `${unitDef.name} (${cost.minerals}M)`;
                    btn.disabled = !affordable || !hasSupply;
                    btn.onclick = () => {
                        if (gameInstance && canAfford(gameInstance.state.map, cost) && hasSupplySpace(gameInstance.state.map, unitDef.supplyCost || 0)) {
                            gameInstance.buildUnit(buildings[0], unitType);
                            updateSelectionPanel();
                        }
                    };
                    buildMenu.appendChild(btn);
                });
            }
            if (def && def.builds) {
                def.builds.forEach(buildingType => {
                    const bdef = BUILDINGS[buildingType];
                    if (!bdef) return;
                    const hasRequired = !bdef.requires || gameInstance.state.entities.some(e => e.type === bdef.requires);
                    const affordable = map && canAfford(map, bdef.cost);
                    const btn = document.createElement('button');
                    btn.className = 'build-btn';
                    btn.textContent = `${bdef.name} (${bdef.cost.minerals}M)`;
                    btn.disabled = !affordable || !hasRequired;
                    btn.onclick = () => {
                        if (gameInstance && hasRequired && canAfford(gameInstance.state.map, bdef.cost)) {
                            gameInstance.buildBuilding(buildingType);
                            updateSelectionPanel();
                        }
                    };
                    buildMenu.appendChild(btn);
                });
            }
        } else if (units.length > 0 && !first.faction) {
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

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom + delta));
    }, { passive: false });

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
        if (!gameInstance || selectedEntities.length === 0) return;
        const pos = getCanvasCoords(e);
        const clickedEntity = gameInstance.getEntityAtScreen(pos.x, pos.y);
        const draw = canvasToDrawingCoords(pos.x, pos.y);
        const offset = getRenderOffset();
        const { gridX, gridY } = screenToWorld(draw.x - offset.x, draw.y - offset.y, 0, 0);

        const movableUnits = selectedEntities.filter(u =>
            (u.type === ENTITY_TYPES.SCV || u.type === ENTITY_TYPES.MARINE) && !u.faction);

        if (clickedEntity && clickedEntity.type === ENTITY_TYPES.MINERAL_PATCH &&
            clickedEntity.minerals >= (UNITS[ENTITY_TYPES.SCV].mineralsPerTrip || 5)) {
            movableUnits.filter(u => u.type === ENTITY_TYPES.SCV).forEach(u => {
                if (u.state === 'mining' && u.targetId) {
                    const patch = gameInstance.state.entities.find(e => e.id === u.targetId);
                    if (patch) patch.minerals += UNITS[ENTITY_TYPES.SCV].mineralsPerTrip || 5;
                }
                u.targetId = clickedEntity.id;
                u.targetX = null;
                u.targetY = null;
                u.miningProgress = 0;
                u.state = 'moving_to_mineral';
            });
            movableUnits.filter(u => u.type === ENTITY_TYPES.MARINE).forEach(u => {
                u.targetX = gridX;
                u.targetY = gridY;
                u.state = 'moving';
            });
        } else {
            movableUnits.forEach(u => {
                u.targetId = null;
                u.targetX = gridX;
                u.targetY = gridY;
                u.state = 'moving';
            });
        }
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
        showWin: (winner) => {
            const h2 = winOverlay.querySelector('h2');
            const p = winOverlay.querySelector('p');
            if (winner === 'player') {
                if (h2) h2.textContent = 'VICTORY';
                if (p) p.textContent = 'Enemy eliminated.';
            } else if (winner === 'enemy') {
                if (h2) h2.textContent = 'DEFEAT';
                if (p) p.textContent = 'Your forces have been destroyed.';
            } else {
                if (h2) h2.textContent = 'GAME OVER';
                if (p) p.textContent = 'No victor.';
            }
            winOverlay.classList.remove('hidden');
        },
        getBoxSelect: () => ({ start: boxSelectStart, current: boxSelectCurrent }),
    };
}
