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

// Type for the persistent synth graph nodes
type SynthGraphNodes = {
    osc1Gain: GainNode;
    osc2Gain: GainNode;
    shaper1: WaveShaperNode;
    shaper1InputGain: GainNode;
    shaper2: WaveShaperNode;
    shaper2InputGain: GainNode;
    mixer: GainNode;
    fm1Gain: GainNode; // Modulates osc1 freq
    fm2Gain: GainNode; // Modulates osc2 freq
    filterNode: BiquadFilterNode;
    vca: GainNode;
    lfo1: OscillatorNode;
    lfo2: OscillatorNode;
    modGains: { [key: string]: GainNode }; // For LFO -> destination modulation
};

// Type for the currently playing note's sources
type ActiveNoteSources = {
    oscNode1: OscillatorNode;
    oscNode2: OscillatorNode;
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
    
    // --- NEW SYNTH REFS ---
    const synthGraphRef = useRef<SynthGraphNodes | null>(null);
    const activeNoteSourcesRef = useRef<ActiveNoteSources | null>(null);

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

        // --- NEW: Initialize persistent synth graph ---
        if (audioContext && !synthGraphRef.current) {
            const osc1Gain = audioContext.createGain();
            const osc2Gain = audioContext.createGain();
            const shaper1 = audioContext.createWaveShaper();
            const shaper1InputGain = audioContext.createGain();
            const shaper2 = audioContext.createWaveShaper();
            const shaper2InputGain = audioContext.createGain();
            const mixer = audioContext.createGain();
            const fm1Gain = audioContext.createGain();
            const fm2Gain = audioContext.createGain();
            const filterNode = audioContext.createBiquadFilter();
            const vca = audioContext.createGain();
            const lfo1 = audioContext.createOscillator();
            const lfo2 = audioContext.createOscillator();

            // --- Build Audio Graph ---
            shaper1InputGain.connect(shaper1);
            shaper1.connect(osc1Gain);
            osc1Gain.connect(mixer);
            shaper2InputGain.connect(shaper2);
            shaper2.connect(osc2Gain);
            osc2Gain.connect(mixer);
            mixer.connect(filterNode);
            filterNode.connect(vca);
            const bankIndex = 3;
            if (bankGainsRef.current[bankIndex]) {
                vca.connect(bankGainsRef.current[bankIndex]);
            }

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

                    // Connect modulation gains to their destinations (except for pitch, which is dynamic)
                    if (dest === 'osc1FM') gainNode.connect(fm2Gain.gain);
                    if (dest === 'osc2FM') gainNode.connect(fm1Gain.gain);
                    if (dest === 'osc1Wave') gainNode.connect(shaper1InputGain.gain);
                    if (dest === 'osc2Wave') gainNode.connect(shaper2InputGain.gain);
                    if (dest === 'filterCutoff') gainNode.connect(filterNode.frequency);
                    if (dest === 'filterQ') gainNode.connect(filterNode.Q);
                });
            });
            
            lfo1.start();
            lfo2.start();

            synthGraphRef.current = {
                osc1Gain, osc2Gain, shaper1, shaper1InputGain, shaper2, shaper2InputGain,
                mixer, fm1Gain, fm2Gain, filterNode, vca, lfo1, lfo2, modGains
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

    const playSynthNote = useCallback((relativeDetune: number, scheduleTime: number) => {
        const { audioContext: ctx, synth: currentSynth, synthModMatrix: currentModMatrix } = stateRef.current;
        const synthGraph = synthGraphRef.current;
        if (!ctx || !synthGraph) return;
    
        const now = ctx.currentTime;
        const effectiveTime = scheduleTime === 0 ? now : scheduleTime;
        const { osc1, osc2, oscMix, filter, filterEnv, ampEnv, globalGateTime } = currentSynth;
        
        // --- Monophonic Voice Stealing: Gracefully stop the previous note ---
        if (activeNoteSourcesRef.current) {
            const oldSources = activeNoteSourcesRef.current;
            const releaseTime = now + RAMP_TIME;

            // Ramp down VCA gain quickly to prevent clicks
            synthGraph.vca.gain.cancelScheduledValues(now);
            synthGraph.vca.gain.setValueAtTime(synthGraph.vca.gain.value, now); // Pin current value
            synthGraph.vca.gain.linearRampToValueAtTime(0, releaseTime);
            
            // Stop old oscillators
            oldSources.oscNode1.stop(releaseTime);
            oldSources.oscNode2.stop(releaseTime);
            
            // Disconnect dynamic LFO pitch modulation
            synthGraph.modGains['lfo1_osc1Pitch'].disconnect();
            synthGraph.modGains['lfo1_osc2Pitch'].disconnect();
            synthGraph.modGains['lfo2_osc1Pitch'].disconnect();
            synthGraph.modGains['lfo2_osc2Pitch'].disconnect();
        }

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

        // --- Create NEW Oscillator Sources for the new note ---
        const oscNode1 = ctx.createOscillator();
        const oscNode2 = ctx.createOscillator();

        // Connect new sources to the persistent graph
        oscNode1.connect(synthGraph.shaper1InputGain);
        oscNode2.connect(synthGraph.shaper2InputGain);
        oscNode2.connect(synthGraph.fm1Gain);
        synthGraph.fm1Gain.connect(oscNode1.frequency);
        oscNode1.connect(synthGraph.fm2Gain);
        synthGraph.fm2Gain.connect(oscNode2.frequency);
        
        // --- Set ALL Parameters on the Persistent Graph and New Sources ---
        const absoluteDetune = relativeDetune + 6000;
        const baseFreq = 440 * Math.pow(2, (absoluteDetune - 6900) / 1200);
        
        if (['sine', 'square', 'sawtooth', 'triangle'].includes(osc1.type)) { oscNode1.type = osc1.type as OscillatorType; } 
        else { oscNode1.setPeriodicWave(createPeriodicWave(osc1.type as CustomOscillatorType)); }
        oscNode1.frequency.setValueAtTime(baseFreq * Math.pow(2, osc1.octave), effectiveTime);
        oscNode1.detune.setValueAtTime(osc1.detune, effectiveTime);
        
        if (['sine', 'square', 'sawtooth', 'triangle'].includes(osc2.type)) { oscNode2.type = osc2.type as OscillatorType; }
        else { oscNode2.setPeriodicWave(createPeriodicWave(osc2.type as CustomOscillatorType)); }
        oscNode2.frequency.setValueAtTime(baseFreq * Math.pow(2, osc2.octave), effectiveTime);
        oscNode2.detune.setValueAtTime(osc2.detune, effectiveTime);
        
        synthGraph.osc1Gain.gain.setValueAtTime(1 - oscMix, effectiveTime);
        synthGraph.osc2Gain.gain.setValueAtTime(oscMix, effectiveTime);
        synthGraph.fm1Gain.gain.setValueAtTime(osc2.fmDepth, effectiveTime);
        synthGraph.fm2Gain.gain.setValueAtTime(osc1.fmDepth, effectiveTime);
        
        synthGraph.shaper1.curve = makeDistortionCurve(osc1.waveshapeType, osc1.waveshapeAmount);
        synthGraph.shaper1.oversample = '4x';
        synthGraph.shaper2.curve = makeDistortionCurve(osc2.waveshapeType, osc2.waveshapeAmount);
        synthGraph.shaper2.oversample = '4x';
    
        synthGraph.filterNode.type = filter.type;
        synthGraph.filterNode.frequency.setValueAtTime(filter.cutoff, effectiveTime);
        synthGraph.filterNode.Q.setValueAtTime(filter.resonance, effectiveTime);

        synthGraph.lfo1.type = currentSynth.lfo1.type as OscillatorType;
        synthGraph.lfo1.frequency.setValueAtTime(currentSynth.lfo1.rate, effectiveTime);
        synthGraph.lfo2.type = currentSynth.lfo2.type as OscillatorType;
        synthGraph.lfo2.frequency.setValueAtTime(currentSynth.lfo2.rate, effectiveTime);

        // --- Modulation Matrix ---
        // FIX: Add type assertion to fix "Property 'gain' does not exist on type 'unknown'" error.
        // This can happen if the TypeScript version or configuration doesn't correctly infer the type from Object.values.
        Object.values(synthGraph.modGains).forEach(g => (g as GainNode).gain.setValueAtTime(0, effectiveTime));
        
        Object.keys(currentModMatrix).forEach(source => {
            const destinations = currentModMatrix[source];
            if (!destinations) return;
            Object.keys(destinations).forEach(dest => {
                if (!destinations[dest] || source === 'filterEnv') return;

                const gainNodeKey = `${source}_${dest}`;
                const gainNode = synthGraph.modGains[gainNodeKey];
                if (!gainNode) return;
                
                let modAmount = 1.0;
                switch(dest) {
                    case 'osc1Pitch': case 'osc2Pitch': modAmount = 100; break;
                    case 'osc1FM': case 'osc2FM': modAmount = 2000; break;
                    case 'osc1Wave': case 'osc2Wave': modAmount = 1; break;
                    case 'filterCutoff': modAmount = 5000; break;
                    case 'filterQ': modAmount = 15; break;
                }
                gainNode.gain.setValueAtTime(modAmount, effectiveTime);

                if (dest === 'osc1Pitch') gainNode.connect(oscNode1.detune);
                if (dest === 'osc2Pitch') gainNode.connect(oscNode2.detune);
            });
        });
    
        // --- Envelopes & Scheduling ---
        const gateEndTime = effectiveTime + globalGateTime;
        const finalStopTime = gateEndTime + ampEnv.release;

        // Amp Envelope (ADSR)
        const amp = synthGraph.vca.gain;
        amp.cancelScheduledValues(effectiveTime);
        amp.setValueAtTime(0, effectiveTime);
        amp.linearRampToValueAtTime(1, effectiveTime + ampEnv.attack);
        amp.linearRampToValueAtTime(ampEnv.sustain, effectiveTime + ampEnv.attack + ampEnv.decay);
        amp.setValueAtTime(ampEnv.sustain, gateEndTime);
        amp.linearRampToValueAtTime(0, finalStopTime);
    
        // Filter Envelope (ADSR)
        const filterFreq = synthGraph.filterNode.frequency;
        const currentCutoff = filter.cutoff;
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
            
            // FIX: The original logic for filter envelope modulation was incomplete.
            // It only handled pitch destinations, ignoring others defined in presets.
            // This has been expanded to correctly identify all possible target AudioParams
            // and apply the envelope, preventing silent failures and potential errors.
            const targetParamData = ((): { param: AudioParam | null, baseValue: number, modAmount: number } => {
                switch (dest) {
                    case 'osc1Pitch': return { param: oscNode1.detune, baseValue: osc1.detune, modAmount: 2400 };
                    case 'osc2Pitch': return { param: oscNode2.detune, baseValue: osc2.detune, modAmount: 2400 };
                    case 'osc1FM': return { param: synthGraph.fm2Gain.gain, baseValue: osc1.fmDepth, modAmount: 2500 };
                    case 'osc2FM': return { param: synthGraph.fm1Gain.gain, baseValue: osc2.fmDepth, modAmount: 2500 };
                    case 'osc1Wave': return { param: synthGraph.shaper1InputGain.gain, baseValue: 0, modAmount: 1 };
                    case 'osc2Wave': return { param: synthGraph.shaper2InputGain.gain, baseValue: 0, modAmount: 1 };
                    // Filter cutoff/Q modulation by filter env is already handled by filter.envAmount
                    default: return { param: null, baseValue: 0, modAmount: 0 };
                }
            })();

            const { param: targetParam, baseValue, modAmount } = targetParamData;
            
            if (targetParam) {
                targetParam.cancelScheduledValues(effectiveTime);
                // Set the starting base value
                targetParam.setValueAtTime(baseValue, effectiveTime);
                // Apply ADSR envelope shape, adding modulation on top of the base value
                targetParam.linearRampToValueAtTime(baseValue + modAmount, effectiveTime + filterEnv.attack);
                targetParam.linearRampToValueAtTime(baseValue + (modAmount * filterEnv.sustain), effectiveTime + filterEnv.attack + filterEnv.decay);
                targetParam.setValueAtTime(baseValue + (modAmount * filterEnv.sustain), gateEndTime);
                targetParam.linearRampToValueAtTime(baseValue, gateEndTime + filterEnv.release);
            }
        });
    
        // --- Start/Stop Oscillators ---
        oscNode1.start(effectiveTime);
        oscNode2.start(effectiveTime);
        oscNode1.stop(finalStopTime);
        oscNode2.stop(finalStopTime);
        
        activeNoteSourcesRef.current = { oscNode1, oscNode2 };
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
