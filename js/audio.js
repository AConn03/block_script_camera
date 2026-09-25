// --- Audio Engine ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.micStream = null;
        this.micSource = null;
        this.masterGain = null;
        this.analyser = null;
        this.nodes = {}; // per-node audio nodes
        this.initialized = false;
        this.toneOscillators = {}; // per play_tone node
    }

    async init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.initialized = true;
    }

    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    async startMic() {
        await this.init();
        await this.resume();
        if (this.micStream) return; // already running

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
            });
            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
            this.micSource.connect(this.analyser);
            this.analyser.connect(this.masterGain);
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

    setMasterVolume(pct) {
        if (!this.masterGain) return;
        this.masterGain.gain.value = Math.max(0, pct / 100);
    }

    // Create/get a filter node for a given block
    getFilter(nodeId, type) {
        const key = `${nodeId}_${type}`;
        if (!this.nodes[key]) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = type; // 'lowpass', 'highpass', 'bandpass'
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
        gain.connect(this.masterGain);
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

    // Get dB level from an analyser node
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

    // Get loudest frequency, with rank (1 = peak, 2 = 2nd peak, etc.)
    getHz(nodeId, rank = 1) {
        const analyser = this.nodes[`${nodeId}_analyser`];
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const sampleRate = this.ctx.sampleRate;
        const binHz = sampleRate / analyser.fftSize;

        // Collect all bins as [freq, magnitude]
        const bins = [];
        for (let i = 1; i < data.length; i++) { // skip DC
            if (data[i] > 10) bins.push({ freq: i * binHz, mag: data[i] });
        }
        bins.sort((a, b) => b.mag - a.mag);

        // Average nearby peaks for stability
        const idx = Math.max(0, Math.min(rank - 1, bins.length - 1));
        if (bins.length === 0) return 0;
        return Math.round(bins[idx].freq);
    }
}

const audioEngine = new AudioEngine();