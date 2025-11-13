import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, Sample } from '../types';
import { PADS_PER_BANK, TOTAL_BANKS, TOTAL_SAMPLES } from '../constants';

const RAMP_TIME = 0.005; // 5ms ramp for all parameter changes to prevent clicks

// Custom hook to get the previous value of a prop or state
const usePrevious = <T,>(value: T): T | undefined => {
    // FIX: Explicitly initialize useRef with undefined to fix "Expected 1 arguments, but got 0" error.
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};


export const useAudioEngine = () => {
    const { state, dispatch } = useContext(AppContext);
    const { audioContext, samples, bankVolumes, bankPans, bankMutes, bankSolos, isRecording, isArmed, recordingThreshold, activeSampleId, masterVolume, masterCompressorOn, masterCompressorParams } = state;
    
    const masterGainRef = useRef<GainNode | null>(null);
    const masterCompressorRef = useRef<DynamicsCompressorNode | null>(null);
    const bankGainsRef = useRef<GainNode[]>([]);
    const bankPannersRef = useRef<StereoPannerNode[]>([]);
    const sampleGainsRef = useRef<GainNode[]>([]);
    const lpFilterNodesRef = useRef<BiquadFilterNode[]>([]);
    const hpFilterNodesRef = useRef<BiquadFilterNode[]>([]);
    const activeSourcesRef = useRef<Map<number, Set<AudioBufferSourceNode>>>(new Map());

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

             // Master Gain
            const masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            masterGainRef.current = masterGain;

            // Connect compressor to master gain
            compressor.connect(masterGain);


            for (let i = 0; i < TOTAL_BANKS; i++) {
                const gainNode = audioContext.createGain();
                gainNode.gain.value = state.bankVolumes[i];
                
                const pannerNode = audioContext.createStereoPanner();
                pannerNode.pan.value = state.bankPans[i];

                gainNode.connect(pannerNode);
                pannerNode.connect(masterCompressorRef.current); // Connect to compressor instead of master gain

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
    // This single effect efficiently syncs any changes from the React state to the Web Audio API.
    useEffect(() => {
        if (!audioContext || sampleGainsRef.current.length === 0) {
            return;
        }
        const now = audioContext.currentTime;

        // 1. Sync Sample Parameters (Volume, Pitch, Filters)
        if (prevSamples) {
            samples.forEach((currentSample, i) => {
                const prevSample = prevSamples[i];
                if (!prevSample) return;

                // Sync Volume
                if (currentSample.volume !== prevSample.volume) {
                    const gainNode = sampleGainsRef.current[i];
                    if (gainNode) {
                        gainNode.gain.cancelScheduledValues(now);
                        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                        gainNode.gain.linearRampToValueAtTime(currentSample.volume, now + RAMP_TIME);
                    }
                }
                
                // Sync Pitch
                if (currentSample.pitch !== prevSample.pitch) {
                    const activeSampleSources = activeSourcesRef.current.get(i);
                    if (activeSampleSources) {
                        activeSampleSources.forEach(source => {
                            source.detune.cancelScheduledValues(now);
                            source.detune.setValueAtTime(source.detune.value, now);
                            source.detune.linearRampToValueAtTime(currentSample.pitch * 100, now + RAMP_TIME);
                        });
                    }
                }
                
                // Sync LP Freq
                if (currentSample.lpFreq !== prevSample.lpFreq) {
                    const filterNode = lpFilterNodesRef.current[i];
                    if (filterNode) {
                        filterNode.frequency.cancelScheduledValues(now);
                        filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
                        filterNode.frequency.linearRampToValueAtTime(currentSample.lpFreq, now + RAMP_TIME);
                    }
                }

                // Sync HP Freq
                if (currentSample.hpFreq !== prevSample.hpFreq) {
                    const filterNode = hpFilterNodesRef.current[i];
                    if (filterNode) {
                        filterNode.frequency.cancelScheduledValues(now);
                        filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
                        filterNode.frequency.linearRampToValueAtTime(currentSample.hpFreq, now + RAMP_TIME);
                    }
                }
            });
        }

        // 2. Sync Bank Volumes (with Mute/Solo logic)
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
        
        // 3. Sync Bank Pans
        bankPans.forEach((pan, i) => {
            const pannerNode = bankPannersRef.current[i];
            if (pannerNode) {
                pannerNode.pan.cancelScheduledValues(now);
                pannerNode.pan.setValueAtTime(pannerNode.pan.value, now);
                pannerNode.pan.linearRampToValueAtTime(pan, now + RAMP_TIME);
            }
        });
        
        // 4. Sync Master Volume
        if (masterGainRef.current) {
            masterGainRef.current.gain.cancelScheduledValues(now);
            masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, now);
            masterGainRef.current.gain.linearRampToValueAtTime(masterVolume, now + RAMP_TIME);
        }

        // 5. Sync Master Compressor
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
    

    const playSample = useCallback((sampleId: number, scheduleTime: number) => {
        const { audioContext: ctx, samples: currentSamples } = stateRef.current;
        if (!ctx || lpFilterNodesRef.current.length === 0) return;
        
        const sample = currentSamples[sampleId];
        if (!sample || !sample.buffer) return;

        const effectiveTime = scheduleTime === 0 ? ctx.currentTime : scheduleTime;
        
        const source = ctx.createBufferSource();
        source.buffer = sample.buffer;
        
        const envelopeGainNode = ctx.createGain();

        source.connect(envelopeGainNode);
        envelopeGainNode.connect(lpFilterNodesRef.current[sampleId]);
        
        // Use setValueAtTime for consistency, even if it's before the start time.
        source.detune.setValueAtTime(sample.pitch * 100, effectiveTime);
        
        const duration = sample.buffer.duration;
        const startTime = duration * sample.start;
        const decayDuration = (duration - startTime) * sample.decay;
        const envelope = envelopeGainNode.gain;
        const releaseTime = 0.008;

        envelope.cancelScheduledValues(effectiveTime);
        envelope.setValueAtTime(0, effectiveTime);
        envelope.linearRampToValueAtTime(1, effectiveTime + RAMP_TIME);

        const stopTime = effectiveTime + decayDuration;
        if (decayDuration > (RAMP_TIME + releaseTime)) {
            envelope.setValueAtTime(1, stopTime - releaseTime);
            envelope.linearRampToValueAtTime(0, stopTime);
        } else {
            envelope.linearRampToValueAtTime(0, stopTime);
        }
        
        source.start(effectiveTime, startTime);
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

                            // --- Start Normalization Logic ---
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
                            // --- End Normalization Logic ---
                    
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

    return { playSample, loadSampleFromBlob, startRecording, stopRecording, startMasterRecording, stopMasterRecording };
};