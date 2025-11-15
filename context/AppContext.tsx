
import React, { createContext, useReducer, Dispatch } from 'react';
import { AppState, Action, ActionType, Sample, MasterCompressorParams, Step, LockableParam, Pattern } from '../types';
import { TOTAL_SAMPLES, TOTAL_PATTERNS, STEPS_PER_PATTERN, TOTAL_BANKS, GROOVE_PATTERNS, PADS_PER_BANK } from '../constants';
import SCALES from '../scales';

const createEmptySteps = (): Step[][] =>
    Array.from({ length: TOTAL_SAMPLES }, () =>
        Array.from({ length: STEPS_PER_PATTERN }, () => ({
            active: false,
            detune: 0, // Default to no detune
            velocity: 1,
        }))
    );

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
        decay: 1,
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
    masterCompressorOn: false,
    masterCompressorParams: {
        threshold: -24,
        knee: 30,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
    },
    playbackTrackStates: Array.from({ length: TOTAL_BANKS }, () => ({ currentPart: 'A', partRepetition: 0 })),
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
        case ActionType.SET_CURRENT_STEP: {
            const { bankIndex, step } = action.payload;
            const newCurrentSteps = [...state.currentSteps];
            newCurrentSteps[bankIndex] = step;
            return { ...state, currentSteps: newCurrentSteps };
        }
        case ActionType.SET_ACTIVE_SAMPLE:
             // When changing sample, also change bank and load that bank's active pattern's groove state
            const newBankIndexForSample = Math.floor(action.payload / PADS_PER_BANK);
            const activePatternIdForSample = state.activePatternIds[newBankIndexForSample];
            const activePatternForSample = state.patterns.find(p => p.id === activePatternIdForSample);
            return {
                ...state,
                activeSampleId: action.payload,
                activeSampleBank: newBankIndexForSample,
                activeGrooveIds: activePatternForSample?.grooveIds || state.activeGrooveIds,
                grooveDepths: activePatternForSample?.grooveDepths || state.grooveDepths,
            };
        case ActionType.SET_ACTIVE_SAMPLE_BANK:
            // When changing bank, load that bank's active pattern's groove state
            const activePatternIdForBank = state.activePatternIds[action.payload];
            const activePatternForBank = state.patterns.find(p => p.id === activePatternIdForBank);
            return {
                ...state,
                activeSampleBank: action.payload,
                activeSampleId: action.payload * PADS_PER_BANK,
                activeGrooveIds: activePatternForBank?.grooveIds || state.activeGrooveIds,
                grooveDepths: activePatternForBank?.grooveDepths || state.grooveDepths,
            };
        case ActionType.SET_ACTIVE_GROOVE: {
            const { bankIndex, grooveId } = action.payload;
            const newActiveGrooveIds = [...state.activeGrooveIds];
            newActiveGrooveIds[bankIndex] = grooveId;

            // Also save this change back to the currently active pattern for that bank
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

            // Also save this change back to the currently active pattern for that bank
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
            const { patternId, sampleId, steps: templateSteps } = action.payload;

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

                return {
                    ...pattern,
                    steps: newSteps,
                };
            });

            return {
                ...state,
                patterns: newPatterns,
            };
        }
        case ActionType.APPLY_BANK_A_DRUM_TEMPLATE: {
            const { patternId, sequences } = action.payload;
        
            return {
                ...state,
                patterns: state.patterns.map(pattern => {
                    if (pattern.id !== patternId) {
                        return pattern;
                    }
        
                    const newSteps = pattern.steps.map(lane => [...lane]);
                    
                    // Apply sequences only to Bank A's pads (sample IDs 0-7)
                    for (const padIndexStr in sequences) {
                        const padIndex = parseInt(padIndexStr, 10);
                        if (padIndex >= 0 && padIndex < PADS_PER_BANK) {
                            const sampleId = padIndex; // In Bank A, sampleId is the same as padIndex
                            const templateSteps = sequences[padIndex];
                            if (templateSteps) {
                                 newSteps[sampleId] = newSteps[sampleId].map((originalStep, stepIndex) => ({
                                    ...originalStep,
                                    active: templateSteps[stepIndex] ?? originalStep.active,
                                }));
                            }
                        }
                    }

                    // Also apply a default swing groove to Bank A
                    const newGrooveIds = [...pattern.grooveIds];
                    const newGrooveDepths = [...pattern.grooveDepths];
                    newGrooveIds[0] = 1; // Swing 16S
                    newGrooveDepths[0] = 0.3; // 30% depth
        
                    return {
                        ...pattern,
                        steps: newSteps,
                        grooveIds: newGrooveIds,
                        grooveDepths: newGrooveDepths,
                    };
                }),
            };
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
                // Default to chromatic if scale not found or is chromatic/thru
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
            if (step < 0) return state; // Guard against invalid step index
            return {
                ...state,
                patterns: state.patterns.map(p => {
                    if (p.id === patternId) {
                        const newSteps = [...p.steps];
                        const newSampleSteps = [...newSteps[sampleId]];
                        newSampleSteps[step] = {
                            ...newSampleSteps[step],
                            active: true,
                            detune: detune, // Record the specific detune from the keyboard
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

                    // Handle detune and velocity which are on the `steps` object
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

                    // Handle other params on the `paramLocks` object
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
                            [param]: param === 'detune' ? 0 : 1, // Reset detune to 0, velocity to 1
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

            // When changing pattern, load that pattern's groove state into the live state
            const newActivePattern = state.patterns.find(p => p.id === patternId);

            return {
                ...state,
                activePatternIds: newActivePatternIds,
                activeGrooveIds: newActivePattern?.grooveIds || state.activeGrooveIds,
                grooveDepths: newActivePattern?.grooveDepths || state.grooveDepths,
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
        case ActionType.LOAD_PROJECT_STATE:
             // Keep audioContext, but load everything else
            return { ...state, ...action.payload, audioContext: state.audioContext, isPlaying: false, currentSteps: Array(TOTAL_BANKS).fill(-1), isRecording: false, isArmed: false };
        case ActionType.SET_RECORDING_STATE:
            return { ...state, isRecording: action.payload };
        case ActionType.SET_ARMED_STATE:
             if (state.isRecording) return state; // Can't arm/disarm while recording
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
            if (state.isMasterRecording) return state; // Can't change arm state while recording
            return { ...state, isMasterRecArmed: !state.isMasterRecArmed };
        case ActionType.COPY_SAMPLE: {
            const sampleToCopy = state.samples.find(s => s.id === state.activeSampleId);
            return { ...state, sampleClipboard: sampleToCopy || null };
        }
        case ActionType.PASTE_SAMPLE: {
            if (!state.sampleClipboard || state.sampleClipboard.id === state.activeSampleId) {
                return state; // Guard against pasting onto the source pad.
            }
            const newSamples = state.samples.map(s => {
                if (s.id === state.activeSampleId) {
                    // Create a new sample object, keeping the target ID but copying everything else.
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
            
            // Basic deep copy for serializable data
            const deepCopiedPattern = JSON.parse(JSON.stringify(patternToCopy));
            return { ...state, patternClipboard: deepCopiedPattern };
        }
        case ActionType.PASTE_PATTERN: {
            const { patternId: destinationPatternId } = action.payload;
            if (!state.patternClipboard) return state;
 
            // Use a robust deep copy to ensure all nested data (steps, paramLocks) is duplicated.
            const patternFromClipboard = JSON.parse(JSON.stringify(state.patternClipboard));
            
            // Create the new pattern, ensuring it gets the correct destination ID.
            const newPattern: Pattern = {
                ...patternFromClipboard,
                id: destinationPatternId,
            };
 
            const newPatterns = state.patterns.map(p => {
                return p.id === destinationPatternId ? newPattern : p;
            });

            // If pasting into the currently active bank, also load the pasted pattern's groove state
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
    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};
