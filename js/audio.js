// --- Audio Engine ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.micStream = null;
        this.micSource = null;
        this.videoSource = null;
        this.nodes = {};
        this.initialized = false;
        this.toneOscillators = {};
        this.toneGains = {};
        this.outputs = {};
        this.lastIncoming = {};   // nodeId -> sourceNode (for teardown)
    }

    async init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    // ---------- MIC (hardware) ----------
    async startMic() {
        await this.init();
        await this.resume();
        if (this.micStream) return;
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
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

    // ---------- VIDEO (uploaded file) ----------
    attachVideoSource(videoEl) {
        if (!this.ctx) return;
        if (!this.videoSource) {
            this.videoSource = this.ctx.createMediaElementSource(videoEl);
        }
        // Do NOT connect to anything — nodes will pull from it
    }

    detachVideoSource() {
        if (this.videoSource) {
            try { this.videoSource.disconnect(); } catch(e) {}
        }
    }

    getActiveSourceNode() {
        if (this.micSource) return this.micSource;
        if (this.videoSource) return this.videoSource;
        return null;
    }

    // ---------- PER-NODE SUB-GRAPH NODES ----------
    getGain(nodeId, key = 'gain') {
        const k = `${nodeId}_${key}`;
        if (!this.nodes[k]) {
            const g = this.ctx.createGain();
            this.nodes[k] = g;
        }
        return this.nodes[k];
    }

    // Legacy: single-type biquad chain. Still used if other code references it.
    getFilterChain(nodeId, type, poles) {
        poles = Math.max(1, Math.min(8, parseInt(poles) || 1));
        const key = `${nodeId}_filterchain_${type}`;
        const metaKey = `${key}_poles`;

        if (this.nodes[key] && this.nodes[metaKey] === poles) {
            return this.nodes[key];
        }

        const prevIncoming = this.lastIncoming[nodeId];
        if (prevIncoming && this.nodes[key]) {
            try { prevIncoming.disconnect(this.nodes[key]); } catch(e) {}
        }

        if (this.nodes[key]) {
            try { this.nodes[key].disconnect(); } catch(e) {}
        }
        Object.keys(this.nodes).forEach(k => {
            if (k.startsWith(`${nodeId}_fchain_${type}_`)) {
                try { this.nodes[k].disconnect(); } catch(e) {}
                delete this.nodes[k];
            }
        });

        const filters = [];
        for (let i = 0; i < poles; i++) {
            const f = this.ctx.createBiquadFilter();
            f.type = type;
            this.nodes[`${nodeId}_fchain_${type}_${i}`] = f;
            filters.push(f);
        }
        for (let i = 0; i < filters.length - 1; i++) {
            filters[i].connect(filters[i + 1]);
        }

        this.nodes[key] = filters[0];
        this.nodes[metaKey] = poles;
        this.lastIncoming[nodeId] = null;

        return filters[0];
    }

    // Hz filter: high-pass chain at minHz, low-pass chain at maxHz, chained in series.
    // Returns { hpHead, lpTail }. Rebuilds if signature changes.
    getHzFilterChain(nodeId, minHz, maxHz, poles) {
        poles = Math.max(1, Math.min(8, parseInt(poles) || 4));
        const key = `${nodeId}_hzfilter`;
        const metaKey = `${key}_meta`;
        const sig = `${minHz}|${maxHz}|${poles}`;

        if (this.nodes[key] && this.nodes[metaKey] === sig) {
            return {
                hpHead: this.nodes[`${nodeId}_hzfilter_hp_0`],
                lpTail: this.nodes[`${nodeId}_hzfilter_lp_${poles - 1}`]
            };
        }

        // Tear down old chain
        Object.keys(this.nodes).forEach(k => {
            if (k.startsWith(`${nodeId}_hzfilter_`)) {
                try { this.nodes[k].disconnect(); } catch(e) {}
                delete this.nodes[k];
            }
        });
        this.lastIncoming[nodeId] = null;

        // High-pass chain at minHz
        const hp = [];
        for (let i = 0; i < poles; i++) {
            const f = this.ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = minHz;
            f.Q.value = 0.7071;
            this.nodes[`${nodeId}_hzfilter_hp_${i}`] = f;
            hp.push(f);
        }
        for (let i = 0; i < hp.length - 1; i++) hp[i].connect(hp[i + 1]);

        // Low-pass chain at maxHz
        const lp = [];
        for (let i = 0; i < poles; i++) {
            const f = this.ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = maxHz;
            f.Q.value = 0.7071;
            this.nodes[`${nodeId}_hzfilter_lp_${i}`] = f;
            lp.push(f);
        }
        for (let i = 0; i < lp.length - 1; i++) lp[i].connect(lp[i + 1]);

        // Wire HP tail → LP head
        hp[hp.length - 1].connect(lp[0]);

        this.nodes[key] = hp[0];
        this.nodes[metaKey] = sig;

        return { hpHead: hp[0], lpTail: lp[lp.length - 1] };
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

    getOutput(nodeId) {
        const key = `${nodeId}_out`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            g.gain.value = 1.0;
            this.nodes[key] = g;
            // Connect to speakers — this is the ONLY place we hit destination
            g.connect(this.ctx.destination);
        }
        return this.nodes[key];
    }

    removeNode(nodeId) {
        this.stopTone(nodeId);

        // Disconnect and delete all local sub-nodes for this nodeId
        Object.keys(this.nodes).forEach(k => {
            if (k.startsWith(`${nodeId}_`)) {
                try { this.nodes[k].disconnect(); } catch(e) {}
                delete this.nodes[k];
            }
        });

        delete this.lastIncoming[nodeId];
    }

    // ---------- TONE (source) ----------
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
        gain.gain.value = 1.0;
        osc.connect(gain);
        osc.start();
        this.toneOscillators[nodeId] = osc;
        this.toneGains[nodeId] = gain;
        return osc;
    }

    stopTone(nodeId) {
        if (this.toneOscillators[nodeId]) {
            try { this.toneOscillators[nodeId].stop(); } catch(e) {}
            delete this.toneOscillators[nodeId];
            delete this.toneGains[nodeId];
        }
    }

    // ---------- dB GATE ----------
    // Pass-through gain, 1 when in range, 0 when out. Toggled per frame.
    getDbGate(nodeId) {
        const key = `${nodeId}_dbgate`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            g.gain.value = 1.0;
            this.nodes[key] = g;
        }
        return this.nodes[key];
    }

    // ---------- MERGE (2-input) ----------
    getMerge(nodeId, mode) {
        const key = `${nodeId}_merge_${mode}`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            g.gain.value = 1.0;
            this.nodes[key] = g;
        }
        return this.nodes[key];
    }

    getMergeGainA(nodeId) {
        const key = `${nodeId}_mergeGainA`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            g.gain.value = 1.0;
            this.nodes[key] = g;
        }
        return this.nodes[key];
    }

    getMergeGainB(nodeId) {
        const key = `${nodeId}_mergeGainB`;
        if (!this.nodes[key]) {
            const g = this.ctx.createGain();
            g.gain.value = 1.0;
            this.nodes[key] = g;
        }
        return this.nodes[key];
    }

    // ---------- ANALYSIS ----------
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

    // ---------- CONNECTION MANAGEMENT ----------
    // Idempotent connect: tears down stale edges before re-connecting
    setInput(nodeId, incomingSourceNode, localNode) {
        const prev = this.lastIncoming[nodeId];

        if (prev && prev !== incomingSourceNode) {
            try { prev.disconnect(localNode); } catch(e) {}
        }

        if (incomingSourceNode && localNode) {
            try { incomingSourceNode.disconnect(localNode); } catch(e) {}
            try { incomingSourceNode.connect(localNode); } catch(e) {}
        }

        this.lastIncoming[nodeId] = incomingSourceNode;
    }

    safeConnect(fromNode, toNode) {
        if (!fromNode || !toNode) return;
        try { fromNode.disconnect(toNode); } catch(e) {}
        try { fromNode.connect(toNode); } catch(e) {}
    }

    safeDisconnect(fromNode, toNode) {
        if (!fromNode || !toNode) return;
        try { fromNode.disconnect(toNode); } catch(e) {}
    }
}

const audioEngine = new AudioEngine();