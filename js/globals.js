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
    camera: { label: 'Camera In', category: 'I/O', inPorts: [], outPorts: ['video'] },
    screen: { label: 'Screen Out', category: 'I/O', inPorts: ['render'], outPorts: [] },
    
    fps: { label: 'Framerate Limit', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'fps', label: 'Max FPS', type: 'range', min: 1, max: 60, default: 30 }] },
    delay: { label: 'Image Delay', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 1, max: 60, default: 15 }] },
    brightness: { label: 'Brightness', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, default: 0 }] },
    contrast: { label: 'Contrast', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, default: 0 }] },
    hue_shift: { label: 'Hue Shift', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'deg', label: 'Degrees', type: 'range', min: -180, max: 180, default: 0 }] },
    saturation: { label: 'Saturation', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 200, default: 100 }] },
    
    translate: { label: 'Translate', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'cx', label: 'Coarse X', type: 'range', min: -1000, max: 1000, default: 0 }, { id: 'fx', label: 'Fine X', type: 'range', min: -50, max: 50, default: 0 }, { id: 'cy', label: 'Coarse Y', type: 'range', min: -1000, max: 1000, default: 0 }, { id: 'fy', label: 'Fine Y', type: 'range', min: -50, max: 50, default: 0 }] },
    scale: { label: 'Scale', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'scale', label: 'Scale (%)', type: 'range', min: 1, max: 500, default: 100 }] },
    flip: { label: 'Flip', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'flipX', label: 'Flip X', type: 'select', options: ['false', 'true'], default: 'false' }, { id: 'flipY', label: 'Flip Y', type: 'select', options: ['false', 'true'], default: 'false' }] },
    grayscale: { label: 'Grayscale', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 100, default: 100 }] },
    invert: { label: 'Invert', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'amount', label: 'Amount (%)', type: 'range', min: 0, max: 100, default: 100 }] },
    tint: { label: 'RGB Filter', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'r', label: 'Red', type: 'range', min: 0, max: 255, default: 255 }, { id: 'g', label: 'Green', type: 'range', min: 0, max: 255, default: 255 }, { id: 'b', label: 'Blue', type: 'range', min: 0, max: 255, default: 255 }] },
    bandpass: { label: 'Band Pass', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'channel', label: 'Target', type: 'select', options: ['luma', 'red', 'green', 'blue'], default: 'luma' }, { id: 'median', label: 'Value', type: 'range', min: 0, max: 255, default: 127 }, { id: 'range', label: 'Width', type: 'range', min: 0, max: 255, default: 50 }] },
    
    hsv_pass: { label: 'HSV Pass', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'target', label: 'Hue', type: 'range', min: 0, max: 360, default: 0 }, { id: 'tol', label: 'Hue Tol', type: 'range', min: 0, max: 180, default: 30 }, { id: 's_target', label: 'Sat', type: 'range', min: 0, max: 100, default: 100 }, { id: 's_tol', label: 'Sat Tol', type: 'range', min: 0, max: 100, default: 75 }, { id: 'v_target', label: 'Val', type: 'range', min: 0, max: 100, default: 100 }, { id: 'v_tol', label: 'Val Tol', type: 'range', min: 0, max: 100, default: 100 }, { id: 'mode', label: 'Bg Mode', type: 'select', options: ['transparent', 'mask', 'grayscale', 'black'], default: 'transparent' }] },
    chroma: { label: 'Chroma Key', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'r', label: 'Red', type: 'range', min:0, max:255, default:0 }, { id: 'g', label: 'Green', type: 'range', min:0, max:255, default:255 }, { id: 'b', label: 'Blue', type: 'range', min:0, max:255, default:0 }, { id: 'tol', label: 'Tolerance', type: 'range', min:1, max:200, default:80 }] },
    edge: { label: 'Edge Detect', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'mode', label: 'Mode', type: 'select', options: ['grayscale', 'binary'], default: 'grayscale' }, { id: 'intensity', label: 'Thresh', type: 'range', min: 1, max: 255, default: 50 }] },
    mask: { label: 'Luma Mask', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'invert', label: 'Invert', type: 'select', options: ['false', 'true'], default: 'false' }] },
    pixelate: { label: 'Pixelate', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'size', label: 'Block', type: 'range', min:1, max:100, default:10 }] },
    
    accumulate: { label: 'Long Exposure', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 2, max: 60, default: 15 }, { id: 'mode', label: 'Blend', type: 'select', options: ['average', 'lighten', 'darken'], default: 'average' }] },
    blend: { label: 'Blend', category: 'Image Processing', inPorts: ['bg', 'fg'], outPorts: ['out'], params: [{ id: 'mode', label: 'Mode', type: 'select', options: ['mix', 'add', 'multiply', 'screen', 'difference'], default: 'mix' }, { id: 'mix', label: 'Amount', type: 'range', min: 0, max: 100, default: 50 }] },
    get_position: { label: 'Get Position (Mask)', category: 'Image Processing', inPorts: ['in'], outPorts: ['x', 'y', 'found'] },
    draw_point: { label: 'Draw Point', category: 'Image Processing', inPorts: ['in'], outPorts: ['out'], params: [{id: 'x', label:'X', type:'number', default:50}, {id:'y', label:'Y', type:'number', default:50}] },
    
    on_start: { label: 'On Start', category: 'Triggers', inPorts: [], outPorts: ['exec'] },
    on_frame: { label: 'On Frame', category: 'Triggers', inPorts: [], outPorts: ['exec'] },
    ui_button: { label: 'UI Button', category: 'Triggers', inPorts: [], outPorts: ['exec'], params: [{id: 'text', label: 'Text', type: 'text', default: 'Click Me'}, {id: 'x', label: 'X (%)', type: 'number', default: 50}, {id: 'y', label: 'Y (%)', type: 'number', default: 80}, {id: 'w', label: 'Width', type: 'number', default: 120}, {id: 'h', label: 'Height', type: 'number', default: 40}] },
    logic_delay: { label: 'Logic Delay', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'], params: [{ id: 'frames', label: 'Frames', type: 'range', min: 1, max: 60, default: 15 }] },
    if_else: { label: 'If / Else', category: 'Triggers', inPorts: ['exec', 'cond'], outPorts: ['true', 'false'] },
    capture_frame: { label: 'Capture Frame', category: 'Triggers', inPorts: ['exec', 'video'], outPorts: ['video'] },
    cam_pause: { label: 'Pause Camera', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'] },
    cam_resume: { label: 'Resume Camera', category: 'Triggers', inPorts: ['exec'], outPorts: ['exec'] },
    
    math_add: { label: 'Add', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_sub: { label: 'Subtract', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_mult: { label: 'Multiply', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}] },
    math_div: { label: 'Divide', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:1}, {id: 'b', label: 'B', type: 'number', default:1}] },
    compare: { label: 'Compare', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'A', type: 'number', default:0}, {id: 'b', label: 'B', type: 'number', default:0}, {id: 'op', label: 'Op', type: 'select', options: ['>', '<', '==', '!=', '>=', '<='], default: '>'}] },
    math_sin: { label: 'Sin', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_cos: { label: 'Cos', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_tan: { label: 'Tan', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:0}] },
    math_pi: { label: 'Pi', category: 'Math', inPorts: [], outPorts: ['out'] },
    math_log: { label: 'Log', category: 'Math', inPorts: [], outPorts: ['out'], params: [{id: 'a', label: 'Value', type: 'number', default:1}] },
    time_sec: { label: 'Time (sec)', category: 'Math', inPorts: [], outPorts: ['val'] },
    time_date: { label: 'Date (day)', category: 'Math', inPorts: [], outPorts: ['val'] },
    math_pos_convert: { label: 'Pos % <-> px', category: 'Math', inPorts: [], outPorts: ['x', 'y'], params: [{id: 'mode', label: 'Mode', type: 'select', options: ['% to px', 'px to %'], default: '% to px'}, {id: 'x_in', label: 'X In', type: 'number', default: 50}, {id: 'y_in', label: 'Y In', type: 'number', default: 50}] },
    
    var_get: { label: 'Get Variable', category: 'Variables', hideInPalette: true, inPorts: [], outPorts: ['val'] },
    var_set: { label: 'Set Variable', category: 'Variables', hideInPalette: true, inPorts: ['exec'], outPorts: ['exec'], params: [{id: 'varName', label: 'Variable', type: 'var_select', default: ''}, {id: 'val', label: 'Value', type: 'number', default:0}] },
};

let nodes = {};
let wires = []; 
let activeScriptName = "Standard";
let savedScripts = [];
let draggedNode = null, dragOffsetX = 0, dragOffsetY = 0;
let draggingWire = null, selectedWire = null, pendingPort = null, dragStartPos = null, paletteDragItem = null;
let isPanning = false, panStartX = 0, panStartY = 0, panStartScrollLeft = 0, panStartScrollTop = 0;
let currentZoom = 1, activePointers = new Map(), lastPinchDist = null;
let evalOrder = [], hasCycleError = false;
let stream = null, usingBackCamera = true, vrMode = false, vrOffset = 0, renderLoopId = null, hideControlsTimeout = null;
let videoWidth = 640, videoHeight = 480;
let taintedNodes = new Set();
let errorDetails = {};

const workspaceViewport = document.getElementById('workspace-viewport');
const workspaceInner = document.getElementById('workspace-inner');
const nodesContainer = document.getElementById('nodes-container');
const wiresSvg = document.getElementById('wires-svg');
const videoLeft = document.getElementById('video-left'), videoRight = document.getElementById('video-right'), singleVideo = document.getElementById('single-video');
const canvasLeft = document.getElementById('canvas-left'), canvasRight = document.getElementById('canvas-right'), canvasSingle = document.getElementById('canvas-single');
const previewCanvas = document.getElementById('preview-canvas');
const camControlsPanel = document.getElementById('controls-panel'), viewCam = document.getElementById('view-camera');
const palettePanel = document.getElementById('palette-panel'), scriptsPanel = document.getElementById('scripts-panel'), sidebarOverlay = document.getElementById('sidebar-overlay');
const toastAlert = document.getElementById('toast-alert');
const confirmActionModal = document.getElementById('confirm-action-modal');
const modal = document.getElementById('save-modal');
