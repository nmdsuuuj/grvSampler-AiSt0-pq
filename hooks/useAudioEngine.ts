import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, Sample, PlaybackParams, CustomOscillatorType, WaveShaperType } from '../types';
import { PADS_PER_BANK, TOTAL_BANKS, TOTAL_SAMPLES } from '../constants';

const RAMP_TIME = 0.005; // 5ms ramp for all parameter changes to prevent clicks

// Custom hook to get the previous value of a prop or state
const usePrevious = <T,>(value: T): T | undefined => {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};

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
    const activeSynthNodesRef = useRef<any[]>([]);


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
                robustCurve[i] = Math.max(-1, Math.min(1, x));
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
            envelope.setValueAtTime(params.velocity, stopTime - releaseTime);
            envelope.linearRampToValueAtTime(0, stopTime);
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

    const playSynthNote = useCallback((detune: number, scheduleTime: number) => {
        const { audioContext: ctx, synth: currentSynth, synthModMatrix: currentModMatrix } = stateRef.current;
        if (!ctx) return;
    
        // --- Monophonic: Stop previous note ---
        activeSynthNodesRef.current.forEach(nodes => {
            const stopNow = ctx.currentTime;
            nodes.vca.gain.cancelScheduledValues(stopNow);
            nodes.vca.gain.setValueAtTime(nodes.vca.gain.value, stopNow);
            nodes.vca.gain.linearRampToValueAtTime(0, stopNow + 0.01);
            const finalStopTime = stopNow + 0.02;
            if (nodes.oscNode1) nodes.oscNode1.stop(finalStopTime);
            if (nodes.oscNode2) nodes.oscNode2.stop(finalStopTime);
        });
        activeSynthNodesRef.current = [];

        const now = ctx.currentTime;
        const effectiveTime = scheduleTime === 0 ? now : scheduleTime;
        const { osc1, osc2, oscMix, filter, filterEnv, ampEnv, globalGateTime } = currentSynth;
    
        // --- Helper functions ---
        const createPeriodicWave = (type: CustomOscillatorType): PeriodicWave => {
            const n = 4096;
            const real = new Float32Array(n);
            const imag = new Float32Array(n);
            switch (type) {
                case 'supersaw':
                    for (let i = 1; i < n; i++) imag[i] = (Math.random() * 2 - 1) / i;
                    break;
                case 'pwm':
                    for (let i = 1; i < n; i++) real[i] = Math.sin(Math.PI * i * 0.2) / (i * Math.PI);
                    break;
            }
            return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
        };
        const makeDistortionCurve = (type: WaveShaperType, amount: number): Float32Array => {
            const k = amount * 100;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            let i = 0;
            let x;
            switch(type) {
                case 'hard':
                    for ( ; i < n_samples; ++i ) {
                        x = i * 2 / n_samples - 1;
                        curve[i] = Math.max(-1, Math.min(1, x * (1 + k)));
                    }
                    break;
                case 'soft':
                     for ( ; i < n_samples; ++i ) {
                        x = i * 2 / n_samples - 1;
                        curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
                    }
                    break;
                case 'bitcrush':
                    const bits = Math.round(16 * (1 - amount));
                    const steps = Math.pow(2, Math.max(1, bits));
                    for ( ; i < n_samples; ++i ) {
                        x = i * 2 / n_samples - 1;
                        curve[i] = Math.round(x * steps) / steps;
                    }
                    break;
            }
            return curve;
        };

        // --- Create Nodes ---
        const oscNode1 = ctx.createOscillator();
        const oscNode2 = ctx.createOscillator();
        const osc1Gain = ctx.createGain();
        const osc2Gain = ctx.createGain();
        const shaper1 = ctx.createWaveShaper();
        const shaper1InputGain = ctx.createGain();
        const shaper2 = ctx.createWaveShaper();
        const shaper2InputGain = ctx.createGain();
        const mixer = ctx.createGain();
        const fm1Gain = ctx.createGain();
        const fm2Gain = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        const vca = ctx.createGain();
        const lfo1 = ctx.createOscillator();
        const lfo2 = ctx.createOscillator();

        // --- Build Audio Graph ---
        oscNode1.connect(shaper1InputGain);
        shaper1InputGain.connect(shaper1);
        shaper1.connect(osc1Gain);
        osc1Gain.connect(mixer);

        oscNode2.connect(shaper2InputGain);
        shaper2InputGain.connect(shaper2);
        shaper2.connect(osc2Gain);
        osc2Gain.connect(mixer);

        mixer.connect(filterNode);
        filterNode.connect(vca);
        const bankIndex = 3;
        if (bankGainsRef.current[bankIndex]) {
            vca.connect(bankGainsRef.current[bankIndex]);
        }

        // FM Routing
        oscNode2.connect(fm1Gain);
        fm1Gain.connect(oscNode1.frequency);
        oscNode1.connect(fm2Gain);
        fm2Gain.connect(oscNode2.frequency);

        // --- Set Initial Parameters ---
        const baseFreq = 440 * Math.pow(2, (detune - 6900) / 1200);
        
        if (['sine', 'square', 'sawtooth', 'triangle'].includes(osc1.type)) { oscNode1.type = osc1.type as OscillatorType; } 
        else { oscNode1.setPeriodicWave(createPeriodicWave(osc1.type as CustomOscillatorType)); }
        oscNode1.frequency.setValueAtTime(baseFreq * Math.pow(2, osc1.octave), effectiveTime);
        oscNode1.detune.setValueAtTime(osc1.detune, effectiveTime);
        
        if (['sine', 'square', 'sawtooth', 'triangle'].includes(osc2.type)) { oscNode2.type = osc2.type as OscillatorType; }
        else { oscNode2.setPeriodicWave(createPeriodicWave(osc2.type as CustomOscillatorType)); }
        oscNode2.frequency.setValueAtTime(baseFreq * Math.pow(2, osc2.octave), effectiveTime);
        oscNode2.detune.setValueAtTime(osc2.detune, effectiveTime);
        
        fm1Gain.gain.setValueAtTime(osc2.fmDepth, effectiveTime); // Osc2 -> Osc1 FM
        fm2Gain.gain.setValueAtTime(osc1.fmDepth, effectiveTime); // Osc1 -> Osc2 FM
        
        shaper1.curve = makeDistortionCurve(osc1.waveshapeType, osc1.waveshapeAmount);
        shaper1.oversample = '4x';
        shaper2.curve = makeDistortionCurve(osc2.waveshapeType, osc2.waveshapeAmount);
        shaper2.oversample = '4x';
    
        osc1Gain.gain.value = 1 - oscMix;
        osc2Gain.gain.value = oscMix;
    
        filterNode.type = filter.type;
        filterNode.frequency.setValueAtTime(filter.cutoff, effectiveTime);
        filterNode.Q.setValueAtTime(filter.resonance, effectiveTime);

        // FIX: Correctly set LFO parameters from the `currentSynth` state object. The original code was incorrectly trying to read properties from the OscillatorNode itself.
        lfo1.type = currentSynth.lfo1.type;
        lfo1.frequency.value = currentSynth.lfo1.rate;
        lfo2.type = currentSynth.lfo2.type;
        lfo2.frequency.value = currentSynth.lfo2.rate;
        lfo1.start(effectiveTime);
        lfo2.start(effectiveTime);

        // --- Modulation ---
        Object.keys(currentModMatrix).forEach(source => {
            const destinations = currentModMatrix[source];
            if (!destinations) return;
            Object.keys(destinations).forEach(dest => {
                if (!destinations[dest]) return;

                const modSourceNode = source === 'lfo1' ? lfo1 : source === 'lfo2' ? lfo2 : null;
                const modAmount = 1; // This could be a parameter later

                if (modSourceNode) {
                    const gain = ctx.createGain();
                    switch(dest) {
                        case 'osc1Pitch': gain.gain.value = 100 * modAmount; gain.connect(oscNode1.detune); break;
                        case 'osc2Pitch': gain.gain.value = 100 * modAmount; gain.connect(oscNode2.detune); break;
                        case 'osc1FM': gain.gain.value = 2000 * modAmount; gain.connect(fm2Gain.gain); break;
                        case 'osc2FM': gain.gain.value = 2000 * modAmount; gain.connect(fm1Gain.gain); break;
                        case 'osc1Wave': gain.gain.value = 1 * modAmount; gain.connect(shaper1InputGain.gain); break;
                        case 'osc2Wave': gain.gain.value = 1 * modAmount; gain.connect(shaper2InputGain.gain); break;
                        case 'filterCutoff': gain.gain.value = 5000 * modAmount; gain.connect(filterNode.frequency); break;
                        case 'filterQ': gain.gain.value = 15 * modAmount; gain.connect(filterNode.Q); break;
                    }
                    modSourceNode.connect(gain);
                }
            });
        });
    
        // --- Envelopes & Scheduling ---
        const gateEndTime = effectiveTime + globalGateTime;
        const finalStopTime = gateEndTime + Math.max(0.01, filterEnv.release) + 0.1;

        // Amp Envelope (ADS)
        const amp = vca.gain;
        amp.cancelScheduledValues(effectiveTime);
        amp.setValueAtTime(0, effectiveTime);
        amp.linearRampToValueAtTime(1, effectiveTime + ampEnv.attack);
        amp.linearRampToValueAtTime(ampEnv.sustain, effectiveTime + ampEnv.attack + ampEnv.decay);
        amp.setValueAtTime(ampEnv.sustain, gateEndTime);
        amp.linearRampToValueAtTime(0, gateEndTime + 0.01); // Fast release
    
        // Filter Envelope (ADSR)
        const filterFreq = filterNode.frequency;
        const currentCutoff = filterNode.frequency.value;
        filterFreq.cancelScheduledValues(effectiveTime);
        filterFreq.setValueAtTime(currentCutoff, effectiveTime);
        const peakFreq = currentCutoff + filter.envAmount;
        filterFreq.linearRampToValueAtTime(peakFreq, effectiveTime + filterEnv.attack);
        filterFreq.linearRampToValueAtTime(currentCutoff + (filter.envAmount * filterEnv.sustain), effectiveTime + filterEnv.attack + filterEnv.decay);
        filterFreq.setValueAtTime(currentCutoff + (filter.envAmount * filterEnv.sustain), gateEndTime);
        filterFreq.linearRampToValueAtTime(currentCutoff, gateEndTime + filterEnv.release);

        // Modulate with Filter Env
        Object.keys(currentModMatrix['filterEnv'] || {}).forEach(dest => {
            if (!currentModMatrix['filterEnv'][dest]) return;
            const targetParam = 
                dest === 'osc1Pitch' ? oscNode1.detune :
                dest === 'osc2Pitch' ? oscNode2.detune : null; 
            if (targetParam) {
                const modAmount = dest.includes('Pitch') ? 2400 : 1;
                targetParam.cancelScheduledValues(effectiveTime);
                targetParam.setValueAtTime(targetParam.value, effectiveTime);
                targetParam.linearRampToValueAtTime(targetParam.value + modAmount, effectiveTime + filterEnv.attack);
                targetParam.linearRampToValueAtTime(targetParam.value + modAmount * filterEnv.sustain, effectiveTime + filterEnv.attack + filterEnv.decay);
                targetParam.setValueAtTime(targetParam.value + modAmount * filterEnv.sustain, gateEndTime);
                targetParam.linearRampToValueAtTime(targetParam.value, gateEndTime + filterEnv.release);
            }
        });

    
        // --- Start/Stop Oscillators ---
        oscNode1.start(effectiveTime);
        oscNode2.start(effectiveTime);
        oscNode1.stop(finalStopTime);
        oscNode2.stop(finalStopTime);
        lfo1.stop(finalStopTime);
        lfo2.stop(finalStopTime);
        
        activeSynthNodesRef.current.push({ vca, oscNode1, oscNode2 });
    }, []);

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

    return { playSample, playSynthNote, loadSampleFromBlob, startRecording, stopRecording, startMasterRecording, stopMasterRecording };
};