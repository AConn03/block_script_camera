// --- UI Helpers ---
function isMobile() { return window.innerWidth <= 768; }
function closeAllPanels() { palettePanel.classList.remove('open'); scriptsPanel.classList.remove('open'); sidebarOverlay.classList.remove('active'); }
function centerWorkspace() {
    if (workspaceViewport.clientWidth === 0) { setTimeout(centerWorkspace, 50); return; }
    // Updated to the new 50,000 center
    workspaceViewport.scrollLeft = 50000 * currentZoom - (workspaceViewport.clientWidth / 2);
    workspaceViewport.scrollTop = 50000 * currentZoom - (workspaceViewport.clientHeight / 2);
}

function setupDefaultGraph() {
    document.getElementById('nodes-container').innerHTML = ''; document.getElementById('ui-layer').innerHTML = ''; nodes = {}; wires = []; window.userVarNames = []; window.userVars = {};
    // Updated cx and cy to 50,000
    const cx = 50000, cy = 50000, cId = createNode('camera', cx - 250, cy - 100), sId = createNode('screen', cx + 50, cy - 100);
    wires.push({ id: generateId(), fromNode: cId, fromPort: 'video', toNode: sId, toPort: 'render' });
    rebuildGraphOrder(); drawWires(); activeScriptName = "Standard (Default)"; updateLabels(); centerWorkspace();
}


function showToast(msg, isError = false) {
    toastAlert.classList.add('show');
    toastAlert.style.background = isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(59, 130, 246, 0.95)';
    toastAlert.style.borderColor = isError ? '#ffb3b3' : '#93c5fd';
    toastAlert.textContent = msg;
    setTimeout(() => { toastAlert.classList.remove('show'); }, 4000);
}

document.getElementById('btn-toggle-palette').onclick = () => { palettePanel.classList.add('open'); sidebarOverlay.classList.add('active'); };
document.getElementById('btn-toggle-scripts').onclick = () => { scriptsPanel.classList.add('open'); sidebarOverlay.classList.add('active'); };
sidebarOverlay.onclick = closeAllPanels;

function setPendingPort(nodeId, port, isOut, element) { clearPendingPort(); pendingPort = { nodeId, port, isOut }; if (element) element.classList.add('pending'); }
function clearPendingPort() { if (pendingPort) { document.querySelectorAll('.port.pending').forEach(el => el.classList.remove('pending')); pendingPort = null; } }

window.updateSwatch = function(nodeId) {
    const swatch = document.getElementById(`swatch-${nodeId}`); if (!swatch) return;
    const node = nodes[nodeId]; if (!node) return;
    const h = parseFloat(node.params.target || 0), s = parseFloat(node.params.s_target !== undefined ? node.params.s_target : 50) / 100, v = parseFloat(node.params.v_target !== undefined ? node.params.v_target : 50) / 100;
    let r, g, b, i = Math.floor(h / 60), f = h / 60 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break; }
    swatch.style.background = `rgb(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`;
};

function renderParamUI(nodeId, paramId) {
    const node = nodes[nodeId], pui = document.getElementById(`pui-${nodeId}-${paramId}`), pDef = NODE_DEFS[node.type].params.find(p => p.id === paramId);
    if (!pui || !pDef) return;
    const boundVar = node.bindings && node.bindings[paramId], port = document.querySelector(`.param-port[data-node="${nodeId}"][data-port="${paramId}"]`);
    if (boundVar) {
        const safeName = getSafeVarName(boundVar);
        pui.innerHTML = `<div class="var-pill" data-varname="${boundVar}" data-node="${nodeId}" data-param="${paramId}">${boundVar} <span class="live-val-${safeName}">0</span></div>`;
        const pill = pui.querySelector('.var-pill');
        pill.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); node.bindings[paramId] = null; renderParamUI(nodeId, paramId); 
            const wsRect = workspaceInner.getBoundingClientRect(), x = (e.clientX - wsRect.left) / currentZoom, y = (e.clientY - wsRect.top) / currentZoom;
            const newNodeId = createNode('var_get', x - 50, y - 20, null, {varName: boundVar});
            draggedNode = newNodeId; const el = nodes[newNodeId].domElement; dragOffsetX = 50; dragOffsetY = 20; el.style.zIndex = 5; el.classList.add('drag-active');
            activePointers.set(e.pointerId, e); try { workspaceViewport.setPointerCapture(e.pointerId); } catch(err){}
        });
        if(port) port.style.display = 'none';
    } else {
        const val = node.params[paramId]; let inputHtml = '';
        if (pDef.type === 'range') inputHtml = `<input type="range" class="param-input" id="input-${nodeId}-${paramId}" min="${pDef.min}" max="${pDef.max}" value="${val}" oninput="updateParam('${nodeId}','${paramId}',this.value)">`;
        else if (pDef.type === 'number' || pDef.type === 'text') inputHtml = `<input type="${pDef.type}" class="param-input" id="input-${nodeId}-${paramId}" value="${val}" style="width: 100%; padding: 6px; background: #000; border: 1px solid #444; border-radius: 4px; color: white;" ${pDef.type==='number'?'onchange':'oninput'}="updateParam('${nodeId}','${paramId}',this.value)">`;
        else if (pDef.type === 'select' || pDef.type === 'var_select') {
            let opts = pDef.type === 'var_select' ? window.userVarNames : pDef.options;
            let optHtml = opts.map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('');
            inputHtml = `<select class="node-select param-input" id="input-${nodeId}-${paramId}" onchange="updateParam('${nodeId}','${paramId}',this.value)">${optHtml}</select>`;
        }
        pui.innerHTML = inputHtml; if(port) port.style.display = 'block';
    }
}

function createNode(type, x, y, restoredId = null, restoredParams = null, restoredBindings = null) {
    const def = NODE_DEFS[type]; if (!def) return null;
    const id = restoredId || generateId(), el = document.createElement('div'); el.className = 'node'; el.id = `node-${id}`; el.style.left = `${x}px`; el.style.top = `${y}px`;
    let bodyHtml = '', params = restoredParams || {}, headerLabel = def.label;

    if (type === 'var_get' && params.varName) {
        headerLabel = params.varName;
        bodyHtml += `<div style="text-align:center; font-size:16px; color:#3b82f6; font-weight:bold; padding-bottom: 5px;"><span class="live-val-${getSafeVarName(params.varName)}">0</span></div>`;
    }

    if (def.inPorts && (def.inPorts.length > 0 || def.outPorts.length > 0)) {
        const maxPorts = Math.max(def.inPorts.length, def.outPorts.length);
        for(let i=0; i<maxPorts; i++) {
            const inP = def.inPorts[i], outP = def.outPorts[i];
            bodyHtml += `<div class="port-row">
                ${inP ? `<div class="port port-in" data-node="${id}" data-port="${inP}"></div>` : ''}
                <div class="port-label" style="text-align:left;">${inP ? inP : ''}</div>
                <div class="port-label" style="text-align:right;">${outP ? outP : ''}</div>
                ${outP ? `<div class="port port-out" data-node="${id}" data-port="${outP}"></div>` : ''}
            </div>`;
        }
    }

    if (def.params) def.params.forEach(p => {
        const val = params[p.id] !== undefined ? params[p.id] : p.default; params[p.id] = val; 
        const isDrop = p.type === 'number' || p.type === 'range';
        bodyHtml += `<div class="param-group ${isDrop ? 'param-droppable' : ''}" data-node="${id}" data-param="${p.id}">
            <div class="port port-in param-port" data-node="${id}" data-port="${p.id}"></div>
            <div class="param-header"><span>${p.label}</span><span id="lbl-${id}-${p.id}" style="color:#3b82f6; font-family:monospace; font-size:10px; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; text-align:right;" title="${val}">${val}</span></div>
            <div class="param-ui" id="pui-${id}-${p.id}"></div>
        </div>`;
    });
    
    if (type === 'hsv_pass') bodyHtml += `<div class="param-group" style="margin-top: 8px;"><div style="font-size: 10px; color: #888; text-align: center; margin-bottom: 3px;">Target Color</div><div id="swatch-${id}" style="height: 24px; width: 100%; border-radius: 6px; border: 1px solid #444; background: #fff; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);"></div></div>`;

    el.innerHTML = `<div class="node-header">${headerLabel}<div class="node-actions">
        <button class="node-btn" onclick="duplicateNode('${id}')" title="Duplicate Node">⧉</button>
        <button class="node-btn delete" onclick="deleteNode('${id}')" title="Delete Node">✕</button></div></div><div class="node-body">${bodyHtml}</div>`;

    nodesContainer.appendChild(el); nodes[id] = { id, type, params, bindings: restoredBindings || {}, domElement: el, outputData: {} };
    if (def.params) def.params.forEach(p => renderParamUI(id, p.id));
    if (type === 'hsv_pass') updateSwatch(id);
    
    const header = el.querySelector('.node-header');
    header.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        draggedNode = id; const rect = el.getBoundingClientRect(); dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top; el.style.zIndex = 5; el.classList.add('drag-active');
    });

    el.querySelectorAll('.port').forEach(portEl => {
        portEl.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const isOut = portEl.classList.contains('port-out'), portName = portEl.dataset.port;
            if (pendingPort && pendingPort.isOut !== isOut && pendingPort.nodeId !== id) {
                const fromNode = pendingPort.isOut ? pendingPort.nodeId : id, fromPort = pendingPort.isOut ? pendingPort.port : portName;
                const toNode = pendingPort.isOut ? id : pendingPort.nodeId, toPort = pendingPort.isOut ? portName : pendingPort.port;
                wires = wires.filter(w => !(w.toNode === toNode && w.toPort === toPort)); 
                wires.push({ id: generateId(), fromNode, fromPort, toNode, toPort });
                clearPendingPort(); rebuildGraphOrder(); drawWires(); return;
            }
            let startDragNode = id, startDragPort = portName;
            if (!isOut) {
                const existingWireIdx = wires.findIndex(w => w.toNode === id && w.toPort === portName);
                if (existingWireIdx >= 0) {
                    const w = wires[existingWireIdx]; wires.splice(existingWireIdx, 1);
                    startDragNode = w.fromNode; startDragPort = w.fromPort;
                    rebuildGraphOrder(); drawWires();
                    const outPortEl = nodes[startDragNode].domElement.querySelector(`.port-out[data-port="${startDragPort}"]`);
                    setPendingPort(startDragNode, startDragPort, true, outPortEl);
                } else setPendingPort(id, portName, false, portEl);
            } else setPendingPort(id, portName, true, portEl);
            dragStartPos = { x: e.clientX, y: e.clientY }; startWireDrag(startDragNode, startDragPort, e.clientX, e.clientY);
        });
    });
    rebuildGraphOrder(); drawWires(); return id;
}

window.updateParam = function(nodeId, paramId, val) {
    if (nodes[nodeId]) { nodes[nodeId].params[paramId] = val; const lbl = document.getElementById(`lbl-${nodeId}-${paramId}`); if (lbl) lbl.textContent = val; if (nodes[nodeId].type === 'hsv_pass') updateSwatch(nodeId); }
};

window.deleteNode = function(id) {
    if (!nodes[id]) return; nodes[id].domElement.remove(); delete nodes[id];
    const uiBtn = document.getElementById(`uibtn-${id}`); if (uiBtn) uiBtn.remove();
    wires = wires.filter(w => w.fromNode !== id && w.toNode !== id); rebuildGraphOrder(); drawWires();
}

window.duplicateNode = function(id) {
    const node = nodes[id]; if (!node) return;
    const newX = parseInt(node.domElement.style.left) + 20, newY = parseInt(node.domElement.style.top) + 20;
    createNode(node.type, newX, newY, null, JSON.parse(JSON.stringify(node.params)), JSON.parse(JSON.stringify(node.bindings)));
};

function applyZoom(factor, cx, cy) {
    const oldZoom = currentZoom; let newZoom = Math.max(0.1, Math.min(currentZoom * factor, 3)); if (newZoom === oldZoom) return;
    const rect = workspaceViewport.getBoundingClientRect(), wsX = (workspaceViewport.scrollLeft + (cx - rect.left)) / oldZoom, wsY = (workspaceViewport.scrollTop + (cy - rect.top)) / oldZoom;
    currentZoom = newZoom; workspaceInner.style.transform = `scale(${currentZoom})`;
    workspaceViewport.scrollLeft = wsX * currentZoom - (cx - rect.left); workspaceViewport.scrollTop = wsY * currentZoom - (cy - rect.top); drawWires();
}
workspaceViewport.addEventListener('wheel', (e) => { e.preventDefault(); applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY); }, { passive: false });

// --- Global Pointer Tracking ---
window.addEventListener('pointerdown', (e) => { activePointers.set(e.pointerId, e); });
window.addEventListener('blur', () => {
    activePointers.clear(); lastPinchDist = null; isPanning = false; workspaceViewport.classList.remove('panning'); draggingWire = null; paletteDragItem = null;
    if (draggedNode && nodes[draggedNode]) { nodes[draggedNode].domElement.style.zIndex = 2; nodes[draggedNode].domElement.classList.remove('drag-active'); draggedNode = null; }
    drawWires();
});

workspaceViewport.addEventListener('pointerdown', (e) => {
    if (e.target === workspaceViewport || e.target === workspaceInner || e.target === wiresSvg) {
        if (selectedWire) { selectedWire = null; drawWires(); }
        isPanning = true; workspaceViewport.classList.add('panning'); try { workspaceViewport.setPointerCapture(e.pointerId); } catch(err){}
        panStartX = e.clientX; panStartY = e.clientY; panStartScrollLeft = workspaceViewport.scrollLeft; panStartScrollTop = workspaceViewport.scrollTop;
    }
});

function handlePointerRelease(e) {
    activePointers.delete(e.pointerId); if (activePointers.size < 2) lastPinchDist = null;
    if (paletteDragItem) {
        startDragFromPaletteActual(e, paletteDragItem.type, paletteDragItem.params, false); 
        if (draggedNode && nodes[draggedNode]) { nodes[draggedNode].domElement.style.zIndex = 2; nodes[draggedNode].domElement.classList.remove('drag-active'); draggedNode = null;}
        if (isPanning) { isPanning = false; workspaceViewport.classList.remove('panning'); try { workspaceViewport.releasePointerCapture(e.pointerId); } catch(err){} }
        paletteDragItem = null;
    }
    if (draggingWire) {
        const activeWire = wiresSvg.querySelector('.wire.active'); if(activeWire) activeWire.style.display = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY); if(activeWire) activeWire.style.display = '';
        let connected = false;
        if (target && target.classList.contains('port-in')) {
            const targetNodeId = target.dataset.node, targetPortName = target.dataset.port;
            if (draggingWire.fromNode !== targetNodeId) {
                wires = wires.filter(w => !(w.toNode === targetNodeId && w.toPort === targetPortName));
                wires.push({ id: generateId(), fromNode: draggingWire.fromNode, fromPort: draggingWire.fromPort, toNode: targetNodeId, toPort: targetPortName });
                rebuildGraphOrder(); clearPendingPort(); connected = true;
            }
        }
        if (!connected) { if (dragStartPos && Math.sqrt(Math.pow(e.clientX - dragStartPos.x, 2) + Math.pow(e.clientY - dragStartPos.y, 2)) > 15) clearPendingPort(); else if (!dragStartPos) clearPendingPort(); }
        draggingWire = null; drawWires();
    }
    if (draggedNode && nodes[draggedNode]) {
        if (nodes[draggedNode].type === 'var_get') {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY), droppable = targetEl ? targetEl.closest('.param-droppable') : null;
            if (droppable) {
                droppable.classList.remove('drag-over'); 
                const targetNodeId = droppable.dataset.node, targetParamId = droppable.dataset.param;
                wires = wires.filter(w => !(w.toNode === targetNodeId && w.toPort === targetParamId));
                if (!nodes[targetNodeId].bindings) nodes[targetNodeId].bindings = {}; 
                nodes[targetNodeId].bindings[targetParamId] = nodes[draggedNode].params.varName;
                renderParamUI(targetNodeId, targetParamId); 
                deleteNode(draggedNode); 
                draggedNode = null; 
                return; 
            }
        }
        nodes[draggedNode].domElement.style.zIndex = 2; nodes[draggedNode].domElement.classList.remove('drag-active'); draggedNode = null; 
    }
    if (isPanning) { isPanning = false; workspaceViewport.classList.remove('panning'); try { workspaceViewport.releasePointerCapture(e.pointerId); } catch(err){} }
}

window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && e.buttons === 0 && activePointers.has(e.pointerId)) { handlePointerRelease(e); return; }
    if(activePointers.has(e.pointerId)) activePointers.set(e.pointerId, e);

    if (paletteDragItem) {
        const dx = Math.abs(e.clientX - paletteDragItem.startX), dy = Math.abs(e.clientY - paletteDragItem.startY);
        if (dy > 10 && dx < dy) { paletteDragItem = null; } else if (dx > 10) { startDragFromPaletteActual(e, paletteDragItem.type, paletteDragItem.params, true); paletteDragItem = null; }
    }

    if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values()), dist = Math.sqrt(Math.pow(pts[0].clientX - pts[1].clientX, 2) + Math.pow(pts[0].clientY - pts[1].clientY, 2));
        if (lastPinchDist) applyZoom(dist / lastPinchDist, (pts[0].clientX + pts[1].clientX) / 2, (pts[0].clientY + pts[1].clientY) / 2);
        lastPinchDist = dist; isPanning = false; 
    } else if (isPanning && activePointers.size === 1) {
        workspaceViewport.scrollLeft = panStartScrollLeft - (e.clientX - panStartX); workspaceViewport.scrollTop = panStartScrollTop - (e.clientY - panStartY);
    }
    
    if (draggedNode && nodes[draggedNode]) {
        const el = nodes[draggedNode].domElement, wsRect = workspaceInner.getBoundingClientRect();
        el.style.left = `${Math.max(0, (e.clientX - dragOffsetX - wsRect.left) / currentZoom)}px`; el.style.top = `${Math.max(0, (e.clientY - dragOffsetY - wsRect.top) / currentZoom)}px`;
        if (nodes[draggedNode].type === 'var_get') {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY), droppable = targetEl ? targetEl.closest('.param-droppable') : null;
            document.querySelectorAll('.param-droppable.drag-over').forEach(el => el.classList.remove('drag-over'));
            if (droppable) droppable.classList.add('drag-over');
        }
        drawWires();
    }
    if (draggingWire) { draggingWire.mouseX = e.clientX; draggingWire.mouseY = e.clientY; requestAnimationFrame(drawWires); }
});

window.addEventListener('pointerup', handlePointerRelease);
window.addEventListener('pointercancel', handlePointerRelease);

// --- Init & Save/Load ---
function renderPalette(category) {
    const pal = document.getElementById('blocks-palette'); pal.innerHTML = '';
    if (category === 'Variables') {
        const createBtn = document.createElement('button'); createBtn.className = 'nav-btn'; createBtn.style.width = '100%'; createBtn.style.marginBottom = '10px'; createBtn.style.background = '#3b82f6'; createBtn.textContent = '+ Create Variable';
        createBtn.onclick = () => document.getElementById('var-modal').classList.add('active'); pal.appendChild(createBtn);
        const setB = document.createElement('div'); setB.className = 'palette-block special'; setB.innerHTML = `<span>Set Variable</span><span>+</span>`;
        setB.addEventListener('pointerdown', (e) => { paletteDragItem = { e, type: 'var_set', params: null, startX: e.clientX, startY: e.clientY }; }); pal.appendChild(setB);
        window.userVarNames.forEach(varName => {
            const b = document.createElement('div'); b.className = 'palette-block'; b.innerHTML = `<div style="display:flex; justify-content:space-between; width:100%;"><span>${varName}</span> <span class="live-val-${getSafeVarName(varName)}" style="color:#3b82f6; font-family:monospace;">0</span></div>`;
            b.addEventListener('pointerdown', (e) => { paletteDragItem = { e, type: 'var_get', params: {varName: varName}, startX: e.clientX, startY: e.clientY }; }); pal.appendChild(b);
        });
        return;
    }
    Object.keys(NODE_DEFS).forEach(k => {
        if (NODE_DEFS[k].category !== category || NODE_DEFS[k].hideInPalette) return;
        const b = document.createElement('div'); b.className = 'palette-block'; b.innerHTML = `<span>${NODE_DEFS[k].label}</span><span>+</span>`;
        b.addEventListener('pointerdown', (e) => { paletteDragItem = { e, type: k, params: null, startX: e.clientX, startY: e.clientY }; }); pal.appendChild(b);
    });
}

function startDragFromPaletteActual(e, type, params = null, capture = true) {
    if (isMobile()) closeAllPanels(); const wsRect = workspaceInner.getBoundingClientRect(), x = (e.clientX - wsRect.left) / currentZoom, y = (e.clientY - wsRect.top) / currentZoom;
    const newNodeId = createNode(type, x - 120, y - 20, null, params);
    if (newNodeId) { draggedNode = newNodeId; const el = nodes[newNodeId].domElement; dragOffsetX = 120 * currentZoom; dragOffsetY = 20 * currentZoom; el.style.zIndex = 5; el.classList.add('drag-active'); if (capture) { activePointers.set(e.pointerId, e); try { workspaceViewport.setPointerCapture(e.pointerId); } catch(err){} } }
}

document.getElementById('cancel-var').onclick = () => document.getElementById('var-modal').classList.remove('active');
document.getElementById('confirm-var').onclick = () => {
    const input = document.getElementById('var-name-input'), name = input.value.trim();
    if (name && !window.userVarNames.includes(name)) {
        window.userVarNames.push(name); window.userVars[name] = 0;
        document.querySelectorAll('select.node-select').forEach(select => {
            if(select.innerHTML.includes('value=""') || select.closest('.node').id.includes('var_set')) {
                const selVal = select.value; select.innerHTML = window.userVarNames.map(o => `<option value="${o}" ${selVal===o?'selected':''}>${o}</option>`).join(''); select.value = selVal || name;
            }
        });
        renderPalette('Variables');
    }
    input.value = ''; document.getElementById('var-modal').classList.remove('active');
};

function initBuilder() {
    const palTabs = document.getElementById('palette-tabs'), categories = ['I/O', 'Image Processing', 'Triggers', 'Variables', 'Math']; let activeCategory = 'Image Processing';
    categories.forEach(cat => {
        const btn = document.createElement('div'); btn.className = `palette-tab ${cat === activeCategory ? 'active' : ''}`; btn.textContent = cat;
        btn.onclick = () => { document.querySelectorAll('.palette-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); activeCategory = cat; renderPalette(cat); };
        palTabs.appendChild(btn);
    });
    renderPalette(activeCategory); loadStorage();
    const autosaved = safeGetStorage('vrcam_autosave');
    if (autosaved) {
        try { const parsed = JSON.parse(autosaved); if (parsed && parsed.graph && parsed.graph.nodes && parsed.graph.nodes.length > 0) loadGraphFromJSON(parsed.graph, parsed.name); else setupDefaultGraph(); } catch(e) { setupDefaultGraph(); }
    } else if (Object.keys(nodes).length === 0) setupDefaultGraph();

    setInterval(() => { if (Object.keys(nodes).length > 0) safeSetStorage('vrcam_autosave', JSON.stringify({ name: activeScriptName, graph: saveGraphToJSON() })); }, 3000);
    centerWorkspace();
}

function saveGraphToJSON() { return { userVarNames: window.userVarNames, wires: wires, nodes: Object.values(nodes).map(n => ({ id: n.id, type: n.type, params: n.params, bindings: n.bindings, x: parseInt(n.domElement.style.left), y: parseInt(n.domElement.style.top) })) }; }
function loadGraphFromJSON(data, name) {
    document.getElementById('nodes-container').innerHTML = ''; document.getElementById('ui-layer').innerHTML = ''; nodes = {}; wires = []; window.userVars = {}; window.userVarNames = data.userVarNames || []; window.userVarNames.forEach(n => window.userVars[n] = 0);
    data.nodes.forEach(n => createNode(n.type, n.x, n.y, n.id, n.params, n.bindings)); wires = data.wires.filter(w => nodes[w.fromNode] && nodes[w.toNode]); 
    activeScriptName = name; rebuildGraphOrder(); drawWires(); updateLabels();
    const activeTab = document.querySelector('.palette-tab.active'); if (activeTab) renderPalette(activeTab.textContent);
    const camNode = Object.values(nodes).find(n => n.type === 'camera');
    if(camNode) { workspaceViewport.scrollLeft = (parseInt(camNode.domElement.style.left) * currentZoom) - (isMobile()? 50 : 100); workspaceViewport.scrollTop = (parseInt(camNode.domElement.style.top) * currentZoom) - 100; }
    if (isMobile()) closeAllPanels();
}

function loadStorage() { try { const raw = safeGetStorage('vrcam_node_scripts'); if (raw) savedScripts = JSON.parse(raw); } catch(e) {} renderScriptList(); }
function saveStorage() { safeSetStorage('vrcam_node_scripts', JSON.stringify(savedScripts)); renderScriptList(); }
function renderScriptList() {
    const list = document.getElementById('saved-scripts-list'); list.innerHTML = '';
    savedScripts.forEach((s, idx) => {
        const item = document.createElement('div'); item.className = 'script-item'; item.innerHTML = `<span>${s.name}</span><button class="node-btn delete" onclick="deleteScript(${idx}, event)">✕</button>`;
        item.onclick = () => loadGraphFromJSON(s.graph, s.name); list.appendChild(item);
    });
}

window.deleteScript = function(idx, e) { e.stopPropagation(); savedScripts.splice(idx, 1); saveStorage(); };

document.getElementById('clear-script-btn').onclick = () => confirmActionModal.classList.add('active');
document.getElementById('cancel-confirm-action').onclick = () => confirmActionModal.classList.remove('active');
document.getElementById('execute-confirm-action').onclick = () => {
    confirmActionModal.classList.remove('active');
    safeRemoveStorage('vrcam_autosave'); setupDefaultGraph(); activeScriptName = "New Graph"; updateLabels(); if(isMobile()) closeAllPanels();
};

document.getElementById('save-script-btn').onclick = () => { modal.classList.add('active'); document.getElementById('save-script-name').value = activeScriptName.replace(' (Default)', ''); };
document.getElementById('cancel-save').onclick = () => modal.classList.remove('active');
document.getElementById('confirm-save').onclick = () => {
    const name = document.getElementById('save-script-name').value || 'My Graph', graph = saveGraphToJSON(), exIdx = savedScripts.findIndex(s => s.name === name);
    if (exIdx >= 0) savedScripts[exIdx].graph = graph; else savedScripts.push({ name, graph });
    activeScriptName = name; saveStorage(); updateLabels(); modal.classList.remove('active'); if (isMobile()) closeAllPanels();
};

function updateLabels() { document.getElementById('active-script-label').textContent = `Active Script: ${activeScriptName}`; }

window.autoLayoutNodes = function() {
    if (Object.keys(nodes).length === 0) return;

    let levels = {};
    Object.keys(nodes).forEach(id => levels[id] = 0);
    
    let changed = true;
    let maxIters = 100;
    while (changed && maxIters > 0) {
        changed = false;
        wires.forEach(w => {
            if (levels[w.fromNode] < levels[w.toNode] + 1) {
                levels[w.fromNode] = levels[w.toNode] + 1;
                changed = true;
            }
        });
        maxIters--;
    }

    let columns = {};
    let maxLevel = 0;
    Object.keys(nodes).forEach(id => {
        let lvl = levels[id];
        if (lvl > maxLevel) maxLevel = lvl;
        if (!columns[lvl]) columns[lvl] = [];
        columns[lvl].push(id);
    });

    // Anchored to the new infinite canvas center
    const endX = 50500;     
    const startY = 50000;   
    const colWidth = 380; 
    const nodePadding = 40; 
    let coordinates = {};

    // FIXED: Uses bounding client rect to find exact absolute offset, ignoring DOM nesting limits
    function getPortOffsetY(nodeId, portName, isOut) {
        const node = nodes[nodeId];
        if (!node || !node.domElement) return 0;
        
        let portEl = node.domElement.querySelector(`.port-${isOut ? 'out' : 'in'}[data-port="${portName}"]`);
        if (!portEl && portName === 'video') {
            portEl = node.domElement.querySelector(`.port-${isOut ? 'out' : 'in'}`);
        }

        if (portEl) {
            const nodeRect = node.domElement.getBoundingClientRect();
            const portRect = portEl.getBoundingClientRect();
            return ((portRect.top - nodeRect.top) + (portRect.height / 2)) / currentZoom;
        }
        
        return node.domElement.offsetHeight / 2;
    }

    if (columns[0]) {
        columns[0].sort();
        let totalHeight = columns[0].reduce((sum, id) => sum + nodes[id].domElement.offsetHeight + nodePadding, 0) - nodePadding;
        let currentY = startY - (totalHeight / 2);
        
        columns[0].forEach((id) => {
            coordinates[id] = { x: endX, y: currentY, h: nodes[id].domElement.offsetHeight };
            currentY += nodes[id].domElement.offsetHeight + nodePadding;
        });
    }

    for (let lvl = 1; lvl <= maxLevel; lvl++) {
        if (!columns[lvl]) continue;
        
        let idealPositions = [];
        
        columns[lvl].forEach(id => {
            let targetYs = [];
            const nodeHeight = nodes[id].domElement.offsetHeight;
            
            wires.forEach(w => {
                if (w.fromNode === id && coordinates[w.toNode]) {
                    const targetNodeBaseY = coordinates[w.toNode].y;
                    const targetPortOffset = getPortOffsetY(w.toNode, w.toPort, false);
                    const sourcePortOffset = getPortOffsetY(id, w.fromPort, true);
                    
                    targetYs.push((targetNodeBaseY + targetPortOffset) - sourcePortOffset);
                }
            });
            
            let avgY = startY;
            if (targetYs.length > 0) {
                avgY = targetYs.reduce((a, b) => a + b, 0) / targetYs.length;
            }
            
            idealPositions.push({ id: id, y: avgY, h: nodeHeight });
        });
        
        idealPositions.sort((a, b) => a.y - b.y);
        
        let overlap;
        let iter = 50;
        do {
            overlap = false;
            for (let i = 0; i < idealPositions.length - 1; i++) {
                let nodeA = idealPositions[i];
                let nodeB = idealPositions[i+1];
                let requiredSpace = nodeA.h + nodePadding;
                let currentSpace = nodeB.y - nodeA.y;
                
                if (currentSpace < requiredSpace) {
                    let push = (requiredSpace - currentSpace) / 2;
                    nodeA.y -= push;
                    nodeB.y += push;
                    overlap = true;
                }
            }
            iter--;
        } while (overlap && iter > 0);
        
        idealPositions.forEach(pos => {
            coordinates[pos.id] = { x: endX - (lvl * colWidth), y: pos.y, h: pos.h };
        });
    }

    Object.keys(coordinates).forEach(id => {
        const node = nodes[id];
        if (node) {
            node.domElement.style.left = `${coordinates[id].x}px`;
            node.domElement.style.top = `${coordinates[id].y}px`;
        }
    });

    rebuildGraphOrder();
    drawWires();
    
    // Pan the camera to the new sorted layout
    setTimeout(centerWorkspace, 50); 

    showToast("Tree aligned dynamically based on exact port positions!");
};

// --- Tab Navigation ---
document.getElementById('nav-camera').onclick = function() {
    this.classList.add('active'); 
    document.getElementById('nav-builder').classList.remove('active'); 
    viewCam.classList.add('active'); 
    document.getElementById('view-builder').classList.remove('active'); 
    triggerControlsFade();
};
document.getElementById('nav-builder').onclick = function() {
    this.classList.add('active'); 
    document.getElementById('nav-camera').classList.remove('active'); 
    document.getElementById('view-builder').classList.add('active'); 
    viewCam.classList.remove('active'); 
    drawWires(); 
};

// --- Boot ---
initBuilder(); updateVRMode(); window.addEventListener('resize', drawWires); renderLoop();
