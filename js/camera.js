// --- Camera Control Logic --- 
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: usingBackCamera ? 'environment' : 'user', width: { ideal: 1280 } }, 
            audio: true 
        });
        
        // Clear any uploaded video before starting the camera
        videoLeft.src = "";
        videoRight.src = "";
        singleVideo.src = "";
        
        // Reset to 'cover' so the live camera fills the screen
        videoLeft.style.objectFit = "cover";
        videoRight.style.objectFit = "cover";
        singleVideo.style.objectFit = "cover";
        
        videoLeft.srcObject = videoRight.srcObject = singleVideo.srcObject = stream;
        document.getElementById('start-camera').disabled = true; 
        document.getElementById('stop-camera').disabled = false; 
        triggerControlsFade();
    } catch (e) {
        if (typeof showToast === 'function') showToast("Camera error: " + e.message, true);
    }
}
function stopCamera() {
    // Safely check if the stream is a media stream object before stopping tracks
    if (stream && typeof stream !== "string") {
        stream.getTracks().forEach(t => t.stop()); 
    }
    
    stream = null; 
    videoLeft.srcObject = videoRight.srcObject = singleVideo.srcObject = null;
    
    // Also clear out any uploaded video that might be playing
    singleVideo.pause();
    singleVideo.src = "";

    document.getElementById('start-camera').disabled = false; 
    document.getElementById('stop-camera').disabled = true; 
}

// --- VR Mode Logic --- 
function updateVRMode() {
    if (vrMode) {
        document.getElementById('video-container').style.display = 'flex'; 
        
        // Hide single video safely so the browser doesn't pause its playback
        singleVideo.style.opacity = '0';
        singleVideo.style.position = 'absolute';
        singleVideo.style.pointerEvents = 'none';

        document.getElementById('single-canvas-wrapper').style.display = 'none'; 
        document.getElementById('vr-offset-controls').style.display = 'flex'; 
        document.getElementById('toggle-vr').textContent = 'Disable VR View';
    } else {
        document.getElementById('video-container').style.display = 'none'; 
        
        // Restore single video visibility safely
        singleVideo.style.opacity = '1';
        singleVideo.style.position = 'relative';
        singleVideo.style.pointerEvents = 'auto';

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
    
        if (stream) {
            stopCamera();
        }
    
        // 1. Trick the engine into rendering by setting stream to a truthy value
        stream = "uploaded_video"; 
    
        const fileURL = URL.createObjectURL(file);
    
        // 2. Clear left/right videos to prevent browser decoding crashes
        videoLeft.srcObject = null; videoLeft.src = "";
        videoRight.srcObject = null; videoRight.src = "";
        singleVideo.srcObject = null;
    
        // 3. Only play on singleVideo. The node engine will automatically copy the processed frames to the VR canvases!
        singleVideo.src = fileURL;
        singleVideo.style.objectFit = "contain";
        
        // 4. Apply contain to canvases so the engine output respects the video's aspect ratio
        canvasLeft.style.objectFit = "contain";
        canvasRight.style.objectFit = "contain";
        canvasSingle.style.objectFit = "contain";
    
        // 5. Play the video
        const playPromise = singleVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Autoplay blocked.", error);
                if (typeof showToast === 'function') showToast("Click the screen to allow video playback", true);
            });
        }
    
        document.getElementById('start-camera').disabled = false;
        document.getElementById('stop-camera').disabled = true;
    });
}
