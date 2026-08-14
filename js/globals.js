function safeGetStorage(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
function safeSetStorage(key, val) { try { localStorage.setItem(key, val); } catch(e) { } }
function safeRemoveStorage(key) { try { localStorage.removeItem(key); } catch(e) { } }

window.userVarNames = [];
window.userVars = {};
window.userVarsLastDisplay = {}; 
window.isCameraPaused = false; 
window.wireMap = {}; 
window.enableWebGL = true; // WebGL feature flag enabled

function getSafeVarName(name) { return name.replace(/[^a-zA-Z0-9]/g, '_'); }
function generateId() { return Math.random().toString(36).substr(2, 9); }

// Global Error Catcher
window.addEventListener('error', function(e) {
    if (typeof showToast === 'function') showToast("System Crash: " + e.message, true);
});

const NODE_DEFS = {
    // 1 - 9: I/O
    camera: { typeId: 1, label: 'Camera In', category: 'I/O', inPorts: [], outPorts: ['video'] },
    screen: { typeId: 2, label: 'Screen Out', category: 'I/O', inPorts: ['render'], outPorts: [] },
    
    // 10 - 39: Image Processing
    fps: { typeId: 10, label: 'Framerate Limit', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'fps', label: 'Max FPS', type: 'range', min: 1, max: 60, default: 30 }] },
    delay: { typeId: 11, label: 'Image Delay', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 1, max: 60, default: 15 }] },
    brightness: { typeId: 12, label: 'Brightness', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, default: 0 }] },
    contrast: { typeId: 13, label: 'Contrast', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, default: 0 }] },
    hue_shift: { typeId: 14, label: 'Hue Shift', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'deg', label: 'Degrees', type: 'range', min: -180, max: 180, default: 0 }] },
    saturation: { typeId: 15, label: 'Saturation', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 200, default: 100 }] },
    translate: { typeId: 16, label: 'Translate', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'cx', label: 'Coarse X', type: 'range', min: -1000, max: 1000, default: 0 }, { id: 'fx', label: 'Fine X', type: 'range', min: -50, max: 50, default: 0 }, { id: 'cy', label: 'Coarse Y', type: 'range', min: -1000, max: 1000, default: 0 }, { id: 'fy', label: 'Fine Y', type: 'range', min: -50, max: 50, default: 0 }] },
    scale: { typeId: 17, label: 'Scale', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'scale', label: 'Scale (%)', type: 'range', min: 1, max: 500, default: 100 }] },
    flip: { typeId: 18, label: 'Flip', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'flipX', label: 'Flip X', type: 'select', options: ['false', 'true'], default: 'false' }, { id: 'flipY', label: 'Flip Y', type: 'select', options: ['false', 'true'], default: 'false' }] },
    grayscale: { typeId: 19, label: 'Grayscale', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 100, default: 100 }] },
    invert: { typeId: 20, label: 'Invert', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 100, default: 100 }] },
    tint: { typeId: 21, label: 'RGB Filter', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'r', label: 'Red', type: 'range', min: 0, max: 255, default: 255 }, { id: 'g', label: 'Green', type: 'range', min: 0, max: 255, default: 255 }, { id: 'b', label: 'Blue', type: 'range', min: 0, max: 255, default: 255 }] },
    bandpass: { typeId: 22, label: 'Band Pass', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'channel', label: 'Target', type: 'select', options: ['luma', 'red', 'green', 'blue'], default: 'luma' }, { id: 'median', label: 'Value', type: 'range', min: 0, max: 255, default: 127 }, { id: 'range', label: 'Width', type: 'range', min: 0, max: 255, default: 50 }] },
    hsv_pass: { typeId: 23, label: 'HSV Pass', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'target', label: 'Hue', type: 'range', min: 0, max: 360, default: 0 }, { id: 'tol', label: 'Hue Tol', type: 'range', min: 0, max: 180, default: 30 }, { id: 's_target', label: 'Sat', type: 'range', min: 0, max: 100, default: 100 }, { id: 's_tol', label: 'Sat Tol', type: 'range', min: 0, max: 100, default: 75 }, { id: 'v_target', label: 'Val', type: 'range', min: 0, max: 100, default: 100 }, { id: 'v_tol', label: 'Val Tol', type: 'range', min: 0, max: 100, default: 100 }, { id: 'mode', label: 'Bg Mode', type: 'select', options: ['transparent', 'mask', 'grayscale', 'black'], default: 'transparent' }] },
    chroma: { typeId: 24, label: 'Chroma Key', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'r', label: 'Red', type: 'range', min:0, max:255, default:0 }, { id: 'g', label: 'Green', type: 'range', min:0, max:255, default:255 }, { id: 'b', label: 'Blue', type: 'range', min:0, max:255, default:0 }, { id: 'tol', label: 'Tolerance', type: 'range', min:1, max:200, default:80 }] },
    edge: { typeId: 25, label: 'Edge Detect', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'mode', label: 'Mode', type: 'select', options: ['grayscale', 'binary'], default: 'grayscale' }, { id: 'intensity', label: 'Thresh', type: 'range', min: 1, max: 255, default: 50 }] },
    mask: { typeId: 26, label: 'Luma Mask', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'invert', label: 'Invert', type: 'select', options: ['false', 'true'], default: 'false' }] },
    pixelate: { typeId: 27, label: 'Pixelate', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'size', label: 'Block', type: 'range', min:1, max:100, default:10 }] },
    accumulate: { typeId: 28, label: 'Long Exposure', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 2, max: 60, default: 15 }, { id: 'mode', label: 'Blend', type: 'select', options: ['average', 'lighten', 'darken'], default: 'average' }] },
    blend: { typeId: 29, label: 'Blend', category: 'Image Processing', inPorts: ['bg', 'fg'], outPorts: ['out'], params: [{ id: 'mode', label: 'Mode', type: 'select', options: ['mix', 'add', 'multiply', 'screen', 'difference'], default: 'mix' }, { id: 'mix', label: 'Amount', type: 'range', min: 0, max: 100, default: 50 }] },
    get_position: { typeId: 30, label: 'Get Position (Mask)', category: 'Image Processing', inPorts: ['in'], outPorts: ['x', 'y', 'found'] },
    draw_point: { typeId: 31, label: 'Draw Point', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [ {id: 'x', label:'X (px)', type:'number', default: 320}, {id: 'y', label:'Y (px)', type:'number', default: 240} ] },
    
    // 40 - 49: Triggers
    on_start: { typeId: 40, label: 'On Start', category: 'Triggers', inPorts: [], outPorts: ['exec'] },
    on_frame: { typeId: 41, label: 'On Frame', category: 'Triggers', inPorts: [], outPorts: ['exec'] },
    ui_button: { typeId: 42, label: 'UI Button', category: 'Triggers', inPorts: [], outPorts: ['exec'], params: [{id: 'text', label: 'Text', type: 'text', default: 'Click Me'}, {id: 'x', label: 'X (%)', type: 'number', default: 50}, {id: 'y', label: 'Y (%)', type: 'number', default: 80}, {id: 'w', label: 'Width', type: 'number', default: 120}, {id: 'h', label: 'Height', type: 'number', default: 40}] },
    logic_delay: { typeId: 43, label: 'Logic Delay', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 1, max: 60, default: 15 }] },
    if_else: { typeId: 44, label: 'If / Else', category: 'Triggers', inPorts: ['exec', 'cond'], outPorts: ['true', 'false'] },
    capture_frame: { typeId: 45, label: 'Capture Frame', category: 'Triggers', inPorts: ['exec', 'video'], outPorts: ['video'] },
    cam_pause: { typeId: 46, label: 'Pause Camera', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'] },
    cam_resume: { typeId: 47, label: 'Resume Camera', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'] },
    
    // 50 - 59: Environment
    video_duration: { typeId: 50, label: 'Video Total Frames', category: 'Enviorment', inPorts: [], outPorts: ['val'], params: [ { id: 'fps', label: 'Video FPS', type: 'number', default: 30 } ] },
    video_frame: { typeId: 51, label: 'Video Frame', category: 'Enviorment', inPorts: [], outPorts: ['val'], params: [ { id: 'fps', label: 'Video FPS', type: 'number', default: 30 } ] },
    live_fps: { typeId: 52, label: 'Live FPS', category: 'Enviorment', inPorts: [], outPorts: ['val'] },
    screen_width: { typeId: 53, label: 'Screen Width', category: 'Enviorment', inPorts: [], outPorts: ['val'] },
    screen_height: { typeId: 54, label: 'Screen Height', category: 'Enviorment', inPorts: [], outPorts: ['val']},
    time_sec: { typeId: 55, label: 'Time (sec)', category: 'Enviorment', inPorts: [], outPorts: ['val'] },
    time_date: { typeId: 56, label: 'Date (day)', category: 'Enviorment', inPorts: [], outPorts: ['val'] },

    // 60 - 79: Math
    math_add: { typeId: 60, label: 'Add', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_sub: { typeId: 61, label: 'Subtract', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_mult: { typeId: 62, label: 'Multiply', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_div: { typeId: 63, label: 'Divide', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:1}, {id: 'b', label: 'B', type: 'number', default:1}] },
    compare: { typeId: 64, label: 'Compare', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}, {id: 'op', label: 'Op', type: 'select', options: ['>', '<', '==', '!=', '>=', '<='], default: '>'}] },
    math_sin: { typeId: 65, label: 'Sin', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_cos: { typeId: 66, label: 'Cos', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_tan: { typeId: 67, label: 'Tan', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_pi: { typeId: 68, label: 'Pi', category: 'Math', inPorts: [], outPorts: ['out'] },
    math_log: { typeId: 69, label: 'Log', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:1}] },
    math_pos_convert: { typeId: 70, label: 'Pos % <-> px', category: 'Math', inPorts: [], outPorts: ['x', 'y'], params: [{id: 'mode', label: 'Mode', type: 'select', options: ['% to px', 'px to %'], default: '% to px'}, {id: 'x_in', label: 'X In', type: 'number', default: 50}, {id: 'y_in', label: 'Y In', type: 'number', default: 50}] },

    // 80 - 89: Variables
    var_get: { typeId: 80, label: 'Get Variable', category: 'Variables', hideInPalette: true, inPorts: [], outPorts: ['val'] },
    var_set: { typeId: 81, label: 'Set Variable', category: 'Variables', hideInPalette: true, inPorts: ['exec'], outPorts: ['exec'], params: [{id: 'varName', label: 'Variable', type: 'var_select', default: ''}, {id: 'val', label: 'Value', type: 'number', default:0}] },
};

// Reverse-lookup helper: converts numeric typeId back to string type name
function getNodeTypeById(typeId) {
    const num = parseInt(typeId);
    for (const [typeStr, def] of Object.entries(NODE_DEFS)) {
        if (def.typeId === num) return typeStr;
    }
    return null;
}

let nodes = {};
let wires = []; 
let activeScriptName = "Standard";
let savedScripts = [];
let draggedNode = null, dragOffsetX = 0, dragOffsetY = 0;
let draggingWire = null, selectedWire = null, pendingPort = null, dragStartPos = null, paletteDragItem = null;
let isPanning = false, panStartX = 0, panStartY = 0, panStartScrollLeft = 0, panStartScrollTop = 0;
let currentZoom = 1, activePointers = new Map(), lastPinchDist = null;
let evalOrder = [], hasCycleError = false;
let stream = null, usingBackCamera = true, renderLoopId = null, hideControlsTimeout = null;
let videoWidth = 640, videoHeight = 480;
let taintedNodes = new Set();
let errorDetails = {};



const workspaceViewport = document.getElementById('workspace-viewport');
const workspaceInner = document.getElementById('workspace-inner');
const nodesContainer = document.getElementById('nodes-container');
const wiresSvg = document.getElementById('wires-svg');
const singleVideo = document.getElementById('single-video');
const canvasSingle = document.getElementById('canvas-single');
const previewCanvas = document.getElementById('preview-canvas');
const camControlsPanel = document.getElementById('controls-panel'), viewCam = document.getElementById('view-camera');
const palettePanel = document.getElementById('palette-panel'), scriptsPanel = document.getElementById('scripts-panel'), sidebarOverlay = document.getElementById('sidebar-overlay');
const toastAlert = document.getElementById('toast-alert');
const confirmActionModal = document.getElementById('confirm-action-modal');
const modal = document.getElementById('save-modal');
