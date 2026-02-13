/**
 * UI updates and input handling.
 */

let selectedEntity = null;
let gameInstance = null;

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

    canvas.addEventListener('click', (e) => {
        if (!gameInstance) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const ox = getRenderOffset().x;
        const oy = getRenderOffset().y;
        const { gridX, gridY } = screenToWorld(cx - ox, cy - oy, 0, 0);

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

function getRenderOffset() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return { x: 0, y: 0 };
    const mapPixelW = (CONFIG.MAP_COLS + CONFIG.MAP_ROWS) * (CONFIG.TILE_WIDTH / 2);
    const mapPixelH = (CONFIG.MAP_COLS + CONFIG.MAP_ROWS) * (CONFIG.TILE_HEIGHT / 2);
    return {
        x: (canvas.width - mapPixelW) / 2,
        y: 40,
    };
}
