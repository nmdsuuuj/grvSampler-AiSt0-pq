
import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, Sample, PlaybackParams, BiquadFilterType } from '../types';
import { PADS_PER_BANK, TOTAL_BANKS, TOTAL_SAMPLES, LFO_SYNC_RATES, MOD_SOURCES, MOD_DESTINATIONS } from '../constants';

const RAMP_TIME = 0.005; // 5ms ramp for all parameter changes to prevent clicks

// Custom hook to get the previous value of a prop or state
const usePrevious = <T,>(value: T): T | undefined => {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};

// Type for the persistent synth graph nodes
type SynthGraphNodes = {
    oscSource1: OscillatorNode | AudioBufferSourceNode;
    oscSource2: OscillatorNode | AudioBufferSourceNode;
    osc1Gain: GainNode;
    osc2Gain: GainNode;
    shaper1: WaveShaperNode;
    shaper1InputGain: GainNode;
    shaper2: WaveShaperNode;
    shaper2InputGain: GainNode;
    mixer: GainNode;
    fm1Gain: GainNode; // Modulates osc1 freq
    fm2Gain: GainNode; // Modulates osc2 freq
    preFilterGain: GainNode; // Gain before standard filters
    filterNode1: BiquadFilterNode;
    filterNode2: BiquadFilterNode;
    // For new filters
    combDelay: DelayNode;
    combFeedbackGain: GainNode;
    combInGain: GainNode;
    combOutGain: GainNode;
    formantInGain: GainNode;
    formantFilters: BiquadFilterNode[];
    formantOutGain: GainNode;
    vca: GainNode;
    lfo1: OscillatorNode;
    lfo2: OscillatorNode;
    modGains: { [key: string]: GainNode }; // For LFO -> destination modulation
    lfo1_ws1_modGain: GainNode;
    lfo1_ws2_modGain: GainNode;
    // Envelope Source for Mod Matrix
    filterEnvSource: ConstantSourceNode;
    filterEnvGain: GainNode;
};

// --- Synth Audio Generation Helpers (outside hook for memoization) ---
const makeDistortionCurve = (type: string, amount: number): Float32Array => {
    const k = amount;
    const n_samples = 4096;
    const curve = new Float32Array(n_samples);
    const pi = Math.PI;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        switch(type) {
            case 'Hard Clip': curve[i] = Math.max(-1, Math.min(1, x * (1 + k * 10))); break;
            case 'Soft Clip': curve[i] = Math.tanh(x * (1 + k * 4)); break;
            case 'Bitcrush': const bits = Math.round(16 * (1 - k)); const steps = Math.pow(2, Math.max(1, bits)); curve[i] = Math.round(x * steps) / steps; break;
            case 'Foldback': curve[i] = Math.sin(x * (1 + k * 10)); break;
            case 'Arctan': curve[i] = Math.atan(x * (1 + k * 10)) / (pi / 2); break;
            case 'Tanh': curve[i] = Math.tanh(x * (1 + k * 10)); break;
            case 'Sine Warp': curve[i] = Math.sin(pi * x * (1 + k)); break;
            case 'Half Rectify': curve[i] = Math.max(0, x); break;
            case 'Full Rectify': curve[i] = Math.abs(x); break;
            case 'Gloubi': const a = 1 + k * 100; curve[i] = (x > 0 ? 1 : -1) * (1 - Math.exp(-a * Math.abs(x))); break;
            case 'Expo Clip': curve[i] = (x > 0 ? 1 : -1) * (1 - Math.exp(-Math.abs(x) * (1 + k * 5))); break;
            case 'Hard Limit': curve[i] = Math.max(-1 + k, Math.min(1 - k, x)); break;
            case 'Germanium': curve[i] = x < 0.2 ? x : 0.2 + (x - 0.2) * (0.1 + 0.9 * (1 - k)); break;
            case 'Silicon': curve[i] = x < 0.7 ? x : 0.7 + (x - 0.7) * (0.01 + 0.99 * (1 - k)); break;
            case 'Tube': const q = x / (1 - k * 0.9); curve[i] = q / (1 + Math.abs(q)) / (1 / (1 + Math.abs(1))); break;
            case 'Fuzz': const blend = x * (k * 10 + 1); curve[i] = (blend > 0 ? 1 : -1) * (1 - Math.exp(-Math.abs(blend))); break;
            case 'Diode': const vd = 0.2, vt = 0.025; curve[i] = x > vd ? x - vd : (vt * Math.log(1 + x/vt)); break;
            case 'Chebyshev': const cheby_n = 2 + Math.floor(k * 8); let cheby_x = x; let T0 = 1, T1 = x, Tn = 0; for(let j=2; j<=cheby_n; j++) { Tn = 2*x*T1 - T0; T0 = T1; T1 = Tn; } curve[i] = T1; break;
            case 'Resampler': const rate = Math.pow(2, Math.floor(k * 6)); curve[i] = Math.floor(x * rate) / rate; break;
            case 'Asymmetric': curve[i] = x > 0 ? Math.tanh(x * (1 + k * 5)) : Math.tanh(x * (1 + (k/2) * 5)); break;
            case 'Phase Shift': curve[i] = Math.sin(x*pi + k*pi); break;
            case 'Quantize': const levels = 2 + Math.floor(k * 30); curve[i] = Math.round(x * levels) / levels; break;
            case 'S-Curve': curve[i] = (3 * x - Math.pow(x, 3)) / 2; break;
            case 'Crossover': const cross_thresh = k; curve[i] = Math.abs(x) < cross_thresh ? 0 : x; break;
            case 'Saturator': curve[i] = x / (1 - k + k * Math.abs(x)); break;
            case 'Digital OD': const digi_k = 1-k; curve[i] = x > digi_k ? digi_k : (x < -digi_k ? -digi_k : x); break;
            case 'Tape': curve[i] = Math.tanh(x + k * Math.pow(x, 3)); break;
            case 'Transistor': const vbe = 0.7; curve[i] = x < vbe ? 0 : x - vbe * (1-k); break;
            case 'Diode Rectify': curve[i] = x > 0 ? x * (1 - k) : 0; break;
            case 'Sine Fold': curve[i] = Math.sin(x*pi*(1 + k*5)); break;
            case 'Crush Fold': const crush_bits = Math.round(16 * (1 - k)); const crush_steps = Math.pow(2, Math.max(1, crush_bits)); const crushed = Math.round(x * crush_steps) / crush_steps; curve[i] = Math.sin(crushed * pi * 5); break;
            case 'Parabolic Shaper': curve[i] = x * (1 + k) - k * x * Math.abs(x); break;
            default: curve[i] = x; break;
        }
    }
    return curve;
};

// Revert to simple Map for caching (No WeakMap)
const oscWaveCache = new Map<string, PeriodicWave>();
const noiseBufferCache = new Map<string, AudioBuffer>();
const lfoWaveCache = new Map<string, PeriodicWave>();

const createLfoWave = (type: string, audioContext: AudioContext): PeriodicWave => {
    if (lfoWaveCache.has(type)) {
        return lfoWaveCache.get(type)!;
    }

    const n = 4096;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    imag[0] = 0; real[0] = 0;

    for (let i = 1; i < n; i++) {
        const pi_i = Math.PI * i;
        switch (type) {
            case 'Sine': imag[i] = (i === 1) ? 1 : 0; break;
            case 'Triangle': if (i % 2 !== 0) imag[i] = 8 / (pi_i * pi_i) * (Math.pow(-1, (i - 1) / 2)); break;
            case 'Square': if (i % 2 !== 0) imag[i] = 4 / pi_i; break;
            case 'Saw Down': imag[i] = 2 / pi_i; break;
            case 'Saw Up': imag[i] = -2 / pi_i; break;
            case 'Pulse 25%': imag[i] = (2 / pi_i) * Math.sin(i * Math.PI * 0.25); break;
            case 'Pulse 10%': imag[i] = (2 / pi_i) * Math.sin(i * Math.PI * 0.10); break;
            case 'S&H Smooth': imag[i] = (Math.random() * 2 - 1) / i; break;
            case 'Sine Half': if (i === 1) imag[i] = 0.5; else if (i % 2 === 0) real[i] = -2 / (Math.PI * (i * i - 1)); break;
            case 'Expo Up': imag[i] = -2 / pi_i; break; // Approx
            case 'Expo Down': imag[i] = 2 / pi_i; break; // Approx
            case 'Ramp Up': imag[i] = -2 / pi_i; break;
            case 'Ramp Down': imag[i] = 2 / pi_i; break;
            case 'Spike': imag[i] = Math.pow(-1, i) * (2 / pi_i); break;
            default: // Random/Weird/Stairs/Others - Generate rich spectra with random phase for interesting LFO shapes
                 imag[i] = (Math.random() * 2 - 1) / Math.pow(i, 1.2);
                 real[i] = (Math.random() * 2 - 1) / Math.pow(i, 1.2);
                 break;
        }
    }

    const wave = audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
    lfoWaveCache.set(type, wave);
    return wave;
};

const createOscillatorSource = (type: string, audioContext: AudioContext): OscillatorNode | AudioBufferSourceNode => {
    if (type === 'Noise' || type === 'Glitch') {
         if (noiseBufferCache.has(type)) {
            const cached = noiseBufferCache.get(type)!;
            const source = audioContext.createBufferSource();
            source.buffer = cached;
            source.loop = true;
            return source;
        }
        const bufferSize = audioContext.sampleRate * 2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        if (type === 'Noise') {
             for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        } else { // Glitch
            let last = 0;
            for (let i = 0; i < bufferSize; i++) {
                if (Math.random() < 0.001) last = Math.random() * 2 - 1;
                output[i] = last;
            }
        }
        noiseBufferCache.set(type, buffer);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        return source;
    }

    const osc = audioContext.createOscillator();
    const standardTypes: { [key: string]: OscillatorType } = {
        'Sine': 'sine', 'Square': 'square', 'Saw Down': 'sawtooth', 'Triangle': 'triangle',
    };
    if (standardTypes[type]) {
        osc.type = standardTypes[type];
        return osc;
    }

    if (oscWaveCache.has(type)) {
        osc.setPeriodicWave(oscWaveCache.get(type)!);
        return osc;
    }

    const n = 4096;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    imag[0] = 0; real[0] = 0;

    for (let i = 1; i < n; i++) {
        const pi_i = Math.PI * i;
        switch(type) {
            case 'Saw Up': imag[i] = -2 / pi_i; break;
            case 'Pulse 75%': for (let k=1; k<n; k++) if (k % 4 !== 0) imag[k] = (2/(k*Math.PI)); break;
            case 'Pulse 25%': for (let k=1; k<n; k++) imag[k] = (2/(k*Math.PI)) * Math.sin(k * Math.PI / 2); break;
            case 'Pulse 10%': for (let k=1; k<n; k++) imag[k] = (2/(k*Math.PI)) * Math.sin(k * Math.PI / 5); break;
            case 'Supersaw': for (let j=1; j<20; j++) imag[j] = (Math.random() * 2 - 1) / j; break;
            case 'PWM': for (let j=1; j<n; j++) real[j] = Math.sin(Math.PI * j * 0.2) / (j * Math.PI); break;
            case 'Tri-Saw': if (i % 2 !== 0) imag[i] = (8 * Math.sin(pi_i / 2) / (pi_i * pi_i)) + (1 / pi_i); break;
            case 'Tri-Square': if (i % 2 !== 0) imag[i] = (8 * Math.sin(pi_i / 2) / (pi_i * pi_i)) + (2 / pi_i); break;
            case 'Half-Sine': for (let j=1; j<n; j++) imag[j] = j === 1 ? 1 : (j % 2 === 0 ? 2 / (Math.PI * (1 - j*j)) : 0); real[1] = 1/Math.PI; break;
            case 'Full-Sine': for (let j=2; j<n; j+=2) imag[j] = 4 / (Math.PI * (1 - j*j)); break;
            case 'Bell': for(let j=1; j<n; j++) imag[j] = Math.exp(-j/10) * Math.sin(j*0.2); break;
            case 'Organ': for(let j of [1,2,3,4,6,8]) imag[j] = 1 / j; break;
            case 'Detuned': for (let j=1; j<10; j++) imag[j] = (j%2===0 ? 0.5 : 1) / j; for (let j=1; j<10; j++) real[j] = (j%2!==0 ? 0.5 : 1) / j; break;
            case 'Pluck': for (let j=1; j<n; j++) imag[j] = 1 / (j*j); break;
            case 'Metallic': for (let j of [1, 2.7, 4.1, 5.4, 6.8, 8.2]) if (Math.round(j) < n) imag[Math.round(j)] = 1/j; break;
            case 'Glass': for (let j of [1, 3.2, 5.9, 8.1]) if (Math.round(j) < n) imag[Math.round(j)] = 1/j; break;
            case 'Harmonic': for (let j=1; j<16; j+=2) imag[j] = 1/j; break;
            case 'Formant': for (let j of [3, 5, 8, 12]) imag[j] = 1 / j; break;
            case 'Growl': for (let j=1; j<10; j++) imag[j] = 1/j; real[2] = 0.5; break;
            case 'Wobble': for (let j of [1, 1.5, 2, 2.5]) if(Math.round(j)<n) imag[Math.round(j)] = 1/j; break;
            case 'Digital': for (let j=1; j<16; j++) imag[j] = Math.random() < 0.5 ? 1/j : 0; break;
            case 'Resonant': if (i<32) imag[i] = 1 - (i/32); break;
            case 'Choir': for(let j of [1,2,4,8]) imag[j] = Math.exp(-j/10); break;
            case 'Voice': for(let j=1; j<10; j++) imag[j] = Math.sin(pi_i / 2) / j; break;
            case 'Bass': for (let j of [1,2]) imag[j] = 1; break;
            case 'Reverse Saw': imag[i] = 2 / pi_i * (i%2===0 ? 1 : -1); break;
            default: imag[i] = (i === 1) ? 1 : 0; break; // Default to Sine
        }
    }

    const wave = audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
    oscWaveCache.set(type, wave);
    osc.setPeriodicWave(wave);
    return osc;
};


// --- Main Hook ---
export const useAudioEngine = () => {
    const { state, dispatch } = useContext(AppContext);
    const { audioContext, samples, bankVolumes, bankPans, bankMutes, bankSolos, isRecording, isArmed, recordingThreshold, activeSampleId, masterVolume, masterCompressorOn, masterCompressorParams, synth, synthModMatrix } = state;
    
    const masterGainRef = useRef<GainNode | null>(null);
    const masterCompressorRef = useRef<DynamicsCompressorNode | null>(null);
    const masterClipperRef = useRef<WaveShaperNode | null>(null);
    const bankGainsRef = useRef<GainNode[]>([]);
    const bankPannersRef = useRef<StereoPannerNode[]>([]);
    const sampleGainsRef = useRef<GainNode[]>([]);
    const lpFilterNodesRef = useRef<BiquadFilterNode[]>([]);
    const hpFilterNodesRef = useRef<BiquadFilterNode[]>([]);
    const activeSourcesRef = useRef<Map<number, Set<AudioBufferSourceNode>>>(new Map());
    
    // --- MONO SYNTH REFS ---
    const synthGraphRef = useRef<{
        nodes: SynthGraphNodes;
        osc1Type: string;
        osc2Type: string;
    } | null>(null);
    const activeNoteRef = useRef<{ gateEndTime: number } | null>(null);

    // Create a ref to hold the latest state for use in callbacks without causing re-renders.
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    
    // Refs for sample recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Refs for master recording
    const masterDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const masterRecorderRef = useRef<MediaRecorder | null>(null);
    const masterChunksRef = useRef<Blob[]>([]);


    // Get previous state for efficient diffing
    const prevSamples = usePrevious(samples);

    // --- Initialize core audio graph (runs once) ---
    useEffect(() => {
        if (audioContext && masterGainRef.current === null) {
            // Master Compressor
            const compressor = audioContext.createDynamicsCompressor();
            masterCompressorRef.current = compressor;

            // Master Safety Clipper
            const clipper = audioContext.createWaveShaper();
            const robustCurve = new Float32Array(4096);
            for (let i = 0; i < 4096; i++) {
                const x = (i - 2048) / 2048;
                robustCurve[i] = Math.tanh(x);
            }
            clipper.curve = robustCurve;
            masterClipperRef.current = clipper;

             // Master Gain
            const masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            masterGainRef.current = masterGain;

            // Connect compressor -> clipper -> master gain
            compressor.connect(clipper);
            clipper.connect(masterGain);


            for (let i = 0; i < TOTAL_BANKS; i++) {
                const gainNode = audioContext.createGain();
                gainNode.gain.value = state.bankVolumes[i];
                
                const pannerNode = audioContext.createStereoPanner();
                pannerNode.pan.value = state.bankPans[i];

                gainNode.connect(pannerNode);
                pannerNode.connect(masterCompressorRef.current); 

                bankGainsRef.current.push(gainNode);
                bankPannersRef.current.push(pannerNode);
            }
            
            const lpFilters: BiquadFilterNode[] = [];
            const hpFilters: BiquadFilterNode[] = [];
            const sampleGains: GainNode[] = [];
            for (let i = 0; i < TOTAL_SAMPLES; i++) {
                const lpFilter = audioContext.createBiquadFilter();
                lpFilter.type = 'lowpass';
                lpFilter.frequency.value = state.samples[i].lpFreq;
                lpFilter.Q.value = 1;

                const hpFilter = audioContext.createBiquadFilter();
                hpFilter.type = 'highpass';
                hpFilter.frequency.value = state.samples[i].hpFreq;
                hpFilter.Q.value = 1;

                const sampleGainNode = audioContext.createGain();
                sampleGainNode.gain.value = state.samples[i].volume;
                
                const bankIndex = Math.floor(i / PADS_PER_BANK);
                if (bankGainsRef.current[bankIndex]) {
                    lpFilter.connect(hpFilter);
                    hpFilter.connect(sampleGainNode);
                    sampleGainNode.connect(bankGainsRef.current[bankIndex]);
                }

                lpFilters.push(lpFilter);
                hpFilters.push(hpFilter);
                sampleGains.push(sampleGainNode);
            }
            lpFilterNodesRef.current = lpFilters;
            hpFilterNodesRef.current = hpFilters;
            sampleGainsRef.current = sampleGains;
        }

        // --- NEW: Initialize persistent synth graph ---
        if (audioContext && !synthGraphRef.current) {
            const oscSource1 = createOscillatorSource(state.synth.osc1.type, audioContext);
            const oscSource2 = createOscillatorSource(state.synth.osc2.type, audioContext);
            const osc1Gain = audioContext.createGain();
            const osc2Gain = audioContext.createGain();
            const shaper1 = audioContext.createWaveShaper();
            const shaper1InputGain = audioContext.createGain();
            const shaper2 = audioContext.createWaveShaper();
            const shaper2InputGain = audioContext.createGain();
            const mixer = audioContext.createGain();
            const fm1Gain = audioContext.createGain(); // Modulates osc1 freq
            const fm2Gain = audioContext.createGain(); // Modulates osc2 freq
            const preFilterGain = audioContext.createGain();
            const filterNode1 = audioContext.createBiquadFilter();
            const filterNode2 = audioContext.createBiquadFilter();
            const vca = audioContext.createGain();
            const lfo1 = audioContext.createOscillator();
            const lfo2 = audioContext.createOscillator();
            const lfo1_ws1_modGain = audioContext.createGain();
            const lfo1_ws2_modGain = audioContext.createGain();

            // Special Filter Nodes
            const combDelay = audioContext.createDelay(1.0);
            const combFeedbackGain = audioContext.createGain();
            const combInGain = audioContext.createGain();
            const combOutGain = audioContext.createGain();
            const formantInGain = audioContext.createGain();
            const formantFilters = [audioContext.createBiquadFilter(), audioContext.createBiquadFilter(), audioContext.createBiquadFilter()];
            const formantOutGain = audioContext.createGain();

            // Filter Env Source
            const filterEnvSource = audioContext.createConstantSource();
            filterEnvSource.offset.value = 1;
            const filterEnvGain = audioContext.createGain();
            filterEnvGain.gain.value = 0;
            filterEnvSource.connect(filterEnvGain);
            filterEnvSource.start();

            // --- Build Audio Graph ---
            oscSource1.connect(shaper1InputGain);
            shaper1InputGain.connect(shaper1);
            shaper1.connect(osc1Gain);
            osc1Gain.connect(mixer);

            oscSource2.connect(shaper2InputGain);
            shaper2InputGain.connect(shaper2);
            shaper2.connect(osc2Gain);
            osc2Gain.connect(mixer);
            
            // --- Flexible Filter Routing ---
            mixer.connect(preFilterGain);
            mixer.connect(combInGain);
            mixer.connect(formantInGain);

            // Standard Path
            preFilterGain.connect(filterNode1);
            filterNode1.connect(filterNode2);
            filterNode2.connect(vca);

            // Comb Path
            combInGain.connect(combDelay);
            combDelay.connect(combFeedbackGain);
            combFeedbackGain.connect(combDelay); // Feedback loop
            combDelay.connect(combOutGain);
            combOutGain.connect(vca);
            
            // Formant Path
            formantFilters.forEach(f => {
                formantInGain.connect(f);
                f.connect(formantOutGain);
            });
            formantOutGain.connect(vca);


            const bankIndex = 3;
            if (bankGainsRef.current[bankIndex]) {
                vca.connect(bankGainsRef.current[bankIndex]);
            }

            // Set initial VCA gain to 0
            vca.gain.value = 0;

            // --- Modulation Setup ---
            const modGains: { [key: string]: GainNode } = {};
            
            // Connect static FM destination nodes
            if (oscSource1 instanceof OscillatorNode) fm1Gain.connect(oscSource1.frequency);
            if (oscSource2 instanceof OscillatorNode) fm2Gain.connect(oscSource2.frequency);


            MOD_SOURCES.forEach(source => {
                const modSourceNode = source === 'lfo1' ? lfo1 : (source === 'lfo2' ? lfo2 : filterEnvGain);
                MOD_DESTINATIONS.forEach(dest => {
                    const gainNode = audioContext.createGain();
                    gainNode.gain.value = 0; // Initialize all mod depths to 0
                    modGains[`${source}_${dest}`] = gainNode;
                    modSourceNode.connect(gainNode);

                    // --- CONNECT DESTINATIONS ---
                    if (dest === 'osc1FM') gainNode.connect(fm1Gain.gain);
                    if (dest === 'osc2FM') gainNode.connect(fm2Gain.gain);
                    if (dest === 'filterCutoff') {
                        gainNode.connect(filterNode1.frequency);
                        gainNode.connect(filterNode2.frequency);
                    }
                    if (dest === 'filterQ') {
                         gainNode.connect(filterNode1.Q);
                         gainNode.connect(filterNode2.Q);
                    }
                    if (dest === 'osc1Pitch' && oscSource1 instanceof OscillatorNode) gainNode.connect(oscSource1.detune);
                    if (dest === 'osc2Pitch' && oscSource2 instanceof OscillatorNode) gainNode.connect(oscSource2.detune);
                    
                    // FIX: CONNECT WAVE MODULATION
                    if (dest === 'osc1Wave') gainNode.connect(shaper1InputGain.gain);
                    if (dest === 'osc2Wave') gainNode.connect(shaper2InputGain.gain);
                });
            });
            
            lfo1_ws1_modGain.gain.value = 0;
            lfo1_ws2_modGain.gain.value = 0;
            lfo1.connect(lfo1_ws1_modGain);
            lfo1.connect(lfo1_ws2_modGain);
            lfo1_ws1_modGain.connect(shaper1InputGain.gain);
            lfo1_ws2_modGain.connect(shaper2InputGain.gain);

            lfo1.start();
            lfo2.start();
            oscSource1.start();
            oscSource2.start();

            synthGraphRef.current = {
                nodes: {
                    oscSource1, oscSource2, osc1Gain, osc2Gain, shaper1, shaper1InputGain, shaper2, shaper2InputGain,
                    mixer, fm1Gain, fm2Gain, preFilterGain, filterNode1, filterNode2, vca, lfo1, lfo2, modGains,
                    lfo1_ws1_modGain, lfo1_ws2_modGain,
                    combDelay, combFeedbackGain, combInGain, combOutGain,
                    formantInGain, formantFilters, formantOutGain,
                    filterEnvSource, filterEnvGain
                },
                osc1Type: state.synth.osc1.type,
                osc2Type: state.synth.osc2.type,
            };

            // --- Robust initial FM connection ---
            if (oscSource1 instanceof OscillatorNode && oscSource2 instanceof OscillatorNode) {
                oscSource1.connect(fm2Gain);
                oscSource2.connect(fm1Gain);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioContext]);

    // --- EFFECT: Handle Filter Type Change Routing ---
    useEffect(() => {
        if (!synthGraphRef.current || !state.audioContext) return;
        const { nodes } = synthGraphRef.current;
        const { filter } = state.synth;
        const now = state.audioContext.currentTime;

        // Reset all filter input gains to 0 to prevent signal bleeding
        nodes.preFilterGain.gain.cancelScheduledValues(now);
        nodes.preFilterGain.gain.setValueAtTime(0, now);
        
        nodes.combInGain.gain.cancelScheduledValues(now);
        nodes.combInGain.gain.setValueAtTime(0, now);
        
        nodes.formantInGain.gain.cancelScheduledValues(now);
        nodes.formantInGain.gain.setValueAtTime(0, now);

        // Open specific route based on type
        if (filter.type.startsWith('Comb')) {
            nodes.combInGain.gain.setValueAtTime(1, now);
            // Set feedback polarity
            const feedback = filter.type === 'Comb+' ? 0.95 : -0.95; 
            // Scale feedback by resonance (0-30 -> 0-0.99) roughly
            const resFactor = Math.min(0.99, filter.resonance / 30 * 0.99);
            nodes.combFeedbackGain.gain.setValueAtTime(filter.type === 'Comb-' ? -resFactor : resFactor, now);
            
            // Comb frequency control (delay time)
            // Cutoff (Hz) -> Delay Time (s)
            // T = 1/f
            const delayTime = 1 / Math.max(20, filter.cutoff);
            nodes.combDelay.delayTime.setValueAtTime(delayTime, now);

        } else if (filter.type === 'Formant Vowel') {
            nodes.formantInGain.gain.setValueAtTime(1, now);
            // Formant approximation logic
            const c = filter.cutoff; // 20 - 20000
            
            // Just static filter setup that moves with cutoff
            nodes.formantFilters[0].type = 'bandpass';
            nodes.formantFilters[0].frequency.setValueAtTime(c, now);
            nodes.formantFilters[0].Q.setValueAtTime(filter.resonance, now);
            
            nodes.formantFilters[1].type = 'bandpass';
            nodes.formantFilters[1].frequency.setValueAtTime(c * 2.5, now);
            nodes.formantFilters[1].Q.setValueAtTime(filter.resonance, now);
            
            nodes.formantFilters[2].type = 'bandpass';
            nodes.formantFilters[2].frequency.setValueAtTime(c * 3.5, now);
            nodes.formantFilters[2].Q.setValueAtTime(filter.resonance, now);

        } else if (filter.type === 'Peak') {
             nodes.preFilterGain.gain.setValueAtTime(1, now);
        } else {
            // Standard Lowpass/Highpass/Bandpass
            nodes.preFilterGain.gain.setValueAtTime(1, now);
        }

    }, [state.synth.filter.type, state.synth.filter.cutoff, state.synth.filter.resonance, state.audioContext]);

    // --- EFFECT: Sync Mod Matrix Gains Reactively ---
    useEffect(() => {
        if (!synthGraphRef.current || !state.audioContext) return;
        const { nodes } = synthGraphRef.current;
        const now = state.audioContext.currentTime;
        const { synthModMatrix, isModMatrixMuted } = state;
        const effectiveMatrix = isModMatrixMuted ? {} : synthModMatrix;

        // 1. Reset all mod gains to 0 (to handle removed connections)
        Object.values(nodes.modGains).forEach(g => {
            // Use setValueAtTime for immediate reset (essential for Clear button)
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(0, now);
        });

        // 2. Apply current matrix with proper scaling
        Object.entries(effectiveMatrix).forEach(([source, dests]) => {
            Object.entries(dests).forEach(([dest, amount]) => {
                const gainNode = nodes.modGains[`${source}_${dest}`];
                if (gainNode) {
                    let scaledAmount = amount;
                    // Apply scaling based on destination type to make modulation audible
                    if (dest.includes('Pitch')) {
                        // 1.0 = 1 Octave (1200 cents)
                        scaledAmount = amount * 1200; 
                    } else if (dest.includes('Cutoff')) {
                        // 1.0 = 2400 Hz range approx
                        scaledAmount = amount * 2400;
                    } else if (dest.includes('FM')) {
                        // 1.0 = 2000 Hz modulation depth
                        scaledAmount = amount * 2000;
                    } else if (dest.includes('Wave')) {
                        // 1.0 = 5.0 gain (significant distortion change)
                        scaledAmount = amount * 5;
                    } else if (dest.includes('Q')) {
                        scaledAmount = amount * 10;
                    }
                    
                    // Use setValueAtTime for immediate response to fader
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(scaledAmount, now);
                }
            });
        });
    }, [state.synthModMatrix, state.isModMatrixMuted, state.audioContext]);


    // --- ARCHITECTURAL FIX: Effect for handling waveform changes safely ---
    useEffect(() => {
        if (!audioContext || !synthGraphRef.current) return;

        const { nodes } = synthGraphRef.current;
        const graph = synthGraphRef.current; // Capture ref for safe access
        
        const handleWaveformChange = (oscIndex: 1 | 2) => {
            const currentType = oscIndex === 1 ? synth.osc1.type : synth.osc2.type;
            const oldType = oscIndex === 1 ? graph.osc1Type : graph.osc2Type;

            if (currentType === oldType) return; // No change needed

            const oldSource = oscIndex === 1 ? nodes.oscSource1 : nodes.oscSource2;
            const shaperInput = oscIndex === 1 ? nodes.shaper1InputGain : nodes.shaper2InputGain;

            // 1. Disconnect and stop the old source
            try { oldSource.disconnect(); } catch (e) { /* ignore */ }
            try { oldSource.stop(); } catch (e) { /* ignore */ }

            // 2. Create and start the new source
            const newSource = createOscillatorSource(currentType, audioContext);
            newSource.start();
            newSource.connect(shaperInput); // Connect to main audio path

            // 3. Update the graph reference
            if (oscIndex === 1) {
                nodes.oscSource1 = newSource;
                graph.osc1Type = currentType;
            } else {
                nodes.oscSource2 = newSource;
                graph.osc2Type = currentType;
            }
            
            // 4. Update LFO->Pitch and FM routing after the change
            const { oscSource1, oscSource2, modGains, fm1Gain, fm2Gain } = nodes;
            
            // Disconnect old pitch modulations
            const lfo1PitchGain = oscIndex === 1 ? modGains['lfo1_osc1Pitch'] : modGains['lfo1_osc2Pitch'];
            const lfo2PitchGain = oscIndex === 1 ? modGains['lfo2_osc1Pitch'] : modGains['lfo2_osc2Pitch'];
            const envPitchGain  = oscIndex === 1 ? modGains['filterEnv_osc1Pitch'] : modGains['filterEnv_osc2Pitch'];

            if (oldSource instanceof OscillatorNode) {
                 try { lfo1PitchGain.disconnect(oldSource.detune); } catch(e){}
                 try { lfo2PitchGain.disconnect(oldSource.detune); } catch(e){}
                 try { envPitchGain.disconnect(oldSource.detune); } catch(e){}
            }

            // Connect new pitch modulations
            if (newSource instanceof OscillatorNode) {
                lfo1PitchGain.connect(newSource.detune);
                lfo2PitchGain.connect(newSource.detune);
                envPitchGain.connect(newSource.detune);
            }

            // Disconnect all FM sources (where THIS osc is the carrier or modulator)
            // 1. FM Modulator connection (this osc -> other osc's FM gain)
            if (oscIndex === 1) { // OSC 1 -> FM 2
                 try { oscSource1.disconnect(fm2Gain); } catch(e){}
            } else { // OSC 2 -> FM 1
                 try { oscSource2.disconnect(fm1Gain); } catch(e){}
            }
            
            // 2. FM Carrier connection (FM gain -> this osc freq)
            const myFmGain = oscIndex === 1 ? fm1Gain : fm2Gain;
            if (oldSource instanceof OscillatorNode) {
                try { myFmGain.disconnect(oldSource.frequency); } catch(e){}
            }
            if (newSource instanceof OscillatorNode) {
                myFmGain.connect(newSource.frequency);
            }

            // Reconnect FM modulators if both are oscillators
            if (nodes.oscSource1 instanceof OscillatorNode && nodes.oscSource2 instanceof OscillatorNode) {
                // Ensure connections exist
                try { nodes.oscSource1.connect(fm2Gain); } catch(e){}
                try { nodes.oscSource2.connect(fm1Gain); } catch(e){}
            }
        };
        
        handleWaveformChange(1);
        handleWaveformChange(2);

    }, [synth.osc1.type, synth.osc2.type, audioContext, synth]);
    
    // --- State Synchronization Effect ---
    useEffect(() => {
        if (!audioContext || sampleGainsRef.current.length === 0) {
            return;
        }
        const now = audioContext.currentTime;

        if (prevSamples) {
            samples.forEach((currentSample, i) => {
                const prevSample = prevSamples[i];
                if (!prevSample) return;

                if (currentSample.volume !== prevSample.volume) {
                    const gainNode = sampleGainsRef.current[i];
                    if (gainNode) gainNode.gain.setValueAtTime(currentSample.volume, now);
                }
                if (currentSample.lpFreq !== prevSample.lpFreq) {
                     const filterNode = lpFilterNodesRef.current[i];
                    if (filterNode) filterNode.frequency.setValueAtTime(currentSample.lpFreq, now);
                }
                if (currentSample.hpFreq !== prevSample.hpFreq) {
                     const filterNode = hpFilterNodesRef.current[i];
                    if (filterNode) filterNode.frequency.setValueAtTime(currentSample.hpFreq, now);
                }
            });
        }

        const isAnyBankSoloed = bankSolos.some(s => s);
        for (let i = 0; i < TOTAL_BANKS; i++) {
            const gainNode = bankGainsRef.current[i];
            if (gainNode) {
                let targetVolume = bankVolumes[i];
                if (isAnyBankSoloed) {
                    if (!bankSolos[i]) targetVolume = 0;
                } else {
                    if (bankMutes[i]) targetVolume = 0;
                }
                
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.linearRampToValueAtTime(targetVolume, now + RAMP_TIME);
            }
        }
        
        bankPans.forEach((pan, i) => {
            const pannerNode = bankPannersRef.current[i];
            if (pannerNode) {
                pannerNode.pan.cancelScheduledValues(now);
                pannerNode.pan.setValueAtTime(pannerNode.pan.value, now);
                pannerNode.pan.linearRampToValueAtTime(pan, now + RAMP_TIME);
            }
        });
        
        if (masterGainRef.current) {
            masterGainRef.current.gain.cancelScheduledValues(now);
            masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, now);
            masterGainRef.current.gain.linearRampToValueAtTime(masterVolume, now + RAMP_TIME);
        }

        if (masterCompressorRef.current) {
            const { threshold, knee, ratio, attack, release } = masterCompressorParams;
            const comp = masterCompressorRef.current;
            const targetValues = masterCompressorOn ? { threshold, knee, ratio, attack, release } : { threshold: 0, knee: 0, ratio: 1, attack: 0, release: 0.25 };
            
            comp.threshold.cancelScheduledValues(now);
            comp.threshold.setValueAtTime(comp.threshold.value, now);
            comp.threshold.linearRampToValueAtTime(targetValues.threshold, now + RAMP_TIME);

            comp.knee.cancelScheduledValues(now);
            comp.knee.setValueAtTime(comp.knee.value, now);
            comp.knee.linearRampToValueAtTime(targetValues.knee, now + RAMP_TIME);

            comp.ratio.cancelScheduledValues(now);
            comp.ratio.setValueAtTime(comp.ratio.value, now);
            comp.ratio.linearRampToValueAtTime(targetValues.ratio, now + RAMP_TIME);

            comp.attack.cancelScheduledValues(now);
            comp.attack.setValueAtTime(comp.attack.value, now);
            comp.attack.linearRampToValueAtTime(targetValues.attack, now + RAMP_TIME);

            comp.release.cancelScheduledValues(now);
            comp.release.setValueAtTime(comp.release.value, now);
            comp.release.linearRampToValueAtTime(targetValues.release, now + RAMP_TIME);
        }


    }, [samples, bankVolumes, bankPans, bankMutes, bankSolos, masterVolume, audioContext, prevSamples, masterCompressorOn, masterCompressorParams]);
    

    const playSample = useCallback((sampleId: number, scheduleTime: number, playbackParams?: Partial<PlaybackParams>) => {
        const { audioContext: ctx, samples: currentSamples } = stateRef.current;
        if (!ctx || lpFilterNodesRef.current.length === 0) return;
        
        const sample = currentSamples[sampleId];
        if (!sample || !sample.buffer) return;

        const effectiveTime = scheduleTime === 0 ? ctx.currentTime : scheduleTime;
        
        const baseParams: PlaybackParams = {
            detune: 0,
            velocity: 1,
            volume: sample.volume,
            pitch: sample.pitch,
            start: sample.start,
            end: sample.end || 1,
            decay: sample.decay,
            loop: sample.loop || false,
            playbackMode: sample.playbackMode || 'Forward',
            lpFreq: sample.lpFreq,
            hpFreq: sample.hpFreq
        };

        const params = { ...baseParams, ...playbackParams };

        // Prepare Buffer
        let bufferToPlay = sample.buffer;

        // Handling PingPong (create temporary buffer, heavy operation but necessary without AudioWorklet)
        if (params.playbackMode === 'PingPong') {
            // Create a new buffer that is [Section] + [Reversed Section]
            const startSample = Math.floor(sample.buffer.length * params.start);
            const endSample = Math.floor(sample.buffer.length * params.end);
            if (endSample > startSample) {
                const segmentLength = endSample - startSample;
                const newLength = segmentLength * 2;
                const newBuffer = ctx.createBuffer(sample.buffer.numberOfChannels, newLength, sample.buffer.sampleRate);

                for (let ch = 0; ch < sample.buffer.numberOfChannels; ch++) {
                    const channelData = sample.buffer.getChannelData(ch);
                    const newChannelData = newBuffer.getChannelData(ch);
                    
                    // Copy forward
                    const segment = channelData.subarray(startSample, endSample);
                    newChannelData.set(segment, 0);
                    
                    // Copy backward
                    // We must create a copy to reverse because .reverse() is in-place
                    const reversedSegment = new Float32Array(segment);
                    reversedSegment.reverse();
                    newChannelData.set(reversedSegment, segmentLength);
                }
                bufferToPlay = newBuffer;
            }
        }

        const source = ctx.createBufferSource();
        source.buffer = bufferToPlay;
        
        const envelopeGainNode = ctx.createGain();

        source.connect(envelopeGainNode);
        const lpNode = lpFilterNodesRef.current[sampleId];
        const hpNode = hpFilterNodesRef.current[sampleId];
        const sampleGainNode = sampleGainsRef.current[sampleId];
        envelopeGainNode.connect(lpNode);
        
        sampleGainNode.gain.setValueAtTime(params.volume, effectiveTime);
        lpNode.frequency.setValueAtTime(params.lpFreq, effectiveTime);
        hpNode.frequency.setValueAtTime(params.hpFreq, effectiveTime);

        const totalDetuneCents = (params.pitch * 100) + (params.detune || 0);
        source.detune.setValueAtTime(totalDetuneCents, effectiveTime);
        
        const playbackRate = Math.pow(2, totalDetuneCents / 1200);
        const effectiveRate = params.playbackMode === 'Reverse' ? -playbackRate : playbackRate;
        
        // Set Playback Rate (negative for reverse)
        source.playbackRate.setValueAtTime(effectiveRate, effectiveTime);
        
        // Calculate Duration and Loop Points
        const bufferDuration = bufferToPlay.duration;
        let startOffset = 0;
        let playDuration = 0;

        if (params.playbackMode === 'PingPong') {
             // For PingPong, the buffer is already constructed to be exactly the loop length (Forward + Back)
             // So we start at 0 and loop the whole thing
             startOffset = 0;
             playDuration = bufferDuration / Math.abs(effectiveRate); // The whole pingpong buffer
             
             if (params.loop) {
                source.loop = true;
                source.loopStart = 0;
                source.loopEnd = bufferDuration;
             }
        } else {
             // Standard Forward / Reverse
             const startPoint = Math.min(params.start, params.end) * bufferDuration;
             const endPoint = Math.max(params.start, params.end) * bufferDuration;
             const regionDuration = endPoint - startPoint;
             
             if (params.playbackMode === 'Reverse') {
                 startOffset = endPoint; // Start from end for reverse
             } else {
                 startOffset = startPoint; // Start from start for forward
             }

             playDuration = regionDuration / Math.abs(effectiveRate);

             if (params.loop) {
                 source.loop = true;
                 source.loopStart = startPoint;
                 source.loopEnd = endPoint;
             }
        }
        
        // Apply Envelope
        // If looping, 'decay' acts as a gate/release time or total duration?
        // In this groovebox context, let's make 'decay' strictly control the amp envelope duration.
        // If loop is ON, sound continues until decay runs out.
        
        const decayDuration = bufferDuration * params.decay / Math.abs(playbackRate); // Use original rate for time scaling
        
        const envelope = envelopeGainNode.gain;
        const releaseTime = 0.008;

        envelope.cancelScheduledValues(effectiveTime);
        envelope.setValueAtTime(0, effectiveTime);
        envelope.linearRampToValueAtTime(params.velocity, effectiveTime + RAMP_TIME);

        const stopTime = effectiveTime + decayDuration;
        if (decayDuration > (RAMP_TIME + releaseTime)) {
            envelope.setTargetAtTime(0, stopTime - releaseTime, releaseTime / 4);
        } else {
            envelope.linearRampToValueAtTime(0, stopTime);
        }
        
        source.start(effectiveTime, startOffset);
        source.stop(stopTime);

        if (!activeSourcesRef.current.has(sampleId)) {
            activeSourcesRef.current.set(sampleId, new Set());
        }
        const activeSampleSources = activeSourcesRef.current.get(sampleId)!;
        activeSampleSources.add(source);

        source.onended = () => {
            activeSampleSources.delete(source);
            if (activeSampleSources.size === 0) {
                activeSourcesRef.current.delete(sampleId);
            }
        };

    }, []);

    const scheduleLfoRetrigger = useCallback((lfoIndex: number, time: number) => {
        const { audioContext: ctx, synth: currentSynth, bpm } = stateRef.current;
        const synthGraph = synthGraphRef.current?.nodes;
        if (!ctx || !synthGraph) return;

        const lfo = lfoIndex === 0 ? currentSynth.lfo1 : currentSynth.lfo2;
        const lfoNode = lfoIndex === 0 ? synthGraph.lfo1 : synthGraph.lfo2;

        try {
            lfoNode.stop(time);
        } catch(e) {
            // Can ignore error if it was already stopped
        }

        const newLfoNode = ctx.createOscillator();
        newLfoNode.setPeriodicWave(createLfoWave(lfo.type, ctx));
        
        const syncRateData = LFO_SYNC_RATES[lfo.rate];
        const rate = lfo.rateMode === 'sync' && syncRateData
            ? (bpm / 60) / syncRateData.beats
            : lfo.rate;
        newLfoNode.frequency.setValueAtTime(rate, time);
        
        // Reconnect to all destinations
        const sourceName = lfoIndex === 0 ? 'lfo1' : 'lfo2';
        Object.keys(synthGraph.modGains).forEach(key => {
            if (key.startsWith(sourceName)) {
                newLfoNode.connect(synthGraph.modGains[key]);
            }
        });

        if (lfoIndex === 0) {
            newLfoNode.connect(synthGraph.lfo1_ws1_modGain);
            newLfoNode.connect(synthGraph.lfo1_ws2_modGain);
        }
        
        newLfoNode.start(time);
        
        if (lfoIndex === 0) {
            synthGraph.lfo1 = newLfoNode;
        } else {
            synthGraph.lfo2 = newLfoNode;
        }
    }, []);

    const playSynthNote = useCallback((relativeDetune: number, scheduleTime: number) => {
        const { audioContext: ctx, synth: currentSynth, synthModMatrix: currentModMatrix, isModMatrixMuted } = stateRef.current;
        const synthGraph = synthGraphRef.current;
        if (!ctx || !synthGraph) return;
    
        const now = ctx.currentTime;
        const effectiveTime = scheduleTime === 0 ? now : scheduleTime;
        const { osc1, osc2, oscMix, filter, filterEnv, ampEnv, globalGateTime } = currentSynth;
        
        // Gate handling for overlapping notes (Legato)
        if (activeNoteRef.current && effectiveTime < activeNoteRef.current.gateEndTime) {
             // Legato logic could go here, but for now we just retrigger
        }
        
        const gateEndTime = effectiveTime + globalGateTime;
        activeNoteRef.current = { gateEndTime };

        const { nodes } = synthGraph;
        
        // --- Mod Matrix application has been moved to a useEffect for real-time reactivity ---
        // We only need to set non-modulated / per-note params here.

        // Apply fixed LFO amounts
        nodes.lfo1_ws1_modGain.gain.setValueAtTime(osc1.wsLfoAmount || 0, effectiveTime);
        // FIX: Correctly access the gain node for LFO1 -> WS2
        nodes.lfo1_ws2_modGain.gain.setValueAtTime(osc2.wsLfoAmount || 0, effectiveTime);

        // --- Set Oscillator Parameters ---
        if (nodes.oscSource1 instanceof OscillatorNode) {
            nodes.oscSource1.detune.setValueAtTime((osc1.octave * 1200) + osc1.detune + relativeDetune, effectiveTime);
        }
        if (nodes.oscSource2 instanceof OscillatorNode) {
            nodes.oscSource2.detune.setValueAtTime((osc2.octave * 1200) + osc2.detune + relativeDetune, effectiveTime);
        }
        
        // Mixer
        nodes.osc1Gain.gain.setValueAtTime(1 - oscMix, effectiveTime);
        nodes.osc2Gain.gain.setValueAtTime(oscMix, effectiveTime);

        // Waveshaper Amounts
        nodes.shaper1InputGain.gain.setValueAtTime(osc1.waveshapeAmount * 5 + 1, effectiveTime);
        nodes.shaper2InputGain.gain.setValueAtTime(osc2.waveshapeAmount * 5 + 1, effectiveTime);

        // --- Filter Parameters ---
        const baseCutoff = filter.cutoff;
        nodes.filterNode1.frequency.setValueAtTime(baseCutoff, effectiveTime);
        nodes.filterNode2.frequency.setValueAtTime(baseCutoff, effectiveTime);
        nodes.filterNode1.Q.setValueAtTime(filter.resonance, effectiveTime);
        nodes.filterNode2.Q.setValueAtTime(filter.resonance, effectiveTime);
        
        // Note: Filter types are updated in the useEffect above, not here

        // --- Filter Envelope Triggering ---
        // 1. Direct Envelope -> Filter Frequency
        const envAmt = filter.envAmount;
        const startFreq = baseCutoff;
        const peakFreq = Math.max(20, Math.min(20000, startFreq + envAmt));
        const sustainFreq = Math.max(20, Math.min(20000, startFreq + (envAmt * filterEnv.sustain)));
        
        const tAttack = effectiveTime + Math.max(0.005, filterEnv.attack);
        const tDecay = tAttack + Math.max(0.005, filterEnv.decay);
        
        [nodes.filterNode1.frequency, nodes.filterNode2.frequency].forEach(param => {
            param.cancelScheduledValues(effectiveTime);
            param.setValueAtTime(startFreq, effectiveTime);
            param.linearRampToValueAtTime(peakFreq, tAttack);
            param.linearRampToValueAtTime(sustainFreq, tDecay);
        });

        // 2. Filter Envelope as Modulation Source
        // We automate the gain of the signal coming from the constant source.
        const feGain = nodes.filterEnvGain.gain;
        feGain.cancelScheduledValues(effectiveTime);
        feGain.setValueAtTime(0, effectiveTime);
        feGain.linearRampToValueAtTime(1, tAttack); // Peak at 1 (full modulation depth)
        feGain.linearRampToValueAtTime(filterEnv.sustain, tDecay);
        
        // --- Amp Envelope Triggering ---
        const vcaGain = nodes.vca.gain;
        vcaGain.cancelScheduledValues(effectiveTime);
        vcaGain.setValueAtTime(0, effectiveTime);
        
        // Simple Attack-Decay/Gate envelope for Amp
        const ampAttackTime = 0.005;
        const ampPeakTime = effectiveTime + ampAttackTime;
        const ampDecayEndTime = ampPeakTime + ampEnv.decay;
        
        vcaGain.linearRampToValueAtTime(1, ampPeakTime);
        
        // If globalGateTime implies a gate, we should sustain?
        // But the type `SynthAmpEnvelope` only has `decay`.
        // We treat it as a percussive AD envelope.
        vcaGain.exponentialRampToValueAtTime(0.001, ampDecayEndTime);
        vcaGain.linearRampToValueAtTime(0, ampDecayEndTime + 0.01); // Ensure 0

    }, []);

    const loadSampleFromBlob = useCallback(async (blob: Blob, sampleId: number, name?: string) => {
        const { audioContext: ctx, samples } = stateRef.current;
        if (!ctx) return;
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            
            const newSamples = [...samples];
            newSamples[sampleId] = {
                ...newSamples[sampleId],
                buffer: audioBuffer,
                name: name || newSamples[sampleId].name
            };
            dispatch({ type: ActionType.SET_SAMPLES, payload: newSamples });
        } catch (e) {
            console.error('Error loading sample:', e);
        }
    }, [dispatch]);

    const startRecording = useCallback(async () => {
        const { audioContext: ctx, activeSampleId } = stateRef.current;
        if (!ctx) return;
 
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            
            // LOCAL FLAG to prevent multiple starts in the same session
            let recordingTriggered = false;
 
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
 
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                loadSampleFromBlob(audioBlob, activeSampleId, `Rec ${new Date().toLocaleTimeString()}`);
                
                // Cleanup
                stream.getTracks().forEach(track => track.stop());
                if (sourceNodeRef.current) {
                    sourceNodeRef.current.disconnect();
                    sourceNodeRef.current = null;
                }
                if (analyserRef.current) {
                    analyserRef.current.disconnect();
                    analyserRef.current = null;
                }
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                    animationFrameRef.current = null;
                }
                dispatch({ type: ActionType.SET_RECORDING_STATE, payload: false });
                dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
            };
 
            // Input Monitoring for Threshold
            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;
 
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            // Set Armed State initially
            dispatch({ type: ActionType.SET_ARMED_STATE, payload: true });
            
            const checkAudioLevel = () => {
                // If analyzer is disconnected, stop loop
                if (!analyserRef.current) return;
                
                analyser.getByteTimeDomainData(dataArray);
                
                let max = 0;
                for(let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0; 
                    const y = v - 1;
                    if (Math.abs(y) > max) max = Math.abs(y);
                }
                
                // Access fresh state from ref to avoid closures with stale state
                const { recordingThreshold: currentThreshold } = stateRef.current;
                
                // Trigger logic:
                // 1. Must NOT have started locally in this function scope (prevents race conditions)
                // 2. Check threshold
                if (!recordingTriggered) {
                    if (max > currentThreshold) {
                        recordingTriggered = true;
                        mediaRecorder.start();
                        dispatch({ type: ActionType.SET_RECORDING_STATE, payload: true });
                        dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
                        
                        // Once started, we don't need to monitor for trigger anymore
                        if (animationFrameRef.current) {
                            cancelAnimationFrame(animationFrameRef.current);
                            animationFrameRef.current = null;
                        }
                    } else {
                        // Keep checking
                        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
                    }
                }
            };
            checkAudioLevel();
 
        } catch (err) {
            console.error("Error accessing microphone", err);
            dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
        }
    }, [loadSampleFromBlob, dispatch]);
 
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        } else {
             // Stop stream if we were armed but didn't record
             if (streamRef.current) {
                 streamRef.current.getTracks().forEach(track => track.stop());
             }
             if (animationFrameRef.current) {
                 cancelAnimationFrame(animationFrameRef.current);
             }
             // Cleanup refs manually since onstop won't fire if we didn't record
             if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
            }
            if (analyserRef.current) {
                analyserRef.current.disconnect();
                analyserRef.current = null;
            }

            dispatch({ type: ActionType.SET_RECORDING_STATE, payload: false });
            dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
        }
    }, [dispatch]);

    const startMasterRecording = useCallback(() => {
        const { audioContext: ctx } = stateRef.current;
        if (!ctx || !masterGainRef.current) return;
        
        const dest = ctx.createMediaStreamDestination();
        masterDestinationRef.current = dest;
        masterGainRef.current.connect(dest);
        
        const recorder = new MediaRecorder(dest.stream);
        masterRecorderRef.current = recorder;
        masterChunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) masterChunksRef.current.push(e.data);
        };
        
        recorder.onstop = () => {
            const blob = new Blob(masterChunksRef.current, { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Master - ${new Date().toLocaleTimeString()}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            masterGainRef.current?.disconnect(dest);
            dispatch({ type: ActionType.TOGGLE_MASTER_RECORDING }); 
            dispatch({ type: ActionType.TOGGLE_MASTER_REC_ARMED });
        };
        
        recorder.start();
        dispatch({ type: ActionType.TOGGLE_MASTER_RECORDING });
    }, [dispatch]);
    
    const stopMasterRecording = useCallback(() => {
        if (masterRecorderRef.current && masterRecorderRef.current.state !== 'inactive') {
            masterRecorderRef.current.stop();
        }
    }, []);

    return { 
        playSample, 
        playSynthNote,
        scheduleLfoRetrigger,
        loadSampleFromBlob,
        startRecording,
        stopRecording,
        startMasterRecording,
        stopMasterRecording
    };
};
