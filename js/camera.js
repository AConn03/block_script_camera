async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: usingBackCamera ? 'environment' : 'user', width: { ideal: 1280 } },
            audio: false
        });

        // Clear any previously loaded file. Setting src = "" can throw in Chrome,
        // so use removeAttribute + load() instead.
        singleVideo.pause();
        singleVideo.removeAttribute('src');
        singleVideo.load();

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

        // --- iOS FIX 1: Set playsinline BEFORE loading ---
        // Without this, iOS forces fullscreen or freezes canvas frame capture.
        singleVideo.setAttribute('playsinline', '');
        singleVideo.setAttribute('webkit-playsinline', '');
        // Note: crossOrigin is intentionally NOT set — blob URLs are same-origin
        // and setting crossOrigin can actually break canvas capture on some browsers.

        singleVideo.src = fileURL;
        singleVideo.muted = true;   // muted autoplay is allowed without gesture
        singleVideo.volume = 1;

        [singleVideo, canvasSingle].forEach(el => { if (el) el.style.objectFit = 'contain'; });

        // STEP 1: Ensure we have metadata (videoWidth/Height available)
        await new Promise((resolve) => {
            if (singleVideo.readyState >= 1) resolve();
            else singleVideo.addEventListener('loadedmetadata', resolve, { once: true });
        });

        // STEP 2: Start playback FIRST (muted is fine — autoplay policy allows this)
        // Doing this BEFORE createMediaElementSource avoids the iOS 13 freeze bug
        // where the video gets stuck in a paused state after audio is rerouted.
        try {
            await singleVideo.play();
        } catch (e) {
            console.warn("Video play failed:", e);
        }

        // STEP 3: Attach to Web Audio AFTER playback has started.
        // This is the critical ordering fix for iOS. The media pipeline is now
        // active and stable, so rerouting audio through the Web Audio graph won't
        // freeze the video.
        if (typeof audioEngine !== 'undefined') {
            await audioEngine.init();
            await audioEngine.resume();  // Must resume before attaching on iOS
            audioEngine.attachVideoSource(singleVideo);
        }

        // STEP 4: Unmute — required so createMediaElementSource outputs real audio.
        // A muted element feeds silence into the Web Audio graph.
        singleVideo.muted = false;
        singleVideo.volume = 1;

        document.getElementById('start-camera').disabled = false;
        document.getElementById('stop-camera').disabled = true;
    });
}