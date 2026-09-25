async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        // Detach any uploaded video from the mix bus
        if (typeof audioEngine !== 'undefined') {
            audioEngine.detachVideoSource();
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: usingBackCamera ? 'environment' : 'user', width: { ideal: 1280 } },
            audio: false
        });

        singleVideo.src = "";
        singleVideo.muted = true;   // camera path is muted, audio comes from mic node
        singleVideo.srcObject = stream;

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
    singleVideo.srcObject = null;
    
    // Also stop audio
    if (typeof audioEngine !== 'undefined') {
        audioEngine.stopMic();
        // Optionally stop all tones
        Object.keys(audioEngine.toneOscillators).forEach(id => audioEngine.stopTone(id));
    }
    
    document.getElementById('start-camera').disabled = false; 
    document.getElementById('stop-camera').disabled = true;
}

document.getElementById('start-camera').onclick = startCamera; 
document.getElementById('stop-camera').onclick = stopCamera; 
document.getElementById('switch-camera').onclick = () => { 
    usingBackCamera = !usingBackCamera; 
    if (stream) startCamera(); 
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

const uploadBtn = document.getElementById('upload-btn');
const videoUpload = document.getElementById('video-upload');

if (uploadBtn) {
    uploadBtn.onclick = () => { videoUpload.click(); triggerControlsFade(); };
}

if (videoUpload) {
    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (stream) stopCamera();

        const fileURL = URL.createObjectURL(file);
        singleVideo.srcObject = null;
        singleVideo.src = fileURL;

        [singleVideo, canvasSingle].forEach(el => { if (el) el.style.objectFit = 'contain'; });

        // IMPORTANT: keep element muted since audio now flows through Web Audio
        singleVideo.muted = false;   // keep audible via mix bus
        singleVideo.play().catch(() => {
            singleVideo.muted = true;
            singleVideo.play();
        });

        if (typeof audioEngine !== 'undefined') {
            audioEngine.init().then(() => audioEngine.resume()).then(() => {
                audioEngine.attachVideoSource(singleVideo);
                // Optionally: also connect mic if user wants both simultaneously
                // if (audioEngine.micStream) audioEngine.micSource.connect(audioEngine.mixBus);
            });
        }

        document.getElementById('start-camera').disabled = false;
        document.getElementById('stop-camera').disabled = true;
    });
}