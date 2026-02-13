/**
 * UI updates and input handling.
 */

let selectedEntity = null;
let gameInstance = null;

function initUI(game) {
    gameInstance = game;
    const canvas = document.getElementById('game-canvas');
    let isDragging = false;
    let didDrag = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    const panel = document.getElementById('selection-panel');
    const info = document.getElementById('selection-info');
    const buildMenu = document.getElementById('build-menu');
    const statusText = document.getElementById('status-text');
    const winOverlay = document.getElementById('win-overlay');
    const btnPause = document.getElementById('btn-pause');
    const btnSpeed = document.getElementById('btn-speed');

    function updateResourceUI(map) {
        document.getElementById('minerals').textContent = Math.floor(map.minerals);
        document.getElementById('vespene').textContent = Math.floor(map.vespene);
        document.getElementById('supply').textContent = `${map.supply}/${map.supplyCap}`;
    }

    function updateSelectionPanel() {
        if (!selectedEntity) {
            info.textContent = '—';
            buildMenu.innerHTML = '';
            return;
        }
        const e = selectedEntity;
        let name = e.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (UNITS[e.type]) name = UNITS[e.type].name;
        if (BUILDINGS[e.type]) name = BUILDINGS[e.type].name;
        info.textContent = name;

        buildMenu.innerHTML = '';
        const def = BUILDINGS[e.type];
        if (def && def.produces && e.buildProgress >= 100) {
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
                        gameInstance.buildUnit(e, unitType);
                        updateSelectionPanel();
                    }
                };
                buildMenu.appendChild(btn);
            });
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            isDragging = true;
            didDrag = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && e.buttons === 1) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
            camera.x += dx;
            camera.y += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    canvas.addEventListener('click', (e) => {
        if (didDrag) {
            didDrag = false;
            return;
        }
        if (!gameInstance) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const offset = getRenderOffset();
        const { gridX, gridY } = screenToWorld(cx - offset.x, cy - offset.y, 0, 0);

        if (e.button === 2) {
            if (selectedEntity && (selectedEntity.type === ENTITY_TYPES.SCV || selectedEntity.type === ENTITY_TYPES.MARINE)) {
                selectedEntity.targetX = gridX;
                selectedEntity.targetY = gridY;
                selectedEntity.state = 'moving';
            }
            return;
        }
        selectedEntity = gameInstance.getEntityAt(gridX, gridY);
        gameInstance.state.entities.forEach(entity => entity.selected = entity === selectedEntity);
        updateSelectionPanel();
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    btnPause.addEventListener('click', () => {
        if (gameInstance) gameInstance.togglePause();
    });

    btnSpeed.addEventListener('click', () => {
        if (gameInstance) gameInstance.cycleSpeed();
    });

    return {
        updateResourceUI,
        updateSelectionPanel,
        setStatus: (text) => { statusText.textContent = text; },
        showWin: () => { winOverlay.classList.remove('hidden'); },
    };
}
