// --- Camera Control Logic --- 
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        
        // Updated to request audio: true
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: usingBackCamera ? 'environment' : 'user', width: { ideal: 1280 } }, 
            audio: true 
        });
        
        // Clear any uploaded video before starting the camera
        videoLeft.src = "";
        videoRight.src = "";
        singleVideo.src = "";
        
        videoLeft.srcObject = videoRight.srcObject = singleVideo.srcObject = stream;
        document.getElementById('start-camera').disabled = true; 
        document.getElementById('stop-camera').disabled = false; 
        triggerControlsFade();
    } catch (e) {
        showToast("Camera error: " + e.message, true);
    }
}

function stopCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop()); 
    stream = null; 
    videoLeft.srcObject = videoRight.srcObject = singleVideo.srcObject = null;
    document.getElementById('start-camera').disabled = false; 
    document.getElementById('stop-camera').disabled = true; 
}

document.getElementById('start-camera').onclick = startCamera;  
document.getElementById('stop-camera').onclick = stopCamera; 
document.getElementById('switch-camera').onclick = () => { 
    usingBackCamera = !usingBackCamera; 
    if (stream) startCamera(); 
}; 

// --- VR Mode Logic --- 
function updateVRMode() {
    if (vrMode) {
        document.getElementById('video-container').style.display = 'flex'; 
        singleVideo.style.display = 'none';
        document.getElementById('single-canvas-wrapper').style.display = 'none'; 
        document.getElementById('vr-offset-controls').style.display = 'flex'; 
        document.getElementById('toggle-vr').textContent = 'Disable VR View';
    } else {
        document.getElementById('video-container').style.display = 'none'; 
        singleVideo.style.display = 'block';
        document.getElementById('single-canvas-wrapper').style.display = 'block'; 
        document.getElementById('vr-offset-controls').style.display = 'none'; 
        document.getElementById('toggle-vr').textContent = 'Enable VR View';
    }
    updateOffset(); 
}

document.getElementById('toggle-vr').onclick = () => { 
    vrMode = !vrMode; 
    updateVRMode(); 
    triggerControlsFade(); 
}; 

function updateOffset() {
    const wL = document.getElementById('wrapper-left'), wR = document.getElementById('wrapper-right');
    if (vrMode) { 
        wL.style.transform = `translateX(-${vrOffset}px)`; 
        wR.style.transform = `translateX(${vrOffset}px)`; 
    } else { 
        wL.style.transform = 'translateX(0)'; 
        wR.style.transform = 'translateX(0)'; 
    } 
}

document.getElementById('offset-out').onclick = () => { 
    vrOffset = Math.min(200, vrOffset + 10); 
    updateOffset(); 
    triggerControlsFade(); 
}; 

document.getElementById('offset-in').onclick = () => { 
    vrOffset = Math.max(0, vrOffset - 10); 
    updateOffset(); 
    triggerControlsFade(); 
}; 

document.getElementById('offset-reset').onclick = () => { 
    vrOffset = 0; 
    updateOffset(); 
    triggerControlsFade(); 
}; 

function triggerControlsFade() {
    camControlsPanel.classList.remove('hidden');
    if (hideControlsTimeout) clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(() => { camControlsPanel.classList.add('hidden'); }, 4000);  
}

viewCam.addEventListener('click', (e) => {
    if (!e.target.closest('#controls-panel') && !e.target.closest('button')) {
        if (camControlsPanel.classList.contains('hidden')) triggerControlsFade();
        else { camControlsPanel.classList.add('hidden'); clearTimeout(hideControlsTimeout); }
    }
});

// --- Video Upload Logic ---
const uploadBtn = document.getElementById('upload-btn');
const videoUpload = document.getElementById('video-upload');

// Trigger the hidden file input when the styled button is clicked
if (uploadBtn && videoUpload) {
    uploadBtn.onclick = () => {
        videoUpload.click();
        triggerControlsFade(); 
    };

    // Handle the file selection
    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 1. Stop the live camera if it is currently running
        if (stream) {
            stopCamera();
        }

        // 2. Create a local URL for the uploaded video file
        const fileURL = URL.createObjectURL(file);

        // 3. Clear the srcObject (camera stream) and set the src (file stream)
        videoLeft.srcObject = null;
        videoRight.srcObject = null;
        singleVideo.srcObject = null;

        videoLeft.src = fileURL;
        videoRight.src = fileURL;
        singleVideo.src = fileURL;

        // 4. Update the UI buttons
        document.getElementById('start-camera').disabled = false;
        document.getElementById('stop-camera').disabled = true;
    });
}
