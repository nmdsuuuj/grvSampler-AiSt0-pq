import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, Sample, PlaybackParams, BiquadFilterType } from '../types';
import { PADS_PER_BANK, TOTAL_BANKS, TOTAL_SAMPLES, LFO_SYNC_RATES } from '../constants';

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
        switch(type) {
            case 'Sine': imag[i] = (i === 1) ? 1 : 0; break;
            case 'Triangle': if (i % 2 !== 0) imag[i] = 8 * Math.sin(pi_i / 2) / (pi_i * pi_i); break;
            case 'Square': if (i % 2 !== 0) imag[i] = 4 / pi_i; break;
            case 'Saw Down': imag[i] = 2 / pi_i; break;
            case 'Saw Up': imag[i] = -2 / pi_i; break;
            case 'Pulse 25%': imag[i] = (2 / pi_i) * Math.sin(pi_i / 2); break;
            case 'Pulse 10%': imag[i] = (2 / pi_i) * Math.sin(pi_i * 0.2); break;
            case 'S&H Smooth': if (i < 32) imag[i] = (Math.random() * 2 - 1) / i; break;
            case 'Sine Half': for (let j=1; j<n; j++) imag[j] = j === 1 ? 1 : (j % 2 === 0 ? 2 / (Math.PI * (1 - j*j)) : 0); real[1] = 1/Math.PI; break;
            case 'Sine Quarter': for (let j=1; j<n; j++) real[j] = Math.cos(pi_i/2) / (1-i*i) * (4/Math.PI); break;
            case 'Expo Up': for (let j=1; j<n; j++) imag[j] = (2 * (pi_i * Math.cos(pi_i) - Math.sin(pi_i))) / (pi_i * pi_i); break;
            case 'Expo Down': for (let j=1; j<n; j++) imag[j] = (2 * (Math.sin(pi_i) - pi_i)) / (pi_i * pi_i); break;
            case 'Stairs 4': for (let j=1; j<n; j++) imag[j] = (j % 4 !== 0) ? (2/pi_i) * (1-Math.cos(pi_i/2)) : 0; break;
            case 'Stairs 8': for (let j=1; j<n; j++) imag[j] = (j % 8 !== 0) ? (2/pi_i) * (1-Math.cos(pi_i/4)) : 0; break;
            case 'Stairs 16': for (let j=1; j<n; j++) imag[j] = (j % 16 !== 0) ? (2/pi_i) * (1-Math.cos(pi_i/8)) : 0; break;
            case 'Tri-Sine': if (i % 2 !== 0) imag[i] = 4 * Math.sin(pi_i / 2) / (pi_i * pi_i * pi_i); break;
            case 'Bouncing Ball': for(let j=1; j<n; j++) imag[j] = Math.exp(-j/5) * Math.abs(Math.sin(j*0.5)); break;
            case 'Jitter': for(let j=1; j<n; j++) if (j < 64) imag[j] = (Math.random() - 0.5) / Math.sqrt(j); break;
            case 'Ramp Up': for(let j=1; j<n; j++) imag[j] = -2 * Math.cos(pi_i) / pi_i; break;
            case 'Ramp Down': for(let j=1; j<n; j++) imag[j] = 2 * Math.cos(pi_i) / pi_i; break;
            case 'Spike': if (i % 2 !== 0) for(let j=1; j<n; j++) imag[j] = Math.pow(-1, (j-1)/2) / (j*j); break;
            case 'Random Ramp': for(let j=1; j<n; j++) imag[j] = (Math.random() > 0.5 ? 2 : -2) * Math.cos(pi_i) / pi_i; break;
            case 'Random Steps': for(let j=1; j<n; j++) imag[j] = (Math.random() * 2 - 1) / j; break;
            case 'S&H Gliss': if (i < 16) imag[i] = (Math.random() > 0.5 ? 1 : -1) / i; break;
            case 'Sine Bend Up': imag[i] = (i === 1) ? 1 : (i === 2) ? 0.5 : 0; break;
            case 'Sine Bend Down': imag[i] = (i === 1) ? 1 : (i === 2) ? -0.5 : 0; break;
            case 'Cubic': if (i % 2 !== 0) imag[i] = 96 * (pi_i*pi_i - 8) * Math.sin(pi_i) / (pi_i*pi_i*pi_i*pi_i*pi_i); break;
            case 'Parabolic': if (i % 2 === 0) imag[i] = 16 * Math.sin(pi_i/2) / (pi_i*pi_i*pi_i); break;
            case 'Chaotic 1': for(let j=1; j<n; j++) imag[j] = Math.sin(j*j) / j; break;
            case 'Chaotic 2': for(let j=1; j<n; j++) imag[j] = Math.cos(j*Math.log(j)) / j; break;
            case 'Weird': for(let j=1; j<n; j++) imag[j] = Math.sin(Math.tan(j)) / j; break;
            case 'S&H Steps': imag[i] = (Math.random() * 2 - 1) / i; break;
            default: imag[i] = (i === 1) ? 1 : 0; break;
        }
    }
    const wave = audioContext.createPeriodicWave(real, imag, { disableNormalization: true });
    lfoWaveCache.set(type, wave);
    return wave;
};

const oscWaveCache = new Map<string, PeriodicWave>();
const noiseBufferCache = new Map<string, AudioBuffer>();

const createOscillatorSource = (type: string, audioContext: AudioContext): OscillatorNode | AudioBufferSourceNode => {
    if (type === 'Noise' || type === 'Glitch') {
         if (noiseBufferCache.has(type)) {
            const source = audioContext.createBufferSource();
            source.buffer = noiseBufferCache.get(type)!;
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
            const fm1Gain = audioContext.createGain();
            const fm2Gain = audioContext.createGain();
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
            const modSources = ['lfo1', 'lfo2'];
            const modDestinations = ['osc1Pitch', 'osc2Pitch', 'osc1FM', 'osc2FM', 'osc1Wave', 'osc2Wave', 'filterCutoff', 'filterQ'];

            modSources.forEach(source => {
                const modSourceNode = source === 'lfo1' ? lfo1 : lfo2;
                modDestinations.forEach(dest => {
                    const gainNode = audioContext.createGain();
                    gainNode.gain.value = 0; // Initialize all mod depths to 0
                    modGains[`${source}_${dest}`] = gainNode;
                    modSourceNode.connect(gainNode);

                    if (dest === 'osc1FM') gainNode.connect(fm1Gain.gain);
                    if (dest === 'osc2FM') gainNode.connect(fm2Gain.gain);
                    if (dest === 'osc1Wave' && source === 'lfo2') gainNode.connect(shaper1InputGain.gain);
                    if (dest === 'osc2Wave' && source === 'lfo2') gainNode.connect(shaper2InputGain.gain);
                    if (dest === 'filterCutoff') {
                        gainNode.connect(filterNode1.frequency);
                        gainNode.connect(filterNode2.frequency);
                    }
                    if (dest === 'filterQ') {
                         gainNode.connect(filterNode1.Q);
                         gainNode.connect(filterNode2.Q);
                    }
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
                    formantInGain, formantFilters, formantOutGain
                },
                osc1Type: state.synth.osc1.type,
                osc2Type: state.synth.osc2.type,
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioContext]);
    
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
        
        const source = ctx.createBufferSource();
        source.buffer = sample.buffer;
        
        const envelopeGainNode = ctx.createGain();

        source.connect(envelopeGainNode);
        const lpNode = lpFilterNodesRef.current[sampleId];
        const hpNode = hpFilterNodesRef.current[sampleId];
        const sampleGainNode = sampleGainsRef.current[sampleId];
        envelopeGainNode.connect(lpNode);
        
        const baseParams: PlaybackParams = {
            detune: 0,
            velocity: 1,
            volume: sample.volume,
            pitch: sample.pitch,
            start: sample.start,
            decay: sample.decay,
            lpFreq: sample.lpFreq,
            hpFreq: sample.hpFreq
        };

        const params = { ...baseParams, ...playbackParams };

        sampleGainNode.gain.setValueAtTime(params.volume, effectiveTime);
        lpNode.frequency.setValueAtTime(params.lpFreq, effectiveTime);
        hpNode.frequency.setValueAtTime(params.hpFreq, effectiveTime);

        const totalDetuneCents = (params.pitch * 100) + (params.detune || 0);
        source.detune.setValueAtTime(totalDetuneCents, effectiveTime);
        
        const playbackRate = Math.pow(2, totalDetuneCents / 1200);
        
        const startOffset = sample.buffer.duration * params.start;
        const remainingBufferDuration = sample.buffer.duration - startOffset;
        const actualPlaybackDuration = remainingBufferDuration / playbackRate;
        const decayDuration = actualPlaybackDuration * params.decay;
        
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
        const { audioContext: ctx, synth: currentSynth, synthModMatrix: currentModMatrix, bpm, isModMatrixMuted } = stateRef.current;
        const synthGraph = synthGraphRef.current;
        if (!ctx || !synthGraph) return;
    
        const now = ctx.currentTime;
        const effectiveTime = scheduleTime === 0 ? now : scheduleTime;
        const { osc1, osc2, oscMix, filter, filterEnv, ampEnv, globalGateTime } = currentSynth;
        
        const isLegato = activeNoteRef.current !== null && effectiveTime < activeNoteRef.current.gateEndTime;
        const gateEndTime = effectiveTime + globalGateTime;

        // --- Dynamic Oscillator Waveform Swapping ---
        const handleWaveformChange = (oscIndex: 1 | 2) => {
            const currentType = oscIndex === 1 ? currentSynth.osc1.type : currentSynth.osc2.type;
            const graphType = oscIndex === 1 ? synthGraph.osc1Type : synthGraph.osc2Type;
            if (currentType === graphType) return;
    
            const oldSource = oscIndex === 1 ? synthGraph.nodes.oscSource1 : synthGraph.nodes.oscSource2;
            try { oldSource.stop(); } catch(e) {}
    
            const newSource = createOscillatorSource(currentType, ctx);
            newSource.start();
    
            if (oscIndex === 1) {
                newSource.connect(synthGraph.nodes.shaper1InputGain);
                if (newSource instanceof OscillatorNode) {
                    newSource.connect(synthGraph.nodes.fm2Gain);
                }
                synthGraph.nodes.oscSource1 = newSource;
                synthGraph.osc1Type = currentType;
            } else {
                newSource.connect(synthGraph.nodes.shaper2InputGain);
                if (newSource instanceof OscillatorNode) {
                    newSource.connect(synthGraph.nodes.fm1Gain);
                }
                synthGraph.nodes.oscSource2 = newSource;
                synthGraph.osc2Type = currentType;
            }
        };
        handleWaveformChange(1);
        handleWaveformChange(2);

        const { nodes } = synthGraph;
        const oscNode1 = nodes.oscSource1 instanceof OscillatorNode ? nodes.oscSource1 : null;
        const oscNode2 = nodes.oscSource2 instanceof OscillatorNode ? nodes.oscSource2 : null;
        
        const effectiveModMatrix = isModMatrixMuted ? {} : currentModMatrix;

        // --- Reset modulation gains on every note for consistency ---
        Object.values(nodes.modGains).forEach(gainNode => gainNode.gain.cancelAndHoldAtTime(effectiveTime).setValueAtTime(0, effectiveTime));
        nodes.lfo1_ws1_modGain.gain.cancelAndHoldAtTime(effectiveTime).setValueAtTime(0, effectiveTime);
        nodes.lfo1_ws2_modGain.gain.cancelAndHoldAtTime(effectiveTime).setValueAtTime(0, effectiveTime);

        // --- LFO Gate Retrigger ---
        if (currentSynth.lfo1.syncTrigger === 'Gate' && !isLegato) scheduleLfoRetrigger(0, effectiveTime);
        if (currentSynth.lfo2.syncTrigger === 'Gate' && !isLegato) scheduleLfoRetrigger(1, effectiveTime);

        const absoluteDetune = relativeDetune + 6000;
        const baseFreq = 440 * Math.pow(2, (absoluteDetune - 6900) / 1200);
        const timeConstant = (duration: number) => Math.max(0.001, duration / 5);

        if (oscNode1) {
            const freq1 = baseFreq * Math.pow(2, osc1.octave);
            oscNode1.frequency.cancelScheduledValues(effectiveTime);
            oscNode1.frequency.setTargetAtTime(freq1, effectiveTime, 0.002);
            oscNode1.detune.cancelScheduledValues(effectiveTime);
            oscNode1.detune.setTargetAtTime(osc1.detune, effectiveTime, 0.002);
        }
        if (oscNode2) {
            const freq2 = baseFreq * Math.pow(2, osc2.octave);
            oscNode2.frequency.cancelScheduledValues(effectiveTime);
            oscNode2.frequency.setTargetAtTime(freq2, effectiveTime, 0.002);
            oscNode2.detune.cancelScheduledValues(effectiveTime);
            oscNode2.detune.setTargetAtTime(osc2.detune, effectiveTime, 0.002);
        }
        
        nodes.osc1Gain.gain.setValueAtTime(1 - oscMix, effectiveTime);
        nodes.osc2Gain.gain.setValueAtTime(oscMix, effectiveTime);
        
        nodes.fm1Gain.gain.setValueAtTime(oscNode1 && oscNode2 ? osc2.fmDepth : 0, effectiveTime);
        nodes.fm2Gain.gain.setValueAtTime(oscNode1 && oscNode2 ? osc1.fmDepth : 0, effectiveTime);
        
        nodes.shaper1.curve = makeDistortionCurve(osc1.waveshapeType, osc1.waveshapeAmount);
        nodes.shaper2.curve = makeDistortionCurve(osc2.waveshapeType, osc2.waveshapeAmount);
    
        // --- Filter Setup ---
        nodes.preFilterGain.gain.setValueAtTime(0, effectiveTime);
        nodes.combInGain.gain.setValueAtTime(0, effectiveTime);
        nodes.formantInGain.gain.setValueAtTime(0, effectiveTime);

        const isStandard = filter.type.includes('pass') || filter.type.includes('Peak');
        const isComb = filter.type.includes('Comb');
        const isFormant = filter.type.includes('Formant');
        let baseCutoff = filter.cutoff;

        if (isStandard) {
            nodes.preFilterGain.gain.setValueAtTime(1, effectiveTime);
            const is24dB = filter.type.includes('24dB');
            const nativeFilterType = filter.type.includes('Peak') ? 'peaking' : (filter.type.toLowerCase().replace(' 12db', '').replace(' 24db', '')) as BiquadFilterType;
            
            nodes.filterNode1.type = nativeFilterType;
            nodes.filterNode2.type = is24dB ? nativeFilterType : 'allpass';
            if (!is24dB) nodes.filterNode2.frequency.setValueAtTime(20000, effectiveTime);

        } else if (isComb) {
            nodes.combInGain.gain.setValueAtTime(1, effectiveTime);
            baseCutoff = Math.max(0.001, 1 / filter.cutoff); // Invert for delay time
            nodes.combDelay.delayTime.setValueAtTime(baseCutoff, effectiveTime);
            const feedback = Math.min(0.95, filter.resonance / 31);
            nodes.combFeedbackGain.gain.setValueAtTime(filter.type === 'Comb+' ? feedback : -feedback, effectiveTime);
        } else if (isFormant) {
            nodes.formantInGain.gain.setValueAtTime(1, effectiveTime);
        }
        nodes.combOutGain.gain.setValueAtTime(isComb ? 1 : 0, effectiveTime);
        nodes.formantOutGain.gain.setValueAtTime(isFormant ? 1 : 0, effectiveTime);

        // --- LFOs & Modulation Matrix ---
        const setupLfo = (lfoNode: OscillatorNode, lfoParams: typeof currentSynth.lfo1) => {
            lfoNode.setPeriodicWave(createLfoWave(lfoParams.type, ctx));
            const syncRateData = LFO_SYNC_RATES[lfoParams.rate];
            const rate = lfoParams.rateMode === 'sync' && syncRateData ? (bpm / 60) / syncRateData.beats : lfoParams.rate;
            lfoNode.frequency.setValueAtTime(rate, effectiveTime);
        };
        setupLfo(nodes.lfo1, currentSynth.lfo1);
        setupLfo(nodes.lfo2, currentSynth.lfo2);
        
        Object.keys(effectiveModMatrix).forEach(source => {
            Object.keys(effectiveModMatrix[source]).forEach(dest => {
                const value = effectiveModMatrix[source][dest];
                if (!value || source === 'filterEnv') return;
                const gainNode = nodes.modGains[`${source}_${dest}`];
                if (!gainNode) return;
                
                let modAmount = 1.0;
                if (dest.includes('Pitch')) modAmount = 100;
                if (dest.includes('FM')) modAmount = 2000;
                if (dest.includes('Cutoff')) modAmount = 5000;
                if (dest.includes('Q')) modAmount = 15;
                gainNode.gain.setValueAtTime(modAmount * value, effectiveTime);
            });
        });
        nodes.lfo1_ws1_modGain.gain.setValueAtTime(currentSynth.osc1.wsLfoAmount || 0, effectiveTime);
        nodes.lfo1_ws2_modGain.gain.setValueAtTime(currentSynth.osc2.wsLfoAmount || 0, effectiveTime);
        
        // Connect pitch modulations
        if (oscNode1) {
            nodes.modGains['lfo1_osc1Pitch'].connect(oscNode1.detune);
            nodes.modGains['lfo2_osc1Pitch'].connect(oscNode1.detune);
        }
        if (oscNode2) {
            nodes.modGains['lfo1_osc2Pitch'].connect(oscNode2.detune);
            nodes.modGains['lfo2_osc2Pitch'].connect(oscNode2.detune);
        }

        // --- ENVELOPES ---
        if (!isLegato) {
            // AMP ENV: Trigger only on new notes
            nodes.vca.gain.cancelScheduledValues(effectiveTime);
            nodes.vca.gain.setValueAtTime(0, effectiveTime);
            nodes.vca.gain.setTargetAtTime(1, effectiveTime, timeConstant(0.002));
            
            // FILTER ENV: Trigger only on new notes
            const applyFilterEnvAttack = (filterParam: AudioParam, baseValue: number) => {
                filterParam.cancelScheduledValues(effectiveTime);
                filterParam.setValueAtTime(baseValue, effectiveTime);
                const peakValue = baseValue + filter.envAmount;
                filterParam.setTargetAtTime(peakValue, effectiveTime, timeConstant(filterEnv.attack));
                const sustainValue = baseValue + (filter.envAmount * filterEnv.sustain);
                filterParam.setTargetAtTime(sustainValue, effectiveTime + filterEnv.attack, timeConstant(filterEnv.decay));
            };
            if(isStandard) {
                applyFilterEnvAttack(nodes.filterNode1.frequency, baseCutoff);
                if(filter.type.includes('24dB')) applyFilterEnvAttack(nodes.filterNode2.frequency, baseCutoff);
            }

            // PITCH ENV: Trigger only on new notes
            if (osc1.sync && oscNode2) {
                const pitchEnvAmount = osc2.pitchEnvAmount || 0;
                const baseDetune = osc2.detune;
                oscNode2.detune.cancelScheduledValues(effectiveTime);
                oscNode2.detune.setValueAtTime(baseDetune, effectiveTime);
                const peakDetune = baseDetune + pitchEnvAmount;
                oscNode2.detune.setTargetAtTime(peakDetune, effectiveTime, timeConstant(filterEnv.attack));
                const sustainDetune = baseDetune + (pitchEnvAmount * filterEnv.sustain);
                oscNode2.detune.setTargetAtTime(sustainDetune, effectiveTime + filterEnv.attack, timeConstant(filterEnv.decay));
            }

        } else if (activeNoteRef.current) {
            // LEGATO: Cancel the previously scheduled release
            nodes.vca.gain.cancelScheduledValues(activeNoteRef.current.gateEndTime);
            nodes.filterNode1.frequency.cancelScheduledValues(activeNoteRef.current.gateEndTime);
            nodes.filterNode2.frequency.cancelScheduledValues(activeNoteRef.current.gateEndTime);
            if (osc1.sync && oscNode2) oscNode2.detune.cancelScheduledValues(activeNoteRef.current.gateEndTime);
        }

        // --- Schedule RELEASE for the CURRENT note ---
        // AMP ENV Release
        nodes.vca.gain.setTargetAtTime(0, gateEndTime, timeConstant(ampEnv.decay));

        // FILTER ENV Release
        const applyFilterEnvRelease = (filterParam: AudioParam, baseValue: number) => {
            filterParam.setTargetAtTime(baseValue, gateEndTime, timeConstant(filterEnv.decay));
        };
        if(isStandard) {
            applyFilterEnvRelease(nodes.filterNode1.frequency, baseCutoff);
            if(filter.type.includes('24dB')) applyFilterEnvRelease(nodes.filterNode2.frequency, baseCutoff);
        }

        // PITCH ENV Release
        if (osc1.sync && oscNode2) {
            oscNode2.detune.setTargetAtTime(osc2.detune, gateEndTime, timeConstant(filterEnv.decay));
        }

        activeNoteRef.current = { gateEndTime };

    }, [scheduleLfoRetrigger]);

    const loadSampleFromBlob = useCallback(async (blob: Blob, sampleId: number, name?: string) => {
        const { audioContext: ctx, samples: currentSamples } = stateRef.current;
        if (!ctx) return;
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            const newSamples = [...currentSamples];
            const oldSample = newSamples[sampleId];
            newSamples[sampleId] = {
                ...oldSample,
                name: name || oldSample.name,
                buffer: audioBuffer,
            };
            dispatch({ type: ActionType.SET_SAMPLES, payload: newSamples });
        } catch (error) {
            console.error('Error loading sample:', error);
            alert('Failed to load audio file. Please use a standard format like WAV or MP3.');
        }
    }, [dispatch]);
    
    const cleanupListener = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        sourceNodeRef.current?.disconnect();
        sourceNodeRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const startRecording = useCallback(async () => {
        const { isArmed: armed, isRecording: recording, audioContext: ctx, recordingThreshold: threshold } = stateRef.current;
        if (armed || recording || !ctx) return;
        dispatch({ type: ActionType.SET_ARMED_STATE, payload: true });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.3;
            analyserRef.current = analyser;
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkForAudio = () => {
                if (!analyserRef.current || !streamRef.current) return;
                
                analyserRef.current.getByteTimeDomainData(dataArray);
                const peak = dataArray.reduce((max, current) => Math.max(max, current), 0);
                const level = Math.abs(peak - 128) / 128;

                if (level > threshold) {
                    if (animationFrameRef.current) {
                        cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = null;
                    }
                    mediaRecorderRef.current = new MediaRecorder(streamRef.current);
                    mediaRecorderRef.current.ondataavailable = event => {
                        audioChunksRef.current.push(event.data);
                    };
                    mediaRecorderRef.current.onstop = async () => {
                        if (audioChunksRef.current.length === 0) return;
                        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                        audioChunksRef.current = [];
                        const { audioContext: ctx, activeSampleId: currentActiveSampleId, samples: currentSamples } = stateRef.current;
                        if (!ctx) return;

                        try {
                            const arrayBuffer = await audioBlob.arrayBuffer();
                            const originalBuffer = await ctx.decodeAudioData(arrayBuffer);

                            let peak = 0;
                            for (let i = 0; i < originalBuffer.numberOfChannels; i++) {
                                const channelData = originalBuffer.getChannelData(i);
                                for (let j = 0; j < channelData.length; j++) {
                                    const amp = Math.abs(channelData[j]);
                                    if (amp > peak) {
                                        peak = amp;
                                    }
                                }
                            }
                            
                            let finalBuffer = originalBuffer;
                    
                            if (peak > 0) {
                                const gain = 1.0 / peak;
                    
                                const offlineCtx = new OfflineAudioContext(
                                    originalBuffer.numberOfChannels,
                                    originalBuffer.length,
                                    originalBuffer.sampleRate
                                );
                                const source = offlineCtx.createBufferSource();
                                source.buffer = originalBuffer;
                                const gainNode = offlineCtx.createGain();
                                gainNode.gain.value = gain;
                                source.connect(gainNode);
                                gainNode.connect(offlineCtx.destination);
                                source.start(0);
                    
                                finalBuffer = await offlineCtx.startRendering();
                            }
                            
                            const newSamples = [...currentSamples];
                            const oldSample = newSamples[currentActiveSampleId];
                            newSamples[currentActiveSampleId] = {
                                ...oldSample,
                                buffer: finalBuffer,
                            };
                            dispatch({ type: ActionType.SET_SAMPLES, payload: newSamples });
                    
                        } catch (error) {
                            console.error('Error processing recorded sample:', error);
                            alert('Failed to process recorded audio.');
                        }
                    };
                    mediaRecorderRef.current.start();
                    dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
                    dispatch({ type: ActionType.SET_RECORDING_STATE, payload: true });
                } else {
                    animationFrameRef.current = requestAnimationFrame(checkForAudio);
                }
            };
            animationFrameRef.current = requestAnimationFrame(checkForAudio);
        } catch (err) {
            console.error("Error arming recording:", err);
            alert("Could not start recording. Please ensure microphone permissions are granted.");
            dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
        }

    }, [dispatch]);

    const stopRecording = useCallback(() => {
        const { isArmed: armed, isRecording: recording } = stateRef.current;
        if (armed && !recording) {
            dispatch({ type: ActionType.SET_ARMED_STATE, payload: false });
            cleanupListener();
            return;
        }

        if (recording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            dispatch({ type: ActionType.SET_RECORDING_STATE, payload: false });
            cleanupListener();
        }
    }, [dispatch, cleanupListener]);

    const startMasterRecording = useCallback(() => {
        const { isMasterRecording, audioContext: ctx } = stateRef.current;
        if (isMasterRecording || !ctx || !masterGainRef.current) return;

        if (!masterDestinationRef.current) {
            masterDestinationRef.current = ctx.createMediaStreamDestination();
        }
        masterGainRef.current.connect(masterDestinationRef.current);

        const recorder = new MediaRecorder(masterDestinationRef.current.stream);
        masterRecorderRef.current = recorder;
        masterChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            masterChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(masterChunksRef.current, { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            const { bpm } = stateRef.current;
            const d = new Date();
            const year = String(d.getFullYear()).slice(-2);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            
            const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
            const bpmString = `B${Math.round(bpm)}`;

            a.download = `GrvSmp_${timestamp}_${bpmString}.wav`;
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            masterGainRef.current?.disconnect(masterDestinationRef.current);
        };

        recorder.start();
        dispatch({ type: ActionType.TOGGLE_MASTER_RECORDING });
    }, [dispatch]);

    const stopMasterRecording = useCallback(() => {
        const { isMasterRecording } = stateRef.current;
        if (!isMasterRecording || !masterRecorderRef.current || masterRecorderRef.current.state !== 'recording') return;

        masterRecorderRef.current.stop();
        dispatch({ type: ActionType.TOGGLE_MASTER_RECORDING });
    }, [dispatch]);

    return { playSample, playSynthNote, scheduleLfoRetrigger, loadSampleFromBlob, startRecording, stopRecording, startMasterRecording, stopMasterRecording };
};