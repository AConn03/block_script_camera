// --- Audio Engine ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.micStream = null;
        this.micSource = null;
        this.videoSource = null;
        this.masterGain = null;
        this.analyser = null;
        this.mixBus = null;      // <-- NEW: single mixing point for all sources
        this.nodes = {};
        this.initialized = false;
        this.toneOscillators = {};
        this.currentSourceType = 'none';  // 'mic' | 'video' | 'none'
    }

    async init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master output
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);

        // Global analyser (for legacy paths / convenience)
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        // NEW: Mix bus — everything source-related routes through here
        this.mixBus = this.ctx.createGain();
        this.mixBus.gain.value = 1.0;
        this.mixBus.connect(this.masterGain);
        this.mixBus.connect(this.analyser);

        this.initialized = true;
    }

    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    // ---- MIC ----
    async startMic() {
        await this.init();
        await this.resume();
        if (this.micStream) return;

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
            // Route into mix bus, NOT directly to analyser/master
            this.micSource.connect(this.mixBus);
        } catch (e) {
            console.warn("Mic access denied:", e);
            throw e;
        }
    }

    stopMic() {
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
            this.micSource = null;
        }
    }

    setMicState(on) {
        if (on) this.startMic();
        else this.stopMic();
    }

    // ---- VIDEO (uploaded file) ----
    // Call this once per <video> element lifetime. Reconnecting is fine.
    attachVideoSource(videoEl) {
        if (!this.ctx) return;
        if (!this.videoSource) {
            // NOTE: createMediaElementSource can only be called ONCE per element
            this.videoSource = this.ctx.createMediaElementSource(videoEl);
            this.videoSource.connect(this.mixBus);
        } else {
            // Reconnect in case it was disconnected
            try { this.videoSource.disconnect(); } catch(e) {}
            this.videoSource.connect(this.mixBus);
        }
    }

    detachVideoSource() {
        if (this.videoSource) {
            try { this.videoSource.disconnect(); } catch(e) {}
        }
    }

    // ---- MASTER ----
    setMasterVolume(pct) {
        if (!this.masterGain) return;
        this.masterGain.gain.value = Math.max(0, pct / 100);
    }

    // ---- FILTERS/GAIN/ANALYSER (unchanged) ----
    getFilter(nodeId, type) {
        const key = `${nodeId}_${type}`;
        if (!this.nodes[key]) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = type;
            this.nodes[key] = filter;
        }
        return this.nodes[key];
    }

    getGain(nodeId) {
        const key = `${nodeId}_gain`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            this.nodes[key] = g;
        }
        return this.nodes[key];
    }

    getAnalyser(nodeId) {
        const key = `${nodeId}_analyser`;
        if (!this.nodes[key]) {
            const a = this.ctx.createAnalyser();
            a.fftSize = 2048;
            this.nodes[key] = a;
        }
        return this.nodes[key];
    }

    // ---- TONE ----
    createTone(nodeId, freq) {
        if (!this.ctx) return null;
        if (this.toneOscillators[nodeId]) {
            this.toneOscillators[nodeId].frequency.value = freq;
            return this.toneOscillators[nodeId];
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.2;
        osc.connect(gain);
        gain.connect(this.mixBus);  // <-- route to mix bus, not master directly
        osc.start();
        this.toneOscillators[nodeId] = osc;
        return osc;
    }

    stopTone(nodeId) {
        if (this.toneOscillators[nodeId]) {
            try { this.toneOscillators[nodeId].stop(); } catch(e) {}
            delete this.toneOscillators[nodeId];
        }
    }

    // ---- ANALYSIS ----
    getDB(nodeId) {
        const analyser = this.nodes[`${nodeId}_analyser`];
        if (!analyser) return -100;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        return 20 * Math.log10(rms || 1e-10);
    }

    getHz(nodeId, rank = 1) {
        const analyser = this.nodes[`${nodeId}_analyser`];
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const sampleRate = this.ctx.sampleRate;
        const binHz = sampleRate / analyser.fftSize;

        const bins = [];
        for (let i = 1; i < data.length; i++) {
            if (data[i] > 10) bins.push({ freq: i * binHz, mag: data[i] });
        }
        bins.sort((a, b) => b.mag - a.mag);

        if (bins.length === 0) return 0;
        const idx = Math.max(0, Math.min(rank - 1, bins.length - 1));
        return Math.round(bins[idx].freq);
    }
}

const audioEngine = new AudioEngine();