async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (typeof audioEngine !== 'undefined') audioEngine.detachVideoSource();

        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: usingBackCamera ? 'environment' : 'user', width: { ideal: 1280 } },
            audio: false
        });

        singleVideo.src = "";
        singleVideo.muted = true;
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
    videoUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (stream) stopCamera();

        const fileURL = URL.createObjectURL(file);
        singleVideo.srcObject = null;

        singleVideo.setAttribute('playsinline', '');
        singleVideo.setAttribute('webkit-playsinline', '');

        singleVideo.src = fileURL;
        singleVideo.muted = true;
        singleVideo.volume = 1;

        [singleVideo, canvasSingle].forEach(el => { if (el) el.style.objectFit = 'contain'; });

        // STEP 1: Wait for metadata
        await new Promise((resolve) => {
            if (singleVideo.readyState >= 1) resolve();
            else singleVideo.addEventListener('loadedmetadata', resolve, { once: true });
        });

        window._lockedVideoWidth = singleVideo.videoWidth;
        window._lockedVideoHeight = singleVideo.videoHeight;

        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            const onVideoFrame = (now, metadata) => {
                singleVideo._lastFrameTime = metadata.mediaTime;
                singleVideo.requestVideoFrameCallback(onVideoFrame);
            };
            singleVideo.requestVideoFrameCallback(onVideoFrame);
        }

        // STEP 1.5: Prime the decoder (muted play, brief pause, rewind)
        try {
            await singleVideo.play();
            await new Promise(resolve => setTimeout(resolve, 150));
            singleVideo.pause();
            singleVideo.currentTime = 0;
        } catch (e) {
            console.warn("Priming play failed:", e);
        }

        // STEP 2: Attach to Web Audio (context guaranteed running)
        if (typeof audioEngine !== 'undefined') {
            await audioEngine.init();
            await audioEngine.waitForRunning();
            audioEngine.attachVideoSource(singleVideo);
        }

        // STEP 3: Final playback
        try {
            await singleVideo.play();
        } catch (e) {
            console.warn("Video play failed:", e);
        }

        singleVideo.muted = false;
        singleVideo.volume = 1;

        document.getElementById('start-camera').disabled = false;
        document.getElementById('stop-camera').disabled = true;
    });
}