import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, Sample } from '../types';
import { PADS_PER_BANK, TOTAL_BANKS, TOTAL_SAMPLES } from '../constants';

const RAMP_TIME = 0.005; // 5ms ramp for all parameter changes to prevent clicks

// Custom hook to get the previous value of a prop or state
const usePrevious = <T,>(value: T): T | undefined => {
    const ref = useRef<T>();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};


export const useAudioEngine = () => {
    const { state, dispatch } = useContext(AppContext);
    const { audioContext, samples, bankVolumes, isRecording, isArmed, recordingThreshold, activeSampleId } = state;
    
    const bankGainsRef = useRef<GainNode[]>([]);
    const sampleGainsRef = useRef<GainNode[]>([]);
    const activeSourcesRef = useRef<Map<number, Set<AudioBufferSourceNode>>>(new Map());

    // Create a ref to hold the latest state for use in callbacks without causing re-renders.
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    
    // Refs for recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Get previous state for efficient diffing
    const prevSamples = usePrevious(samples);
    const prevBankVolumes = usePrevious(bankVolumes);

    // --- Initialize core audio graph (runs once) ---
    useEffect(() => {
        if (audioContext && bankGainsRef.current.length === 0) {
            for (let i = 0; i < TOTAL_BANKS; i++) {
                const gainNode = audioContext.createGain();
                gainNode.gain.value = state.bankVolumes[i];
                gainNode.connect(audioContext.destination);
                bankGainsRef.current.push(gainNode);
            }
            for (let i = 0; i < TOTAL_SAMPLES; i++) {
                const sampleGainNode = audioContext.createGain();
                sampleGainNode.gain.value = state.samples[i].volume;
                const bankIndex = Math.floor(i / PADS_PER_BANK);
                sampleGainNode.connect(bankGainsRef.current[bankIndex]);
                sampleGainsRef.current.push(sampleGainNode);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioContext]);
    
    // --- State Synchronization Effect ---
    // This single effect efficiently syncs any changes from the React state to the Web Audio API.
    useEffect(() => {
        if (!audioContext || sampleGainsRef.current.length === 0 || !prevSamples || !prevBankVolumes) {
            return;
        }
        const now = audioContext.currentTime;

        // 1. Sync Sample Parameters (Volume & Pitch) by comparing current and previous states
        samples.forEach((currentSample, i) => {
            const prevSample = prevSamples[i];
            if (!prevSample) return;

            // Sync Volume if it changed
            if (currentSample.volume !== prevSample.volume) {
                const gainNode = sampleGainsRef.current[i];
                if (gainNode) {
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.linearRampToValueAtTime(currentSample.volume, now + RAMP_TIME);
                }
            }
            
            // Sync Pitch if it changed, applying it to any currently playing voices for that sample
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
        });

        // 2. Sync Bank Volumes if they changed
        bankVolumes.forEach((volume, i) => {
            if(volume !== prevBankVolumes[i]) {
                const gainNode = bankGainsRef.current[i];
                 if (gainNode) {
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.linearRampToValueAtTime(volume, now + RAMP_TIME);
                }
            }
        });

    }, [samples, bankVolumes, audioContext]);
    

    const playSample = useCallback((sampleId: number, scheduleTime: number) => {
        const { audioContext: ctx, samples: currentSamples } = stateRef.current;
        if (!ctx || sampleGainsRef.current.length === 0) return;
        
        const sample = currentSamples[sampleId];
        if (!sample || !sample.buffer) return;

        const effectiveTime = scheduleTime === 0 ? ctx.currentTime : scheduleTime;
        
        const source = ctx.createBufferSource();
        source.buffer = sample.buffer;
        
        const envelopeGainNode = ctx.createGain();

        source.connect(envelopeGainNode);
        envelopeGainNode.connect(sampleGainsRef.current[sampleId]);
        
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
        const { isArmed: armed, isRecording: recording, audioContext: ctx, recordingThreshold: threshold, activeSampleId: currentSampleId, samples: currentSamples } = stateRef.current;
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
                        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                        await loadSampleFromBlob(audioBlob, stateRef.current.activeSampleId, stateRef.current.samples[stateRef.current.activeSampleId].name);
                        audioChunksRef.current = [];
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

    }, [dispatch, loadSampleFromBlob]);

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

    return { playSample, loadSampleFromBlob, startRecording, stopRecording };
};