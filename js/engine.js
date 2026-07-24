// --- WebGL Shader Pipeline ---
class WebGLPipeline {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false });
        this.programs = {};
        
        const gl = this.gl;
        if (!gl) {
            console.warn("WebGL not supported, falling back to CPU if necessary.");
            return;
        }
        
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        
        // Fullscreen quad buffer for drawing textures
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,   1, -1,   -1,  1,
            -1,  1,   1, -1,    1,  1
        ]), gl.STATIC_DRAW);

        this.texture = gl.createTexture();
        this.initShaders();
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(name, fragSource) {
        const gl = this.gl;
        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() {
                v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        
        // Pre-fetch common uniform locations
        prog.u_image = gl.getUniformLocation(prog, "u_image");
        prog.u_res = gl.getUniformLocation(prog, "u_res");
        
        this.programs[name] = prog;
    }

    initShaders() {
        const precision = "precision mediump float;";
        
        this.createProgram('grayscale', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform float u_amt;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                float gray = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                gl_FragColor = vec4(mix(c.rgb, vec3(gray), u_amt), c.a);
            }
        `);

        this.createProgram('invert', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform float u_amt;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                gl_FragColor = vec4(mix(c.rgb, 1.0 - c.rgb, u_amt), c.a);
            }
        `);

        this.createProgram('brightness', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform float u_amt;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                gl_FragColor = vec4(c.rgb + (u_amt * 2.55), c.a);
            }
        `);

        this.createProgram('contrast', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform float u_amt;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                float factor = (259.0 * (u_amt * 255.0 + 255.0)) / (255.0 * (259.0 - u_amt * 255.0));
                gl_FragColor = vec4(factor * (c.rgb - 0.5) + 0.5, c.a);
            }
        `);

        this.createProgram('tint', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform vec3 u_color;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                gl_FragColor = vec4(c.rgb * u_color, c.a);
            }
        `);

        this.createProgram('chroma', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform vec3 u_target; uniform float u_tolSq;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                vec3 diff = (c.rgb * 255.0) - u_target;
                float distSq = dot(diff, diff);
                if (distSq < u_tolSq) { gl_FragColor = vec4(0.0); } 
                else { gl_FragColor = c; }
            }
        `);

        this.createProgram('edge', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform vec2 u_res; uniform float u_intensity; uniform float u_binary;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                vec4 right = texture2D(u_image, v_uv + vec2(1.0/u_res.x, 0.0));
                vec4 bottom = texture2D(u_image, v_uv + vec2(0.0, 1.0/u_res.y));
                
                float grayC = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                float grayR = dot(right.rgb, vec3(0.299, 0.587, 0.114));
                float grayB = dot(bottom.rgb, vec3(0.299, 0.587, 0.114));
                
                float diff = abs(grayC - grayR) + abs(grayC - grayB);
                float val = u_binary > 0.5 ? (diff * 255.0 > u_intensity ? 1.0 : 0.0) : min(1.0, diff * (u_intensity / 10.0));
                
                gl_FragColor = vec4(vec3(val), 1.0);
            }
        `);
        
        this.createProgram('mask', precision + `
            varying vec2 v_uv; uniform sampler2D u_image; uniform float u_invert;
            void main() {
                vec4 c = texture2D(u_image, v_uv);
                float gray = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                float alpha = u_invert > 0.5 ? 1.0 - gray : gray;
                gl_FragColor = vec4(c.rgb, alpha);
            }
        `);
    }

    process(type, inputCanvas, getP, params) {
        if (!this.gl || !this.programs[type]) return false;
        const gl = this.gl;
        const w = inputCanvas.width;
        const h = inputCanvas.height;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w; this.canvas.height = h;
            gl.viewport(0, 0, w, h);
        }

        const prog = this.programs[type];
        gl.useProgram(prog);

        // Upload input canvas to GPU texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inputCanvas);

        gl.uniform1i(prog.u_image, 0);
        gl.uniform2f(prog.u_res, w, h);

        if (type === 'grayscale' || type === 'invert') {
            gl.uniform1f(gl.getUniformLocation(prog, "u_amt"), getP('amount', 100) / 100.0);
        } else if (type === 'brightness' || type === 'contrast') {
            gl.uniform1f(gl.getUniformLocation(prog, "u_amt"), getP('amount', 0) / 100.0);
        } else if (type === 'tint') {
            gl.uniform3f(gl.getUniformLocation(prog, "u_color"), getP('r', 255)/255, getP('g', 255)/255, getP('b', 255)/255);
        } else if (type === 'chroma') {
            gl.uniform3f(gl.getUniformLocation(prog, "u_target"), getP('r', 0), getP('g', 255), getP('b', 0));
            gl.uniform1f(gl.getUniformLocation(prog, "u_tolSq"), Math.pow(getP('tol', 80), 2));
        } else if (type === 'edge') {
            gl.uniform1f(gl.getUniformLocation(prog, "u_intensity"), getP('intensity', 50));
            gl.uniform1f(gl.getUniformLocation(prog, "u_binary"), params.mode === 'binary' ? 1.0 : 0.0);
        } else if (type === 'mask') {
            gl.uniform1f(gl.getUniformLocation(prog, "u_invert"), params.invert === 'true' ? 1.0 : 0.0);
        }

        // Draw quad
        const posLoc = gl.getAttribLocation(prog, "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return true;
    }
}

const glPipeline = new WebGLPipeline();

// --- Graph Engine ---
function rebuildGraphOrder() {
    hasCycleError = false; let inDegree = {}, adjList = {};
    window.wireMap = {};      
    
    Object.keys(nodes).forEach(id => {
        inDegree[id] = 0; adjList[id] = [];
        nodes[id].domElement.classList.remove('error', 'not-run');
        nodes[id].domElement.title = "";
        hideErrorIcon(id);
        if (nodes[id].type === 'on_start') nodes[id].hasStarted = false;
    });
    
    wires.forEach(w => {
         if (!window.wireMap[w.toNode]) window.wireMap[w.toNode] = {};
        window.wireMap[w.toNode][w.toPort] = w;
        adjList[w.fromNode].push(w.toNode); 
        inDegree[w.toNode] = (inDegree[w.toNode] || 0) + 1; 
    });
    
    let queue = [];
    Object.keys(inDegree).forEach(id => { if (inDegree[id] === 0) queue.push(id); });
    evalOrder = []; let count = 0;
    
    while(queue.length > 0) {
        let curr = queue.shift(); evalOrder.push(curr); count++;
        adjList[curr].forEach(neighbor => { inDegree[neighbor]--; if (inDegree[neighbor] === 0) queue.push(neighbor); });
    }
    
    if (count !== Object.keys(nodes).length) {
        hasCycleError = true;
        Object.keys(nodes).forEach(id => { 
            if (!evalOrder.includes(id)) {
                nodes[id].domElement.classList.add('error'); 
                nodes[id].domElement.title = "Cycle Detected";
            }
        });
    }
}

function createInternalCanvas(width, height) {
    const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}

function showErrorIcon(nodeId, msg, suggestion) {
    const node = nodes[nodeId];
    if (!node) return;
    let icon = node.domElement.querySelector('.error-icon');
    if (!icon) {
        icon = document.createElement('div');
        icon.className = 'error-icon';
        icon.textContent = '!';
        icon.title = "Click for error details";
        icon.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            showErrorModal(node.type, msg, suggestion);
        });
        node.domElement.appendChild(icon);
    }
}

function hideErrorIcon(nodeId) {
    const node = nodes[nodeId];
    if (!node) return;
    const icon = node.domElement.querySelector('.error-icon');
    if (icon) icon.remove();
}

function showErrorModal(nodeType, msg, suggestion) {
    document.getElementById('error-info-modal').classList.add('active');
    document.getElementById('error-msg-text').textContent = msg;
    document.getElementById('error-sugg-text').textContent = suggestion;
    document.getElementById('close-error-modal').onclick = () => document.getElementById('error-info-modal').classList.remove('active');
}

function evaluateFrame() {
    if (hasCycleError) return; 
    if (evalOrder.length === 0) return; 
    if (singleVideo && singleVideo.videoWidth) { videoWidth = singleVideo.videoWidth; videoHeight = singleVideo.videoHeight; }
    
    Object.values(nodes).forEach(node => {
        if (!node.outputData) node.outputData = {};
        const def = NODE_DEFS[node.type];
        if (!def) return;
        
        if ((def.category === 'Image Processing' && node.type !== 'get_position') || node.type === 'camera' || node.type === 'capture_frame') {
            if (!node.canvas || node.canvas.width !== videoWidth) {
                node.canvas = createInternalCanvas(videoWidth, videoHeight);
                node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });
                if (node.type === 'delay' || node.type === 'accumulate') node.buffer = []; 
                if (node.type === 'edge') node.grayBuffer = new Uint8Array(videoWidth * videoHeight);
            }
        }
    });
    
    taintedNodes.clear();
    for (let nodeId of evalOrder) {
        const node = nodes[nodeId], def = NODE_DEFS[node.type]; 
        if (!def) continue;
        let inputs = {};
        let isTainted = false;
        
        if (def.inPorts) def.inPorts.forEach(port => {
            const wire = window.wireMap[nodeId] ? window.wireMap[nodeId][port] : null;
            if (wire) {
                inputs[port] = nodes[wire.fromNode].outputData[wire.fromPort];
                if (taintedNodes.has(wire.fromNode)) isTainted = true;
            } else {
                inputs[port] = null;
            }
        });
        
        if (def.params) def.params.forEach(p => {
            const wire = window.wireMap[nodeId] ? window.wireMap[nodeId][p.id] : null;
            if (wire) {
                inputs[p.id] = nodes[wire.fromNode].outputData[wire.fromPort];
                if (taintedNodes.has(wire.fromNode)) isTainted = true;
            }
        });
        
        if (isTainted) {
            taintedNodes.add(nodeId);
            node.domElement.classList.add('not-run');
            node.domElement.classList.remove('error');
            hideErrorIcon(nodeId);
            continue; 
        }
        
        try {
            if (def.category === 'Image Processing') {
                const canvasInput = inputs['in'] !== undefined ? inputs['in'] : inputs['video'];
                if (canvasInput !== null && canvasInput !== undefined) {
                    if (!(canvasInput instanceof HTMLCanvasElement)) {
                        throw new Error(`Invalid type received on video port. Expected Image Stream, got ${typeof canvasInput}.`);
                    }
                }
            }
            applyNodeEffect(node, inputs);
            node.domElement.classList.remove('error', 'not-run');
            hideErrorIcon(nodeId);
        } catch (err) {
            taintedNodes.add(nodeId);
            node.domElement.classList.add('error');
            node.domElement.classList.remove('not-run');
            
            let suggestion = "Check the connections leading to this node. Ensure you are providing the correct data type.";
            if (err.message.includes("Image Stream")) {
                suggestion = "You are feeding a number or logic signal into an image port. Connect a video/image line instead.";
            } else if (err.message.includes("undefined") || err.message.includes("null")) {
                suggestion = "An input port requires data to run but is disconnected.";
            } else if (node.type === 'math_div') {
                suggestion = "Division by zero is not allowed. Change the divisor input.";
            }
            showErrorIcon(nodeId, err.message, suggestion);
        }
    }
    
    Object.keys(window.userVars).forEach(v => {
        const val = window.userVars[v];
        let displayVal = val;
        if (val instanceof HTMLCanvasElement) displayVal = "[Image]";
        else if (typeof val === 'number') displayVal = Number.isInteger(val) ? val : Math.round(val * 100) / 100;
        
        if (window.userVarsLastDisplay[v] !== displayVal) {
            window.userVarsLastDisplay[v] = displayVal;
            const safeName = getSafeVarName(v);
            document.querySelectorAll(`.live-val-${safeName}`).forEach(el => el.textContent = displayVal);
        }
    });
}

function applyNodeEffect(node, inputs) {
    const { type, params, ctx, canvas } = node;
    const w = canvas ? canvas.width : 0, h = canvas ? canvas.height : 0;
    
    if (ctx) {
        if (type === 'camera' && window.isCameraPaused) {
            // Keep existing frame
        } else {
            ctx.clearRect(0,0,w,h);
        }
    }
    
    const getVal = (id, defVal) => {
        let val;
        if (inputs[id] !== null && inputs[id] !== undefined) val = inputs[id];
        else if (node.bindings && node.bindings[id]) val = window.userVars[node.bindings[id]] ?? defVal;
        else val = params[id] ?? defVal;
        
        const lbl = document.getElementById(`lbl-${node.id}-${id}`);
        if (lbl && typeof val !== 'object') {
            let fmt = typeof val === 'number' ? (Number.isInteger(val) ? val : Math.round(val*100)/100) : val;
            if (lbl.dataset.last !== String(fmt)) { lbl.textContent = fmt; lbl.dataset.last = fmt; }
        }
        return val;
    };
    
    const getP = (id, defVal) => { let v = parseFloat(getVal(id, defVal)); return isNaN(v) ? 0 : v; };
    const unifiedInCanvas = (inputs['in'] instanceof HTMLCanvasElement ? inputs['in'] : null) || (inputs['video'] instanceof HTMLCanvasElement ? inputs['video'] : null);
    
    const setUnifiedOutCanvas = (targetCanvas) => {
        let outPort = NODE_DEFS[type].outPorts.includes('out') ? 'out' : 'video';
        node.outputData[outPort] = targetCanvas;
    };

    if (type === 'camera') {
        if (stream || (singleVideo && singleVideo.src)) {
            if (!window.isCameraPaused) {
                // The engine already resizes the canvas exactly to singleVideo.videoWidth/Height.
                // Standard drawing naturally maintains the perfect aspect ratio.
                ctx.drawImage(singleVideo, 0, 0, w, h);
            }
        } else {
            ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#666'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillText('Camera Off', w/2, h/2);
        }
        setUnifiedOutCanvas(canvas); return;
    }
    
    if (type === 'screen') {
        const renderTarget = inputs['render'] instanceof HTMLCanvasElement ? inputs['render'] : null;
        // Ensure rendering triggers for both webcam streams and uploaded videos
        if (stream || (singleVideo && singleVideo.src)) {
            renderFinalOutput(renderTarget);
        }
        return;
    }

    const mathOps = ['math_add','math_sub','math_mult','math_div','math_sin','math_cos','math_tan','math_pi','math_log', 'compare'];
    if (mathOps.includes(type)) {
        let a = getP('a',0), b = getP('b',0);
        switch(type) {
            case 'math_add': node.outputData['out'] = a + b; break;
            case 'math_sub': node.outputData['out'] = a - b; break;
            case 'math_mult': node.outputData['out'] = a * b; break;
            case 'math_div': 
                if (b === 0) throw new Error("Math Error: Division by zero.");
                node.outputData['out'] = a / b; 
                break;
            case 'math_sin': node.outputData['out'] = Math.sin(a); break;
            case 'math_cos': node.outputData['out'] = Math.cos(a); break;
            case 'math_tan': node.outputData['out'] = Math.tan(a); break;
            case 'math_pi': node.outputData['out'] = Math.PI; break;
            case 'math_log': node.outputData['out'] = Math.log(a); break;
            case 'compare':
                let op = params.op || '>', res = false;
                if (op==='>') res = a>b; else if (op==='<') res = a<b; else if (op==='==') res = a==b; else if (op==='!=') res = a!=b; else if (op==='>=') res = a>=b; else if (op==='<=') res = a<=b;
                node.outputData['out'] = res; break;
        }
        return;
    }
    
    if (type === 'time_sec') { node.outputData['val'] = Date.now() / 1000; return; }
    if (type === 'time_date') { node.outputData['val'] = new Date().getDate(); return; }
    
    if (type === 'math_pos_convert') {
        const mode = params.mode || '% to px';
        let xIn = getP('x_in', 50), yIn = getP('y_in', 50);
        let vw = videoWidth || 1, vh = videoHeight || 1;
        if (mode === '% to px') {
            node.outputData['x'] = (xIn / 100) * vw;
            node.outputData['y'] = (yIn / 100) * vh;
        } else {
            node.outputData['x'] = (xIn / vw) * 100;
            node.outputData['y'] = (yIn / vh) * 100;
        }
        return;
    }

    if (type === 'cam_pause') { if (inputs['exec']) window.isCameraPaused = true; node.outputData['exec'] = inputs['exec']; return; }
    if (type === 'cam_resume') { if (inputs['exec']) window.isCameraPaused = false; node.outputData['exec'] = inputs['exec']; return; }
    if (type === 'if_else') { node.outputData['true'] = inputs['exec'] && inputs['cond']; node.outputData['false'] = inputs['exec'] && !inputs['cond']; return; }
    
    if (type === 'var_set') {
        if (inputs['exec']) {
            const vName = params.varName;
            if (vName && window.userVars[vName] !== undefined) {
                let v = getVal('val', 0);
                if (v instanceof HTMLCanvasElement) {
                    const clone = createInternalCanvas(v.width, v.height);
                    clone.getContext('2d').drawImage(v, 0, 0);
                    window.userVars[vName] = clone;
                } else {
                    window.userVars[vName] = v;
                }
            }
        }
        node.outputData['exec'] = inputs['exec']; return;
    }
    if (type === 'var_get') { node.outputData['val'] = window.userVars[params.varName] ?? 0; return; }
    
    if (type === 'on_start') { if (!node.hasStarted) { node.outputData['exec'] = true; node.hasStarted = true; } else { node.outputData['exec'] = false; } return; }
    if (type === 'on_frame') { node.outputData['exec'] = true; return; }
    
    if (type === 'logic_delay') {
        if (!node.timers) node.timers = [];
        if (inputs['exec']) node.timers.push(Math.max(1, parseInt(getP('frames', 15))));
        let trigger = false;
        for (let i = node.timers.length - 1; i >= 0; i--) {
            node.timers[i]--;
            if (node.timers[i] <= 0) { trigger = true; node.timers.splice(i, 1); }
        }
        node.outputData['exec'] = trigger; return;
    }

    if (type === 'ui_button') {
        let btn = document.getElementById(`uibtn-${node.id}`);
        if (!btn) {
            btn = document.createElement('button'); btn.id = `uibtn-${node.id}`;
            btn.style.position = 'absolute'; btn.style.pointerEvents = 'auto'; btn.style.transform = 'translate(-50%, -50%)'; btn.style.borderRadius = '8px';
            btn.style.background = 'rgba(59, 130, 246, 0.8)'; btn.style.color = 'white'; btn.style.border = '2px solid white'; btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer'; btn.style.zIndex = '100';
            btn.onpointerdown = () => { node.clicked = true; };
            document.getElementById('ui-layer').appendChild(btn);
        }
        let textVal = getVal('text', 'Button'), xVal = getP('x', 50), yVal = getP('y', 80), wVal = getP('w', 120), hVal = getP('h', 40);
        if (btn.innerText != textVal) btn.innerText = textVal;
        if (btn.dataset.x != xVal) { btn.style.left = `${xVal}%`; btn.dataset.x = xVal; }
        if (btn.dataset.y != yVal) { btn.style.top = `${yVal}%`; btn.dataset.y = yVal; }
        if (btn.dataset.w != wVal) { btn.style.width = `${wVal}px`; btn.dataset.w = wVal; }
        if (btn.dataset.h != hVal) { btn.style.height = `${hVal}px`; btn.dataset.h = hVal; }
        
        if (node.clicked) { node.outputData['exec'] = true; node.clicked = false; } else { node.outputData['exec'] = false; }
        return;
    }
    
    if (type === 'capture_frame') {
        if (!node.savedCanvas) node.savedCanvas = createInternalCanvas(w, h);
        if (inputs['exec']) {
            if (unifiedInCanvas) { node.savedCanvas.getContext('2d').clearRect(0,0,w,h); node.savedCanvas.getContext('2d').drawImage(unifiedInCanvas, 0, 0, w, h); }
        }
        ctx.drawImage(node.savedCanvas, 0, 0);
        setUnifiedOutCanvas(canvas); return;
    }

    if (type === 'get_position') {
        if (!unifiedInCanvas) { 
             node.outputData['x'] = 50; node.outputData['y'] = 50; node.outputData['found'] = false; 
             return; 
         }
         
        const wIn = unifiedInCanvas.width || 1, hIn = unifiedInCanvas.height || 1;
        
        // Optimizing get_position by scaling down first to avoid slow 1080p array iterations
        const downscaleW = 64;
        const downscaleH = 64;
        if (!node.downCanvas) node.downCanvas = createInternalCanvas(downscaleW, downscaleH);
        node.downCanvas.getContext('2d').drawImage(unifiedInCanvas, 0, 0, downscaleW, downscaleH);
        
        const data = node.downCanvas.getContext('2d', {willReadFrequently: true}).getImageData(0,0,downscaleW,downscaleH).data;
        let sumX = 0, sumY = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] > 0 && (data[i] > 127 || data[i+1] > 127 || data[i+2] > 127)) {
                const pixelIndex = (i / 4) | 0;
                sumX += pixelIndex % downscaleW;
                sumY += (pixelIndex / downscaleW) | 0;
                count++;
            }
        }
        
        if (count > 0) {
            node.outputData['x'] = (sumX / count) / downscaleW * 100; 
            node.outputData['y'] = (sumY / count) / downscaleH * 100; 
            node.outputData['found'] = true;
        } else { 
             node.outputData['x'] = 50; 
             node.outputData['y'] = 50; 
             node.outputData['found'] = false; 
         }
        return;
    }
    
    if (type === 'draw_point') {
        if (unifiedInCanvas) ctx.drawImage(unifiedInCanvas, 0, 0);
        const x = getP('x', 50), y = getP('y', 50);
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.stroke();
        setUnifiedOutCanvas(canvas); return;
    }
    
    if (!unifiedInCanvas && type !== 'blend') return; 

    if (type === 'fps') {
        const limit = getP('fps', 30), now = performance.now();
        let defaultOut = NODE_DEFS[type].outPorts.includes('out') ? 'out' : 'video';
        if (!node.lastTime) node.lastTime = 0;
        if (now - node.lastTime >= (1000 / limit)) { node.lastTime = now; ctx.drawImage(unifiedInCanvas, 0, 0); } else if (node.outputData[defaultOut]) ctx.drawImage(node.outputData[defaultOut], 0, 0);
        setUnifiedOutCanvas(canvas); return;
    }
    
    if (type === 'delay') {
        const reqFrames = Math.max(1, parseInt(getP('frames', 15)));
        while (node.buffer.length < reqFrames) node.buffer.push(createInternalCanvas(w, h));
        if (node.buffer.length > reqFrames) node.buffer.length = reqFrames;
        node.bufIndex = (node.bufIndex || 0) % reqFrames;
        const bufCtx = node.buffer[node.bufIndex].getContext('2d'); bufCtx.clearRect(0,0,w,h); bufCtx.drawImage(unifiedInCanvas, 0, 0);
        ctx.drawImage(node.buffer[(node.bufIndex + 1) % reqFrames] || node.buffer[0], 0, 0);
        node.bufIndex++; setUnifiedOutCanvas(canvas); return;
    }
    
    if (type === 'accumulate') {
        const reqFrames = Math.max(2, parseInt(getP('frames', 15))), mode = params.mode || 'average';
        while (node.buffer.length < reqFrames) node.buffer.push(createInternalCanvas(w, h));
        if (node.buffer.length > reqFrames) node.buffer.length = reqFrames;
        node.bufIndex = (node.bufIndex || 0) % reqFrames;
        const curCtx = node.buffer[node.bufIndex].getContext('2d'); curCtx.clearRect(0,0,w,h); curCtx.drawImage(unifiedInCanvas, 0, 0);
        if(node.frameCount === undefined) node.frameCount = 0; if(node.frameCount < reqFrames) node.frameCount++;
        const activeFrames = Math.min(node.frameCount, reqFrames);
        
        if (mode === 'average') { ctx.globalAlpha = 1.0 / activeFrames; ctx.globalCompositeOperation = 'source-over'; }
        else if (mode === 'lighten') { ctx.globalCompositeOperation = 'lighten'; } else if (mode === 'darken') { ctx.globalCompositeOperation = 'darken'; }
        for(let i=0; i<activeFrames; i++) ctx.drawImage(node.buffer[i], 0, 0);
        ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; node.bufIndex++; setUnifiedOutCanvas(canvas); return;
    }
    
    if (type === 'blend') {
        const bgC = inputs['bg'] instanceof HTMLCanvasElement ? inputs['bg'] : null, fgC = inputs['fg'] instanceof HTMLCanvasElement ? inputs['fg'] : null;
        if (!bgC && !fgC) return;
        if (!bgC || !fgC) { ctx.drawImage(bgC || fgC, 0, 0); setUnifiedOutCanvas(canvas); return; }
        const mode = params.mode || 'mix', mixAmt = getP('mix', 50) / 100;
        ctx.drawImage(bgC, 0, 0); ctx.globalAlpha = mixAmt;
        if (mode === 'add') ctx.globalCompositeOperation = 'lighter'; else if (mode === 'multiply') ctx.globalCompositeOperation = 'multiply'; else if (mode === 'screen') ctx.globalCompositeOperation = 'screen'; else if (mode === 'difference') ctx.globalCompositeOperation = 'difference';
        ctx.drawImage(fgC, 0, 0); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; setUnifiedOutCanvas(canvas); return;
    }
    
    if (type === 'translate') { ctx.save(); ctx.translate(getP('cx', 0) + getP('fx', 0), getP('cy', 0) + getP('fy', 0)); ctx.drawImage(unifiedInCanvas, 0, 0); ctx.restore(); setUnifiedOutCanvas(canvas); return; }
    if (type === 'scale') { const scalePct = getP('scale', 100) / 100; ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(scalePct, scalePct); ctx.translate(-w / 2, -h / 2); ctx.drawImage(unifiedInCanvas, 0, 0); ctx.restore(); setUnifiedOutCanvas(canvas); return; }
    if (type === 'flip') { const flipX = params.flipX === 'true', flipY = params.flipY === 'true'; ctx.save(); ctx.translate(flipX ? w : 0, flipY ? h : 0); ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1); ctx.drawImage(unifiedInCanvas, 0, 0); ctx.restore(); setUnifiedOutCanvas(canvas); return; }
    
    if (type === 'pixelate') {
        const size = Math.max(1, parseInt(getP('size', 10)));
        if (size <= 1) { ctx.drawImage(unifiedInCanvas, 0, 0); setUnifiedOutCanvas(canvas); return; }
        ctx.imageSmoothingEnabled = false; ctx.drawImage(unifiedInCanvas, 0, 0, w/size, h/size); ctx.drawImage(canvas, 0, 0, w/size, h/size, 0, 0, w, h);
        setUnifiedOutCanvas(canvas); return;
    }

    const webglTypes = ['grayscale', 'invert', 'brightness', 'contrast', 'tint', 'chroma', 'mask', 'edge'];
    
    if (webglTypes.includes(type)) {
        // FAST PATH: Hardware Accelerated WebGL execution
        if (glPipeline.process(type, unifiedInCanvas, getP, params)) {
            // Draw WebGL output instantly onto our 2D canvas 
            // (Extremely fast built-in browser composition)
            ctx.drawImage(glPipeline.canvas, 0, 0);
            setUnifiedOutCanvas(canvas);
            return;
        }
    }
    
    // SLOW PATH: Legacy CPU implementations for complex/rare filters 
    const cpuTypes = ['hue_shift', 'saturation', 'hsv_pass', 'bandpass'];
    if (cpuTypes.includes(type)) {
        const inCtx = unifiedInCanvas.getContext('2d', {willReadFrequently: true});
        const imgData = inCtx.getImageData(0,0,w,h);
        const data = imgData.data; const len = data.length;
        
        if (type === 'hue_shift' || type === 'saturation') {
            let hShift = type==='hue_shift' ? getP('deg', 0) : 0, sScale = type==='saturation' ? getP('amount', 100) / 100 : 1;
            const angle = hShift * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
            const lumR = 0.213, lumG = 0.715, lumB = 0.072;
            const m0 = (lumR + (1 - lumR) * c - lumR * s) * sScale + lumR * (1 - sScale), m1 = (lumG - lumG * c - lumG * s) * sScale + lumG * (1 - sScale), m2 = (lumB - lumB * c + (1 - lumB) * s) * sScale + lumB * (1 - sScale);
            const m3 = (lumR - lumR * c + 0.143 * s) * sScale + lumR * (1 - sScale), m4 = (lumG + (1 - lumG) * c + 0.140 * s) * sScale + lumG * (1 - sScale), m5 = (lumB - lumB * c - 0.283 * s) * sScale + lumB * (1 - sScale);
            const m6 = (lumR - lumR * c - (1 - lumR) * s) * sScale + lumR * (1 - sScale), m7 = (lumG - lumG * c + lumG * s) * sScale + lumG * (1 - sScale), m8 = (lumB + (1 - lumB) * c + lumB * s) * sScale + lumB * (1 - sScale);
            for (let i=0; i<len; i+=4) {
                if (data[i+3] === 0) continue;
                let r = data[i], g = data[i+1], b = data[i+2];
                data[i] = r * m0 + g * m1 + b * m2; data[i+1] = r * m3 + g * m4 + b * m5; data[i+2] = r * m6 + g * m7 + b * m8;
            }
        }
        else if (type === 'hsv_pass') {
            const targetHue = getP('target', 0) / 360, tolHue = getP('tol', 30) / 360, targetSat = getP('s_target', 100) / 100, tolSat = getP('s_tol', 75) / 100;
            const targetVal = getP('v_target', 100) / 100, tolVal = getP('v_tol', 100) / 100, mode = params.mode || 'transparent';
            for (let i=0; i<len; i+=4) {
                if (data[i+3] === 0) continue;
                let r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255, max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h, s, v = max, d = max - min; s = max === 0 ? 0 : d / max;
                if (max === min) h = 0;
                else {
                    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }
                    h /= 6;
                }
                let isOutside = false, hDist = Math.abs(h - targetHue);
                if (hDist > 0.5) hDist = 1.0 - hDist;
                if (hDist > tolHue || Math.abs(s - targetSat) > tolSat || Math.abs(v - targetVal) > tolVal) {
                    isOutside = true; if (mode === 'black') v = 0; else if (mode === 'grayscale') s = 0;
                }
                let newR, newG, newB;
                if (s === 0) newR = newG = newB = v;
                else {
                    let i_h = Math.floor(h * 6), f = h * 6 - i_h, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
                    switch (i_h % 6) { case 0: newR = v, newG = t, newB = p; break; case 1: newR = q, newG = v, newB = p; break; case 2: newR = p, newG = v, newB = t; break; case 3: newR = p, newG = q, newB = v; break; case 4: newR = t, newG = p, newB = v; break; case 5: newR = v, newG = p, newB = q; break; }
                }
                if (mode === 'mask') { let maskVal = isOutside ? 0 : 255; data[i] = data[i+1] = data[i+2] = maskVal; data[i+3] = 255; } 
                else { data[i] = newR * 255; data[i+1] = newG * 255; data[i+2] = newB * 255; if (isOutside && mode === 'transparent') data[i+3] = 0; }
            }
        }
        else if (type === 'bandpass') {
            const med = parseInt(getP('median', 127)), rh = parseInt(getP('range', 50))/2, targetChannel = params.channel || 'luma';
            for (let i=0; i<len; i+=4) {
                if (data[i+3] === 0) continue;
                let val; if (targetChannel === 'red') val = data[i]; else if (targetChannel === 'green') val = data[i+1]; else if (targetChannel === 'blue') val = data[i+2]; else val = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]; 
                if (Math.abs(val - med) > rh) { data[i] = data[i+1] = data[i+2] = 0; }
            }
        } 
        
        ctx.putImageData(imgData, 0, 0);
        setUnifiedOutCanvas(canvas);
    }
}

function renderFinalOutput(sourceCanvas) {
    const targets = vrMode ? [canvasLeft, canvasRight] : [canvasSingle];
    if (!sourceCanvas) { canvasLeft.style.display = 'none'; canvasRight.style.display = 'none'; canvasSingle.style.display = 'none'; previewCanvas.style.display = 'none'; return; }
    targets.forEach(c => {
        c.style.display = 'block';
        if (c.width !== sourceCanvas.width) c.width = sourceCanvas.width;
        if (c.height !== sourceCanvas.height) c.height = sourceCanvas.height;
        c.getContext('2d').drawImage(sourceCanvas, 0, 0);
    });
    
    if (vrMode) canvasSingle.style.display = 'none'; else { canvasLeft.style.display = 'none'; canvasRight.style.display = 'none'; }
    previewCanvas.style.display = 'block';
    if (previewCanvas.width !== sourceCanvas.width) previewCanvas.width = sourceCanvas.width;
    if (previewCanvas.height !== sourceCanvas.height) previewCanvas.height = sourceCanvas.height;
    previewCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
}

function renderLoop() { evaluateFrame(); renderLoopId = requestAnimationFrame(renderLoop); }

function getPortPos(nodeId, portName, isOut) {
    const node = nodes[nodeId];
    if (!node) return {x:0, y:0};
    const el = node.domElement;
    
    let activePortName = portName;
    if (portName === 'video') {
        if (!el.querySelector(`.port-${isOut ? 'out' : 'in'}[data-port="video"]`)) {
            activePortName = isOut ? 'out' : 'in';
        }
    }
    const portEl = el.querySelector(`.port-${isOut?'out':'in'}[data-port="${activePortName}"]`);
    if (!portEl) return {x:parseInt(el.style.left), y:parseInt(el.style.top)};
    
    const portRect = portEl.getBoundingClientRect();
    const wsRect = workspaceInner.getBoundingClientRect();
    
    return {
        x: (portRect.left - wsRect.left) / currentZoom + (portRect.width / currentZoom) / 2,
        y: (portRect.top - wsRect.top) / currentZoom + (portRect.height / currentZoom) / 2
    };
}

function drawWires() {
    wiresSvg.innerHTML = '';
    wires.forEach(w => {
        const p1 = getPortPos(w.fromNode, w.fromPort, true);
        const p2 = getPortPos(w.toNode, w.toPort, false);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'wire');
        path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x+50} ${p1.y}, ${p2.x-50} ${p2.y}, ${p2.x} ${p2.y}`);
        path.dataset.wireId = w.id;
        
        if (selectedWire === w.id) path.style.stroke = '#ef4444'; 
        
        path.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            selectedWire = w.id;
            drawWires();
        });
        path.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            wires = wires.filter(wire => wire.id !== w.id);
            selectedWire = null;
            rebuildGraphOrder();
            drawWires();
        });
        
        wiresSvg.appendChild(path);
        
        if (selectedWire === w.id) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const delBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            delBg.setAttribute('cx', midX); delBg.setAttribute('cy', midY);
            delBg.setAttribute('r', 14 / currentZoom); delBg.setAttribute('fill', '#ef4444');
            delBg.style.cursor = 'pointer'; delBg.style.pointerEvents = 'all';
            
            const delText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            delText.setAttribute('x', midX); delText.setAttribute('y', midY + (4 / currentZoom));
            delText.setAttribute('text-anchor', 'middle'); delText.setAttribute('fill', 'white');
            delText.setAttribute('font-size', `${14/currentZoom}px`); delText.setAttribute('font-weight', 'bold');
            delText.style.cursor = 'pointer'; delText.style.pointerEvents = 'none';
            delText.textContent = '×';
            
            delBg.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                wires = wires.filter(wire => wire.id !== w.id);
                selectedWire = null;
                rebuildGraphOrder();
                drawWires();
            });
            wiresSvg.appendChild(delBg);
            wiresSvg.appendChild(delText);
        }
    });
    
    if (draggingWire) {
        const p1 = getPortPos(draggingWire.fromNode, draggingWire.fromPort, true);
        const wsRect = workspaceInner.getBoundingClientRect();
        const p2 = { 
             x: (draggingWire.mouseX - wsRect.left) / currentZoom, 
             y: (draggingWire.mouseY - wsRect.top) / currentZoom 
         };
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'wire active');
        path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x+50} ${p1.y}, ${p2.x-50} ${p2.y}, ${p2.x} ${p2.y}`);
        wiresSvg.appendChild(path);
    }
}

function startWireDrag(nodeId, port, mx, my) {
    draggingWire = { fromNode: nodeId, fromPort: port, mouseX: mx, mouseY: my };
    drawWires();
}

function cleanupWireDrag() {
    draggingWire = null;
    drawWires();
}
