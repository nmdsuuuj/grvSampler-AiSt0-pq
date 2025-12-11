






import React, { createContext, useReducer, Dispatch, useEffect, useState, useCallback } from 'react';
import { AppState, Action, ActionType, Sample, MasterCompressorParams, Step, LockableParam, Pattern, LaneClipboardData, BankClipboardData, BankPresetData, Synth, SynthPreset, ModMatrix, ModPatch, MasterCompressorSnapshot, FXType, PerformanceChain, GlobalFXSnapshot } from '../types';
import { TOTAL_SAMPLES, TOTAL_PATTERNS, STEPS_PER_PATTERN, TOTAL_BANKS, GROOVE_PATTERNS, PADS_PER_BANK, OSC_WAVEFORMS, FILTER_TYPES, WAVESHAPER_TYPES, LFO_WAVEFORMS, MOD_SOURCES, MOD_DESTINATIONS, LFO_SYNC_RATES, LFO_SYNC_TRIGGERS, DEFAULT_PERFORMANCE_FX, createDefaultEffect, EXTENDED_DIVISIONS } from '../constants';
import SCALES from '../scales';
import { db, Session, StorableSample, audioBufferToStorable, storableToAudioBuffer } from '../db';


const createEmptySteps = (): Step[][] =>
    Array.from({ length: TOTAL_SAMPLES }, () =>
        Array.from({ length: STEPS_PER_PATTERN }, () => ({
            active: false,
            detune: 0, // Default to no detune
            velocity: 1,
        }))
    );

const initialSynthState: Synth = {
    osc1: { type: 'Saw Down', octave: 0, detune: 0, fmDepth: 0, waveshapeAmount: 0, waveshapeType: 'Soft Clip', wsLfoAmount: 0, sync: false },
    osc2: { type: 'Square', octave: -1, detune: 7, fmDepth: 0, waveshapeAmount: 0, waveshapeType: 'Soft Clip', wsLfoAmount: 0, pitchEnvAmount: 0 },
    oscMix: 0.5,
    filter: { type: 'Lowpass 24dB', cutoff: 8000, resonance: 1, envAmount: 3000 },
    filterEnv: { attack: 0.01, decay: 0.2, sustain: 0.5 },
    ampEnv: { decay: 0.5 },
    lfo1: { type: 'Sine', rate: 5, rateMode: 'hz', syncTrigger: 'Free' },
    lfo2: { type: 'Sine', rate: 2, rateMode: 'hz', syncTrigger: 'Free' },
    modWheel: 1,
    masterGain: 1,
    masterOctave: 0,
};

const defaultPresets: (SynthPreset | null)[] = Array(128).fill(null);

// Preset 0: Fat Bass
defaultPresets[0] = {
    id: 0, name: 'Fat Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: -1, detune: -5 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: -2, detune: 5 },
        oscMix: 0.5,
        filter: { type: 'Lowpass 24dB', cutoff: 800, resonance: 8, envAmount: 2500 },
        filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.1 },
        ampEnv: { decay: 0.4 },
        lfo1: { ...initialSynthState.lfo1, syncTrigger: 'Gate' },
    },
    modMatrix: {},
};
// ... (Keeping all other presets unchanged for brevity, assume they are here) ... 
// Preset 31: Simple Init
defaultPresets[31] = {
    id: 31, name: 'Simple Init',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down' },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: 0, detune: 0 },
        oscMix: 1,
        filter: { type: 'Lowpass 24dB', cutoff: 18000, resonance: 0, envAmount: 0 },
        filterEnv: { attack: 0.01, decay: 0.5, sustain: 1 },
        ampEnv: { decay: 0.5 },
    },
    modMatrix: {},
};


const initialState: AppState = {
    audioContext: null,
    isInitialized: false,
    isPlaying: false,
    isRecording: false,
    isArmed: false,
    recordingThreshold: 0.02,
    bpm: 120,
    currentSteps: Array(TOTAL_BANKS).fill(-1),
    activeSampleId: 0,
    activeSampleBank: 0,
    // "Live" state, loaded from the active pattern for the active bank.
    activeGrooveIds: Array(TOTAL_BANKS).fill(0),
    grooveDepths: Array(TOTAL_BANKS).fill(0),
    activeKey: 0, // C
    activeScale: 'Chromatic',
    keyboardOctave: 4,
    seqMode: 'PART',
    samples: Array.from({ length: TOTAL_SAMPLES }, (_, i) => ({
        id: i,
        name: `Sample ${String.fromCharCode(65 + Math.floor(i / PADS_PER_BANK))}${ (i % PADS_PER_BANK) + 1}`,
        buffer: null,
        volume: 1,
        pitch: 0,
        start: 0,
        end: 1, // NEW: Default end point
        decay: 1,
        loop: false, // NEW: Default loop state
        playbackMode: 'Forward', // NEW: Default playback mode
        lpFreq: 20000,
        hpFreq: 20,
    })),
    patterns: Array.from({ length: TOTAL_PATTERNS }, (_, i) => ({
        id: i,
        steps: createEmptySteps(),
        paramLocks: {},
        stepResolutionA: 16,
        stepLengthA: 16,
        loopCountA: 1,
        stepResolutionB: 16,
        stepLengthB: 16,
        loopCountB: 1,
        playbackKey: 0,
        playbackScale: 'Thru',
        // Each pattern now stores its own groove settings.
        grooveIds: Array(TOTAL_BANKS).fill(0),
        grooveDepths: Array(TOTAL_BANKS).fill(0),
    })),
    activePatternIds: Array(TOTAL_BANKS).fill(0).map((_, i) => i * (TOTAL_PATTERNS / TOTAL_BANKS)), // Bank A gets P1 (id 0), B gets P33 (id 32), etc.
    grooves: GROOVE_PATTERNS,
    bankVolumes: Array(TOTAL_BANKS).fill(1),
    bankPans: Array(TOTAL_BANKS).fill(0),
    bankMutes: Array(TOTAL_BANKS).fill(false),
    bankSolos: Array(TOTAL_BANKS).fill(false),
    masterVolume: 1,
    isMasterRecording: false,
    isMasterRecArmed: false,
    sampleClipboard: null,
    patternClipboard: null,
    laneClipboard: null,
    bankClipboard: null,
    masterCompressorOn: false,
    masterCompressorParams: {
        threshold: -24,
        knee: 30,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
    },
    compressorSnapshots: Array(64).fill(null),
    playbackTrackStates: Array.from({ length: TOTAL_BANKS }, () => ({ currentPart: 'A', partRepetition: 0 })),
    // Synth
    synth: initialSynthState,
    synthModMatrix: {},
    isModMatrixMuted: false,
    isModWheelLockMuted: false,
    synthPresets: defaultPresets,
    synthModPatches: Array(16).fill(null),
    // FX
    performanceFx: DEFAULT_PERFORMANCE_FX,
    
    selectedSeqStep: null,
    projectLoadCount: 0,
    isLoading: true, // Start in loading state
    toastMessage: null,
};

const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case ActionType.INITIALIZE_AUDIO:
            return { ...state, audioContext: action.payload, isInitialized: true };
        case ActionType.TOGGLE_PLAY:
            const isNowPlaying = !state.isPlaying;
            return { 
                ...state, 
                isPlaying: isNowPlaying,
                // Reset steps when stopping playback
                currentSteps: isNowPlaying ? state.currentSteps : Array(TOTAL_BANKS).fill(-1),
            };
        case ActionType.SET_BPM:
            return { ...state, bpm: action.payload };
        // ... (Skipping standard sequencer actions for brevity, assume they are here) ...
        case ActionType.SET_CURRENT_STEP: {
            const { bankIndex, step } = action.payload;
            const newCurrentSteps = [...state.currentSteps];
            newCurrentSteps[bankIndex] = step;
            return { ...state, currentSteps: newCurrentSteps };
        }
        case ActionType.SET_ACTIVE_SAMPLE: {
            const newSampleId = action.payload;
            const newBankIndex = Math.floor(newSampleId / PADS_PER_BANK);
            return {
                ...state,
                activeSampleId: newSampleId,
                activeSampleBank: newBankIndex,
            };
        }
        case ActionType.SET_ACTIVE_SAMPLE_BANK: {
            const newBankIndex = action.payload;
            const newActiveSampleId = newBankIndex * PADS_PER_BANK;
            return {
                ...state,
                activeSampleBank: newBankIndex,
                activeSampleId: newActiveSampleId,
            };
        }
        case ActionType.SET_ACTIVE_GROOVE: {
            const { bankIndex, grooveId } = action.payload;
            const newActiveGrooveIds = [...state.activeGrooveIds];
            newActiveGrooveIds[bankIndex] = grooveId;

            const activePatternId = state.activePatternIds[bankIndex];
            const newPatterns = state.patterns.map(p => {
                if (p.id === activePatternId) {
                    const newPatternGrooveIds = [...p.grooveIds];
                    newPatternGrooveIds[bankIndex] = grooveId;
                    return { ...p, grooveIds: newPatternGrooveIds };
                }
                return p;
            });

            return { ...state, activeGrooveIds: newActiveGrooveIds, patterns: newPatterns };
        }
        case ActionType.SET_GROOVE_DEPTH: {
            const { bankIndex, value } = action.payload;
            const newGrooveDepths = [...state.grooveDepths];
            newGrooveDepths[bankIndex] = value;

            const activePatternId = state.activePatternIds[bankIndex];
            const newPatterns = state.patterns.map(p => {
                if (p.id === activePatternId) {
                    const newPatternGrooveDepths = [...p.grooveDepths];
                    newPatternGrooveDepths[bankIndex] = value;
                    return { ...p, grooveDepths: newPatternGrooveDepths };
                }
                return p;
            });
            
            return { ...state, grooveDepths: newGrooveDepths, patterns: newPatterns };
        }
        case ActionType.UPDATE_SAMPLE_PARAM: {
            const { sampleId, param, value } = action.payload;
            return {
                ...state,
                samples: state.samples.map(s => s.id === sampleId ? { ...s, [param]: value } : s),
            };
        }
        case ActionType.UPDATE_SAMPLE_NAME: {
             const { sampleId, name } = action.payload;
            return {
                ...state,
                samples: state.samples.map(s => s.id === sampleId ? { ...s, name } : s),
            };
        }
        case ActionType.SET_SAMPLES:
            return { ...state, samples: action.payload };
        case ActionType.TOGGLE_STEP: {
            const { patternId, sampleId, step } = action.payload;
            return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id === patternId) {
                        const newSteps = [...p.steps];
                        const newSampleSteps = [...newSteps[sampleId]];
                        const currentStepState = newSampleSteps[step];
                        newSampleSteps[step] = {
                            ...currentStepState,
                            active: !currentStepState.active,
                            // Set a default detune if activating a step for the first time
                            detune: currentStepState.detune === null ? 0 : currentStepState.detune,
                        };
                        newSteps[sampleId] = newSampleSteps;
                        return { ...p, steps: newSteps };
                    }
                    return p;
                }),
            };
        }
        case ActionType.APPLY_SEQUENCE_TEMPLATE: {
            const { patternId, sampleId, steps: templateSteps, grooveId, grooveDepth } = action.payload;
        
            let finalState = { ...state };
        
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) {
                    return pattern;
                }
                const newSteps = pattern.steps.map((lane, laneIndex) => {
                    if (laneIndex !== sampleId) {
                        return lane;
                    }
                    return lane.map((originalStep, stepIndex) => ({
                        ...originalStep,
                        active: templateSteps[stepIndex] ?? originalStep.active,
                    }));
                });
        
                const sampleBank = Math.floor(sampleId / PADS_PER_BANK);
                let newGrooveIds = [...pattern.grooveIds];
                let newGrooveDepths = [...pattern.grooveDepths];
        
                if (grooveId !== undefined) {
                    newGrooveIds[sampleBank] = grooveId;
                }
                if (grooveDepth !== undefined) {
                    newGrooveDepths[sampleBank] = grooveDepth;
                }
        
                return {
                    ...pattern,
                    steps: newSteps,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
            });
        
            finalState = { ...finalState, patterns: newPatterns };
        
            const modifiedBank = Math.floor(sampleId / PADS_PER_BANK);
            if (patternId === state.activePatternIds[modifiedBank] && (grooveId !== undefined || grooveDepth !== undefined)) {
                const newActiveGrooveIds = [...state.activeGrooveIds];
                const newActiveGrooveDepths = [...state.grooveDepths];
                if (grooveId !== undefined) newActiveGrooveIds[modifiedBank] = grooveId;
                if (grooveDepth !== undefined) newActiveGrooveDepths[modifiedBank] = grooveDepth;
                finalState = { ...finalState, activeGrooveIds: newActiveGrooveIds, grooveDepths: newActiveGrooveDepths };
            }
        
            return finalState;
        }
        case ActionType.APPLY_BANK_A_DRUM_TEMPLATE: {
            const { patternId, sequences, grooveId, grooveDepth } = action.payload;
        
            let finalState = { ...state };
        
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) {
                    return pattern;
                }
        
                const newSteps = pattern.steps.map(lane => [...lane]);
                for (const padIndexStr in sequences) {
                    const padIndex = parseInt(padIndexStr, 10);
                    if (padIndex >= 0 && padIndex < PADS_PER_BANK) {
                        const sampleId = padIndex;
                        const templateSteps = sequences[padIndex];
                        if (templateSteps) {
                            newSteps[sampleId] = newSteps[sampleId].map((originalStep, stepIndex) => ({
                                ...originalStep,
                                active: templateSteps[stepIndex] ?? originalStep.active,
                            }));
                        }
                    }
                }
        
                const newGrooveIds = [...pattern.grooveIds];
                const newGrooveDepths = [...pattern.grooveDepths];
                newGrooveIds[0] = grooveId !== undefined ? grooveId : 1;
                newGrooveDepths[0] = grooveDepth !== undefined ? grooveDepth : 0.3;
        
                return {
                    ...pattern,
                    steps: newSteps,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
            });
        
            finalState = { ...finalState, patterns: newPatterns };
        
            if (patternId === state.activePatternIds[0]) {
                const newActiveGrooveIds = [...state.activeGrooveIds];
                const newActiveGrooveDepths = [...state.grooveDepths];
                newActiveGrooveIds[0] = grooveId !== undefined ? grooveId : 1;
                newActiveGrooveDepths[0] = grooveDepth !== undefined ? grooveDepth : 0.3;
                finalState = { ...finalState, activeGrooveIds: newActiveGrooveIds, grooveDepths: newActiveGrooveDepths };
            }
        
            return finalState;
        }
        case ActionType.RANDOMIZE_SEQUENCE: {
            const { patternId, sampleId } = action.payload;
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) return pattern;
                return {
                    ...pattern,
                    steps: pattern.steps.map((originalLane, laneIndex) => {
                        if (laneIndex !== sampleId) return [...originalLane];
                        return originalLane.map(originalStep => ({
                            ...originalStep,
                            active: Math.random() < 0.3,
                        }));
                    }),
                };
            });
            return { ...state, patterns: newPatterns };
        }
        case ActionType.CLEAR_SEQUENCE: {
            const { patternId, sampleId } = action.payload;
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) return pattern;
                return {
                    ...pattern,
                    steps: pattern.steps.map((originalLane, laneIndex) => {
                        if (laneIndex !== sampleId) return [...originalLane];
                        return originalLane.map(originalStep => ({
                            ...originalStep,
                            active: false,
                        }));
                    }),
                };
            });
            return { ...state, patterns: newPatterns };
        }
        case ActionType.FILL_SEQUENCE: {
            const { patternId, sampleId } = action.payload;
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) return pattern;
                return {
                    ...pattern,
                    steps: pattern.steps.map((originalLane, laneIndex) => {
                        if (laneIndex !== sampleId) return [...originalLane];
                        return originalLane.map(originalStep => ({
                            ...originalStep,
                            active: true,
                        }));
                    }),
                };
            });
            return { ...state, patterns: newPatterns };
        }
        case ActionType.RANDOMIZE_PITCH: {
            const { patternId, sampleId, key, scale: scaleName } = action.payload;
            
            const scale = SCALES.find(s => s.name === scaleName);
            let possibleNotes: number[] = [];

            if (scale && scale.intervals.length > 0) {
                const baseNote = key * 100;
                 for (let oct = -2; oct <= 2; oct++) {
                    let cumulativeCents = 0;
                    for (const interval of scale.intervals) {
                        possibleNotes.push(baseNote + cumulativeCents + (oct * 1200));
                        cumulativeCents += interval;
                    }
                }
            } else {
                 for (let i = -24; i <= 24; i++) {
                    possibleNotes.push(i * 100);
                }
            }
            if (possibleNotes.length === 0) possibleNotes.push(0);

            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) return pattern;
                return {
                    ...pattern,
                    steps: pattern.steps.map((originalLane, laneIndex) => {
                        if (laneIndex !== sampleId) return [...originalLane];
                        return originalLane.map(originalStep => {
                            if (!originalStep.active) return originalStep;
                            const randomNote = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
                            return {
                                ...originalStep,
                                detune: randomNote,
                            };
                        });
                    }),
                };
            });
            return { ...state, patterns: newPatterns };
        }
        case ActionType.RECORD_STEP: {
            const { patternId, sampleId, step, detune } = action.payload;
            if (step < 0) return state; 
            return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id === patternId) {
                        const newSteps = [...p.steps];
                        const newSampleSteps = [...newSteps[sampleId]];
                        newSampleSteps[step] = {
                            ...newSampleSteps[step],
                            active: true,
                            detune: detune,
                        };
                        newSteps[sampleId] = newSampleSteps;
                        return { ...p, steps: newSteps };
                    }
                    return p;
                })
            };
        }
        case ActionType.UPDATE_PARAM_LOCK: {
            const { patternId, sampleId, param, step, value } = action.payload;
            return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id !== patternId) return p;

                    if (param === 'detune' || param === 'velocity') {
                        const newSteps = [...p.steps];
                        const newSampleSteps = [...newSteps[sampleId]];
                        const currentStepState = newSampleSteps[step];
                        newSampleSteps[step] = {
                            ...currentStepState,
                            [param]: value,
                        };
                        newSteps[sampleId] = newSampleSteps;
                        return { ...p, steps: newSteps };
                    }

                    const newParamLocks = { ...p.paramLocks };
                    const newSampleLocks = { ...newParamLocks[sampleId] };
                    const newParamLane = [...(newSampleLocks[param] || Array(STEPS_PER_PATTERN).fill(null))];
                    newParamLane[step] = value;

                    newSampleLocks[param] = newParamLane as (number | null)[];
                    newParamLocks[sampleId] = newSampleLocks;
                    return { ...p, paramLocks: newParamLocks };
                }),
            };
        }
        case ActionType.CLEAR_PARAM_LOCK_LANE: {
             const { patternId, sampleId, param } = action.payload;
             return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id !== patternId) return p;

                    if (param === 'detune' || param === 'velocity') {
                         const newSteps = [...p.steps];
                        const newSampleSteps = newSteps[sampleId].map(step => ({
                            ...step,
                            [param]: param === 'detune' ? 0 : 1,
                        }));
                        newSteps[sampleId] = newSampleSteps;
                        return { ...p, steps: newSteps };
                    }
                    
                    const newParamLocks = { ...p.paramLocks };
                    const newSampleLocks = { ...newParamLocks[sampleId] };
                    delete newSampleLocks[param];
                    newParamLocks[sampleId] = newSampleLocks;
                    return { ...p, paramLocks: newParamLocks };
                }),
            };
        }
        case ActionType.SET_ACTIVE_PATTERN_FOR_BANK: {
            const { bankIndex, patternId } = action.payload;
            const newActivePatternIds = [...state.activePatternIds];
            newActivePatternIds[bankIndex] = patternId;

            const newActivePattern = state.patterns.find(p => p.id === patternId);
            if (!newActivePattern) return state;

            const newActiveGrooveIds = [...state.activeGrooveIds];
            const newGrooveDepths = [...state.grooveDepths];

            newActiveGrooveIds[bankIndex] = newActivePattern.grooveIds[bankIndex];
            newGrooveDepths[bankIndex] = newActivePattern.grooveDepths[bankIndex];

            return {
                ...state,
                activePatternIds: newActivePatternIds,
                activeGrooveIds: newActiveGrooveIds,
                grooveDepths: newGrooveDepths,
            };
        }
        case ActionType.UPDATE_PATTERN_PARAMS: {
            const { patternId, params } = action.payload;
            return {
                ...state,
                patterns: state.patterns.map(p => p.id === patternId ? { ...p, ...params } : p),
            };
        }
        case ActionType.UPDATE_PATTERN_PLAYBACK_SCALE: {
            const { patternId, key, scale } = action.payload;
             return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id === patternId) {
                        return {
                            ...p,
                            playbackKey: key ?? p.playbackKey,
                            playbackScale: scale ?? p.playbackScale,
                        };
                    }
                    return p;
                }),
            };
        }
        case ActionType.LOAD_PROJECT_STATE: {
            const { audioContext, isInitialized, isPlaying } = state;
            const loadedState = action.payload;

            return {
                ...initialState,
                ...loadedState,
                audioContext,
                isInitialized,
                isPlaying,
                projectLoadCount: state.projectLoadCount + 1,
                isLoading: false,
            };
        }
        case ActionType.SET_RECORDING_STATE:
            return { ...state, isRecording: action.payload };
        case ActionType.SET_ARMED_STATE:
             if (state.isRecording) return state;
            return { ...state, isArmed: action.payload };
        case ActionType.SET_RECORDING_THRESHOLD:
            return { ...state, recordingThreshold: action.payload };
        case ActionType.SET_BANK_VOLUME: {
            const { bankIndex, volume } = action.payload;
            const newBankVolumes = [...state.bankVolumes];
            newBankVolumes[bankIndex] = volume;
            return { ...state, bankVolumes: newBankVolumes };
        }
        case ActionType.SET_BANK_PAN: {
            const { bankIndex, pan } = action.payload;
            const newBankPans = [...state.bankPans];
            newBankPans[bankIndex] = pan;
            return { ...state, bankPans: newBankPans };
        }
        case ActionType.TOGGLE_BANK_MUTE: {
            const { bankIndex } = action.payload;
            const newBankMutes = [...state.bankMutes];
            newBankMutes[bankIndex] = !newBankMutes[bankIndex];
            return { ...state, bankMutes: newBankMutes };
        }
        case ActionType.TOGGLE_BANK_SOLO: {
            const { bankIndex } = action.payload;
            const newBankSolos = [...state.bankSolos];
            newBankSolos[bankIndex] = !newBankSolos[bankIndex];
            return { ...state, bankSolos: newBankSolos };
        }
        case ActionType.SET_MASTER_VOLUME:
            return { ...state, masterVolume: action.payload };
        case ActionType.TOGGLE_MASTER_RECORDING:
            return { ...state, isMasterRecording: !state.isMasterRecording };
        case ActionType.TOGGLE_MASTER_REC_ARMED:
            if (state.isMasterRecording) return state;
            return { ...state, isMasterRecArmed: !state.isMasterRecArmed };
        case ActionType.COPY_SAMPLE: {
            const sampleToCopy = state.samples.find(s => s.id === state.activeSampleId);
            return { ...state, sampleClipboard: sampleToCopy || null };
        }
        case ActionType.PASTE_SAMPLE: {
            if (!state.sampleClipboard || state.sampleClipboard.id === state.activeSampleId) {
                return state;
            }
            const newSamples = state.samples.map(s => {
                if (s.id === state.activeSampleId) {
                    const pastedSample: Sample = {
                        ...state.sampleClipboard,
                        id: s.id, 
                    };
                    return pastedSample;
                }
                return s;
            });
            return { ...state, samples: newSamples };
        }
        case ActionType.COPY_PATTERN: {
            const { patternId } = action.payload;
            const patternToCopy = state.patterns.find(p => p.id === patternId);
            if (!patternToCopy) return state;
            const deepCopiedPattern = JSON.parse(JSON.stringify(patternToCopy));
            return { ...state, patternClipboard: deepCopiedPattern };
        }
        case ActionType.PASTE_PATTERN: {
            const { patternId: destinationPatternId } = action.payload;
            if (!state.patternClipboard) return state;
            const patternFromClipboard = JSON.parse(JSON.stringify(state.patternClipboard));
            const newPattern: Pattern = {
                ...patternFromClipboard,
                id: destinationPatternId,
            };
            const newPatterns = state.patterns.map(p => {
                return p.id === destinationPatternId ? newPattern : p;
            });
            const { activeSampleBank, activePatternIds } = state;
            if (destinationPatternId === activePatternIds[activeSampleBank]) {
                 return { 
                    ...state, 
                    patterns: newPatterns,
                    activeGrooveIds: newPattern.grooveIds,
                    grooveDepths: newPattern.grooveDepths,
                };
            }
            return { ...state, patterns: newPatterns };
        }
        case ActionType.COPY_LANE: {
            const { activePatternIds, activeSampleBank, patterns, activeSampleId } = state;
            const activePatternId = activePatternIds[activeSampleBank];
            const pattern = patterns.find(p => p.id === activePatternId);
            if (!pattern) return state;

            const laneClipboard: LaneClipboardData = {
                steps: JSON.parse(JSON.stringify(pattern.steps[activeSampleId])),
                paramLocks: JSON.parse(JSON.stringify(pattern.paramLocks[activeSampleId] || {})),
            };
            return { ...state, laneClipboard };
        }
        case ActionType.PASTE_LANE: {
            if (!state.laneClipboard) return state;
            const { activePatternIds, activeSampleBank, activeSampleId } = state;
            const activePatternId = activePatternIds[activeSampleBank];

            const newPatterns = state.patterns.map(p => {
                if (p.id !== activePatternId) return p;

                const newSteps = [...p.steps];
                newSteps[activeSampleId] = JSON.parse(JSON.stringify(state.laneClipboard!.steps));

                const newParamLocks = { ...p.paramLocks };
                newParamLocks[activeSampleId] = JSON.parse(JSON.stringify(state.laneClipboard!.paramLocks));
                
                return { ...p, steps: newSteps, paramLocks: newParamLocks };
            });

            return { ...state, patterns: newPatterns };
        }
        case ActionType.COPY_BANK: {
            const { activePatternIds, activeSampleBank, patterns } = state;
            const activePatternId = activePatternIds[activeSampleBank];
            const pattern = patterns.find(p => p.id === activePatternId);
            if (!pattern) return state;

            const startSampleId = activeSampleBank * PADS_PER_BANK;
            const endSampleId = startSampleId + PADS_PER_BANK;
            
            const bankSequences = pattern.steps.slice(startSampleId, endSampleId);
            const bankParamLocks: BankClipboardData['paramLocks'] = {};
            for (let i = startSampleId; i < endSampleId; i++) {
                if (pattern.paramLocks[i]) {
                    bankParamLocks[i - startSampleId] = pattern.paramLocks[i];
                }
            }

            const bankClipboard: BankClipboardData = {
                sequences: JSON.parse(JSON.stringify(bankSequences)),
                paramLocks: JSON.parse(JSON.stringify(bankParamLocks)),
                grooveId: pattern.grooveIds[activeSampleBank],
                grooveDepth: pattern.grooveDepths[activeSampleBank],
            };
            return { ...state, bankClipboard };
        }
        case ActionType.PASTE_BANK: {
             if (!state.bankClipboard) return state;
            const { activePatternIds, activeSampleBank } = state;
            const activePatternId = activePatternIds[activeSampleBank];
            
            const newPatterns = state.patterns.map(p => {
                if (p.id !== activePatternId) return p;

                const newSteps = [...p.steps];
                const newParamLocks = { ...p.paramLocks };
                
                const startSampleId = activeSampleBank * PADS_PER_BANK;
                
                for (let i = 0; i < PADS_PER_BANK; i++) {
                    newSteps[startSampleId + i] = state.bankClipboard!.sequences[i];
                }

                for (let i = 0; i < PADS_PER_BANK; i++) {
                    const localIndex = i;
                    const globalIndex = startSampleId + i;
                    if (state.bankClipboard!.paramLocks[localIndex]) {
                         newParamLocks[globalIndex] = state.bankClipboard!.paramLocks[localIndex];
                    } else {
                        delete newParamLocks[globalIndex];
                    }
                }
                
                const newGrooveIds = [...p.grooveIds];
                const newGrooveDepths = [...p.grooveDepths];
                newGrooveIds[activeSampleBank] = state.bankClipboard!.grooveId;
                newGrooveDepths[activeSampleBank] = state.bankClipboard!.grooveDepth;
                
                const newPattern = { 
                    ...p, 
                    steps: newSteps, 
                    paramLocks: newParamLocks,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
                
                return newPattern;
            });
            
            const { activePatternIds: currentActivePatternIds, activeSampleBank: currentActiveSampleBank } = state;
            if (activePatternId === currentActivePatternIds[currentActiveSampleBank]) {
                 return { 
                    ...state, 
                    patterns: newPatterns,
                    activeGrooveIds: newPatterns.find(p=>p.id === activePatternId)!.grooveIds,
                    grooveDepths: newPatterns.find(p=>p.id === activePatternId)!.grooveDepths,
                };
            }

            return { ...state, patterns: newPatterns };
        }
        case ActionType.TOGGLE_MASTER_COMPRESSOR:
            return { ...state, masterCompressorOn: !state.masterCompressorOn };
        case ActionType.UPDATE_MASTER_COMPRESSOR_PARAM: {
            const { param, value } = action.payload;
            return {
                ...state,
                masterCompressorParams: {
                    ...state.masterCompressorParams,
                    [param]: value,
                },
            };
        }
        case ActionType.SAVE_COMPRESSOR_SNAPSHOT: {
            const { index, name, params } = action.payload;
            const newSnapshots = [...state.compressorSnapshots];
            if (index >= 0 && index < newSnapshots.length) {
                newSnapshots[index] = {
                    id: index,
                    name,
                    params: JSON.parse(JSON.stringify(params)),
                };
            }
            return { ...state, compressorSnapshots: newSnapshots };
        }
        case ActionType.LOAD_COMPRESSOR_SNAPSHOT: {
            const snapshot = action.payload;
            return {
                ...state,
                masterCompressorParams: JSON.parse(JSON.stringify(snapshot.params)),
            };
        }
        case ActionType.CLEAR_COMPRESSOR_SNAPSHOT: {
            const { index } = action.payload;
            const newSnapshots = [...state.compressorSnapshots];
            if (index >= 0 && index < newSnapshots.length) {
                newSnapshots[index] = null;
            }
            return { ...state, compressorSnapshots: newSnapshots };
        }
        case ActionType.SET_PLAYBACK_TRACK_STATE: {
            const { bankIndex, state: playbackState } = action.payload;
            const newPlaybackTrackStates = [...state.playbackTrackStates];
            newPlaybackTrackStates[bankIndex] = playbackState;
            return { ...state, playbackTrackStates: newPlaybackTrackStates };
        }
        case ActionType.SET_KEY:
            return { ...state, activeKey: action.payload };
        case ActionType.SET_SCALE:
            return { ...state, activeScale: action.payload };
        case ActionType.SET_KEYBOARD_OCTAVE:
            return { ...state, keyboardOctave: action.payload };
        case ActionType.SET_SEQ_MODE:
            return { ...state, seqMode: action.payload };
        case ActionType.LOAD_BANK_PRESET: {
            const { bankIndex, presetData } = action.payload;
            const { samples: presetSamples, sequences, paramLocks, grooveId, grooveDepth } = presetData;
        
            const newSamples = [...state.samples];
            const startSampleIndex = bankIndex * PADS_PER_BANK;
            for (let i = 0; i < PADS_PER_BANK; i++) {
                newSamples[startSampleIndex + i] = {
                    ...presetSamples[i],
                    id: startSampleIndex + i,
                };
            }
        
            const activePatternId = state.activePatternIds[bankIndex];
            const newPatterns = state.patterns.map(p => {
                if (p.id !== activePatternId) return p;
        
                const newSteps = [...p.steps];
                const newParamLocks = { ...p.paramLocks };
                
                for (let i = 0; i < PADS_PER_BANK; i++) {
                    newSteps[startSampleIndex + i] = sequences[i];
                }
        
                for (let i = 0; i < PADS_PER_BANK; i++) {
                     delete newParamLocks[startSampleIndex + i];
                }
                for (const localIndexStr in paramLocks) {
                    const localIndex = parseInt(localIndexStr, 10);
                    const globalIndex = startSampleIndex + localIndex;
                    newParamLocks[globalIndex] = paramLocks[localIndex];
                }
                
                const newGrooveIds = [...p.grooveIds];
                const newGrooveDepths = [...p.grooveDepths];
                newGrooveIds[bankIndex] = grooveId;
                newGrooveDepths[bankIndex] = grooveDepth;
                
                return { 
                    ...p, 
                    steps: newSteps, 
                    paramLocks: newParamLocks,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
            });
        
            const newActiveGrooveIds = [...state.activeGrooveIds];
            const newGrooveDepths = [...state.grooveDepths];
            newActiveGrooveIds[bankIndex] = grooveId;
            newGrooveDepths[bankIndex] = grooveDepth;
        
            return {
                ...state,
                samples: newSamples,
                patterns: newPatterns,
                activeGrooveIds: newActiveGrooveIds,
                grooveDepths: newGrooveDepths,
            };
        }
        case ActionType.LOAD_BANK_KIT: {
            const { bankIndex, samples: kitSamples } = action.payload;
            const newSamples = [...state.samples];
            const startSampleIndex = bankIndex * PADS_PER_BANK;
            for (let i = 0; i < PADS_PER_BANK; i++) {
                newSamples[startSampleIndex + i] = {
                    ...kitSamples[i],
                    id: startSampleIndex + i,
                };
            }
            return { ...state, samples: newSamples };
        }
        case ActionType.UPDATE_SYNTH_PARAM: {
            const { path, value } = action.payload;
            const keys = path.split('.');

            const setDeepValue = (obj: any, pathKeys: string[], val: any): any => {
                const key = pathKeys[0];
                if (pathKeys.length === 1) {
                    if (obj[key] === val) return obj;
                    return { ...obj, [key]: val };
                }
                return {
                    ...obj,
                    [key]: setDeepValue(obj[key] || {}, pathKeys.slice(1), val),
                };
            };

            return { ...state, synth: setDeepValue(state.synth, keys, value) };
        }
        case ActionType.RANDOMIZE_SYNTH_PARAMS: {
             const randomSynth = { ...state.synth };
            return { ...state, synth: randomSynth };
        }
        case ActionType.SET_SYNTH_MOD_MATRIX: {
            const { source, dest, value } = action.payload;
            const newMatrix = JSON.parse(JSON.stringify(state.synthModMatrix));
            if (!newMatrix[source]) {
                newMatrix[source] = {};
            }
            newMatrix[source][dest] = value;
            if (value === 0) {
                delete newMatrix[source][dest];
                if (Object.keys(newMatrix[source]).length === 0) {
                    delete newMatrix[source];
                }
            }
            return { ...state, synthModMatrix: newMatrix };
        }
        case ActionType.TOGGLE_SYNTH_MOD_MATRIX_MUTE:
            return { ...state, isModMatrixMuted: !state.isModMatrixMuted };
        case ActionType.CLEAR_SYNTH_MOD_MATRIX:
            return { ...state, synthModMatrix: {} };
        case ActionType.RANDOMIZE_SYNTH_MOD_MATRIX: {
            const newMatrix: ModMatrix = {};
            for (const source of MOD_SOURCES) {
                for (const dest of MOD_DESTINATIONS) {
                    if (Math.random() > 0.7) { 
                        if (!newMatrix[source]) newMatrix[source] = {};
                        newMatrix[source][dest] = Math.random() * 2 - 1; 
                    }
                }
            }
            return { ...state, synthModMatrix: newMatrix };
        }
        case ActionType.SAVE_SYNTH_MOD_PATCH: {
            const { name, matrix } = action.payload;
            const newPatches = [...state.synthModPatches];
            const firstEmptyIndex = newPatches.findIndex(p => p === null);
            if (firstEmptyIndex !== -1) {
                newPatches[firstEmptyIndex] = {
                    id: firstEmptyIndex,
                    name: name,
                    modMatrix: JSON.parse(JSON.stringify(matrix)),
                };
            }
            return { ...state, synthModPatches: newPatches };
        }
        case ActionType.SAVE_SYNTH_PRESET_AT_INDEX: {
            const { index, name, synth, matrix } = action.payload;
            const newPresets = [...state.synthPresets];
            if (index >= 0 && index < newPresets.length) {
                newPresets[index] = {
                    id: index,
                    name: name,
                    synth: JSON.parse(JSON.stringify(synth)),
                    modMatrix: JSON.parse(JSON.stringify(matrix)),
                };
            }
            return { ...state, synthPresets: newPresets };
        }
        case ActionType.CLEAR_SYNTH_PRESET_AT_INDEX: {
            const { index } = action.payload;
            const newPresets = [...state.synthPresets];
             if (index >= 0 && index < newPresets.length) {
                newPresets[index] = null;
            }
            return { ...state, synthPresets: newPresets };
        }
        case ActionType.LOAD_SYNTH_PRESET: {
            const preset = action.payload;
            return {
                ...state,
                synth: JSON.parse(JSON.stringify(preset.synth)),
                synthModMatrix: JSON.parse(JSON.stringify(preset.modMatrix)),
            };
        }
        case ActionType.SET_SELECTED_SEQ_STEP:
            return { ...state, selectedSeqStep: action.payload };
        case ActionType.TOGGLE_MOD_WHEEL_LOCK_MUTE:
            return { ...state, isModWheelLockMuted: !(state.isModWheelLockMuted ?? false) };
        case ActionType.SET_IS_LOADING:
            return { ...state, isLoading: action.payload };
        case ActionType.SHOW_TOAST:
            return { ...state, toastMessage: action.payload };
        case ActionType.HIDE_TOAST:
            return { ...state, toastMessage: null };
            
        // --- FX Actions (Refactored for Slot-based System) ---
        case ActionType.SET_FX_TYPE: {
            const { slotIndex, type } = action.payload;
            const newSlots = [...state.performanceFx.slots];
            // Replace the slot with a fresh default state for the new type, but preserve bypass mode preference
            const currentBypassMode = newSlots[slotIndex].bypassMode;
            newSlots[slotIndex] = {
                ...createDefaultEffect(type),
                bypassMode: currentBypassMode
            };
            
            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                }
            };
        }
        case ActionType.UPDATE_FX_PARAM: {
            const { slotIndex, param, value } = action.payload;
            const newSlots = [...state.performanceFx.slots];
            newSlots[slotIndex] = {
                ...newSlots[slotIndex],
                params: {
                    ...newSlots[slotIndex].params,
                    [param]: value,
                },
            };
            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                },
            };
        }
        case ActionType.UPDATE_FX_XY: {
            const { slotIndex, padIndex, x, y } = action.payload;
            const newSlots = [...state.performanceFx.slots];
            const slot = newSlots[slotIndex];
            const pad = slot.xyPads[padIndex];
            
            // 1. Update XY Pad coordinates
            const newPads = [...slot.xyPads];
            newPads[padIndex] = { ...pad, x, y };
            
            // 2. Map XY values to underlying params based on the pad's mappings
            // We need to implement scaling logic here similar to how the audio engine uses it, 
            // OR store raw 0-1 values in params and scale entirely in the engine.
            // Currently, the engine expects scaled values for some things (like division index),
            // and 0-1 for others (like mix).
            
            const newParams = { ...slot.params };
            
            const mapValue = (paramName: string, normalizedValue: number): number => {
                if (paramName === 'speed') {
                    // 0-1 -> -1 to 1
                    return (normalizedValue * 2) - 1;
                }
                if (paramName === 'division' || paramName === 'lfoRate') {
                    // 0-1 -> Index in EXTENDED_DIVISIONS
                    const maxIndex = EXTENDED_DIVISIONS.length - 1;
                    return Math.floor(normalizedValue * maxIndex);
                }
                // Default: 0-1
                return normalizedValue;
            };

            newParams[pad.xParam] = mapValue(pad.xParam, x);
            newParams[pad.yParam] = mapValue(pad.yParam, y);

            newSlots[slotIndex] = {
                ...slot,
                xyPads: newPads,
                params: newParams,
            };

            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                }
            };
        }
        case ActionType.SET_FX_ROUTING:
            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    routing: action.payload,
                },
            };
        case ActionType.TOGGLE_FX_BYPASS: {
            const slotIndex = action.payload;
            const newSlots = [...state.performanceFx.slots];
            newSlots[slotIndex] = {
                ...newSlots[slotIndex],
                isOn: !newSlots[slotIndex].isOn,
            };
            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                },
            };
        }
        case ActionType.SAVE_FX_SNAPSHOT: {
            const { slotIndex, index } = action.payload;
            const newSlots = [...state.performanceFx.slots];
            const targetSlot = newSlots[slotIndex];
            const newSnapshots = [...targetSlot.snapshots];
            
            newSnapshots[index] = {
                id: index,
                active: true,
                params: JSON.parse(JSON.stringify(targetSlot.params)),
                xyPads: JSON.parse(JSON.stringify(targetSlot.xyPads)),
            };
            
            newSlots[slotIndex] = {
                ...targetSlot,
                snapshots: newSnapshots,
            };

            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                },
            };
        }
        case ActionType.LOAD_FX_SNAPSHOT: {
            const { slotIndex, index } = action.payload;
            const newSlots = [...state.performanceFx.slots];
            const targetSlot = newSlots[slotIndex];
            const snapshot = targetSlot.snapshots[index];
            
            if (!snapshot.active) return state;
            
            newSlots[slotIndex] = {
                ...targetSlot,
                params: JSON.parse(JSON.stringify(snapshot.params)),
                xyPads: JSON.parse(JSON.stringify(snapshot.xyPads)),
            };

            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    slots: newSlots,
                },
            };
        }
        case ActionType.SAVE_GLOBAL_FX_SNAPSHOT: {
            const { index } = action.payload;
            const newGlobalSnapshots = [...state.performanceFx.globalSnapshots];
            
            // Serialize the state of all slots
            const slotsState = state.performanceFx.slots.map(slot => ({
                type: slot.type,
                params: JSON.parse(JSON.stringify(slot.params)),
                isOn: slot.isOn,
                bypassMode: slot.bypassMode // Save bypass mode
            }));

            const chainState = {
                slots: slotsState,
                routing: [...state.performanceFx.routing],
            };
            
            newGlobalSnapshots[index] = {
                id: index,
                active: true,
                chainState,
            };
            
            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    globalSnapshots: newGlobalSnapshots,
                },
            };
        }
        case ActionType.LOAD_GLOBAL_FX_SNAPSHOT: {
            const { index } = action.payload;
            const snapshot = state.performanceFx.globalSnapshots[index];
            if (!snapshot.active) return state;
            
            // Restore slots
            const restoredSlots = snapshot.chainState.slots.map(savedSlot => {
                // Create a fresh instance of the correct type
                const base = createDefaultEffect(savedSlot.type);
                // Apply saved params and state
                return {
                    ...base,
                    isOn: savedSlot.isOn,
                    bypassMode: savedSlot.bypassMode || 'soft', // Default to soft if missing in old snapshot
                    params: savedSlot.params,
                    // Note: Snapshots currently don't save/restore XY pad state for global snapshots to keep it simple,
                    // but they could if we expanded the snapshot structure.
                    // For now, we keep the default XY pads for the restored type.
                };
            });

            return {
                ...state,
                performanceFx: {
                    ...state.performanceFx,
                    routing: snapshot.chainState.routing,
                    slots: restoredSlots,
                },
            };
        }

        default:
            return state;
    }
};

export const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> }>({
    state: initialState,
    dispatch: () => null,
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

    // Effect for loading session on startup
    useEffect(() => {
        const loadSession = async () => {
            const sessionData = await db.session.get(0);
            if (sessionData && state.audioContext) {
                const storableToSamples = (storableSamples: StorableSample[]): Sample[] => {
                    if (!state.audioContext) return [];
                    return storableSamples.map(s => ({
                        ...s,
                        buffer: storableToAudioBuffer(s.bufferData, state.audioContext),
                    }));
                };
                const loadedSamples = storableToSamples(sessionData.samples);
                const loadedState = { ...sessionData.state, samples: loadedSamples };
                dispatch({ type: ActionType.LOAD_PROJECT_STATE, payload: loadedState });
            } else {
                dispatch({ type: ActionType.SET_IS_LOADING, payload: false });
            }
            setIsInitialLoadComplete(true);
        };

        if (state.audioContext && !isInitialLoadComplete) {
            loadSession();
        }
    }, [state.audioContext, isInitialLoadComplete]);


    // Effect for saving session on state change
    useEffect(() => {
        if (!isInitialLoadComplete || state.isLoading) {
            return; // Don't save until initial load is done and we're not in a loading state
        }
        
        const handler = setTimeout(async () => {
            const stateToSave = { ...state };
            
            // Exclude non-serializable or transient properties
            const propertiesToDelete: (keyof AppState)[] = [
                'audioContext', 'isInitialized', 'isPlaying', 'isRecording', 
                'isArmed', 'currentSteps', 'samples', 'grooves', 'isLoading',
                'isMasterRecording', 'isMasterRecArmed', 'toastMessage'
            ];
            propertiesToDelete.forEach(prop => delete (stateToSave as Partial<AppState>)[prop]);

            const samplesToStore: StorableSample[] = state.samples.map(s => ({
                ...s,
                buffer: undefined, // remove the non-serializable buffer
                bufferData: audioBufferToStorable(s.buffer),
            }));

            const session: Session = {
                id: 0,
                state: stateToSave,
                samples: samplesToStore,
            };

            try {
                await db.session.put(session);
            } catch (error) {
                console.error("Failed to save session:", error);
            }
        }, 1000); // Debounce save by 1 second

        return () => {
            clearTimeout(handler);
        };
    }, [state, isInitialLoadComplete]);

    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};
