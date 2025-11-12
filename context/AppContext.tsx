import React, { createContext, useReducer, Dispatch } from 'react';
import { AppState, Action, ActionType, Sample } from '../types';
import { TOTAL_SAMPLES, TOTAL_PATTERNS, STEPS_PER_PATTERN, TOTAL_BANKS, GROOVE_PATTERNS, PADS_PER_BANK } from '../constants';

const initialState: AppState = {
    audioContext: null,
    isInitialized: false,
    isPlaying: false,
    isRecording: false,
    isArmed: false,
    recordingThreshold: 0.1,
    bpm: 120,
    currentStep: -1,
    activeSampleId: 0,
    activeSampleBank: 0,
    activeGrooveId: 0,
    activeGrooveBank: 0,
    grooveDepth: 0,
    samples: Array.from({ length: TOTAL_SAMPLES }, (_, i) => ({
        id: i,
        name: `Sample ${String.fromCharCode(65 + Math.floor(i / PADS_PER_BANK))}${ (i % PADS_PER_BANK) + 1}`,
        buffer: null,
        volume: 1,
        pitch: 0,
        start: 0,
        decay: 1,
    })),
    patterns: Array.from({ length: TOTAL_PATTERNS }, (_, i) => ({
        id: i,
        steps: Array.from({ length: TOTAL_SAMPLES }, () => Array(STEPS_PER_PATTERN).fill(false)),
        stepResolutionA: 16,
        stepLengthA: 16,
        loopCountA: 1,
        stepResolutionB: 16,
        stepLengthB: 16,
        loopCountB: 1,
    })),
    activePatternIds: Array(TOTAL_BANKS).fill(0).map((_, i) => i * (TOTAL_PATTERNS / TOTAL_BANKS)), // Bank A gets P1 (id 0), B gets P33 (id 32), etc.
    grooves: GROOVE_PATTERNS,
    bankVolumes: Array(TOTAL_BANKS).fill(1),
    sampleClipboard: null,
};

const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case ActionType.INITIALIZE_AUDIO:
            return { ...state, audioContext: action.payload, isInitialized: true };
        case ActionType.TOGGLE_PLAY:
            return { ...state, isPlaying: !state.isPlaying };
        case ActionType.SET_BPM:
            return { ...state, bpm: action.payload };
        case ActionType.SET_CURRENT_STEP:
            return { ...state, currentStep: action.payload };
        case ActionType.SET_ACTIVE_SAMPLE:
            return { ...state, activeSampleId: action.payload, activeSampleBank: Math.floor(action.payload / PADS_PER_BANK) };
        case ActionType.SET_ACTIVE_SAMPLE_BANK:
            return { ...state, activeSampleBank: action.payload, activeSampleId: action.payload * PADS_PER_BANK };
        case ActionType.SET_ACTIVE_GROOVE:
            return { ...state, activeGrooveId: action.payload };
        case ActionType.SET_ACTIVE_GROOVE_BANK:
             return { ...state, activeGrooveBank: action.payload };
        case ActionType.SET_GROOVE_DEPTH:
            return { ...state, grooveDepth: action.payload };
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
            const newPatterns = state.patterns.map(p => {
                if (p.id === patternId) {
                    const newSteps = p.steps.map((row, rowIndex) => {
                        if (rowIndex === sampleId) {
                            const newRow = [...row];
                            newRow[step] = !newRow[step];
                            return newRow;
                        }
                        return row;
                    });
                    return { ...p, steps: newSteps };
                }
                return p;
            });
            return { ...state, patterns: newPatterns };
        }
        case ActionType.SET_ACTIVE_PATTERN_FOR_BANK: {
            const { bankIndex, patternId } = action.payload;
            const newActivePatternIds = [...state.activePatternIds];
            newActivePatternIds[bankIndex] = patternId;
            return { ...state, activePatternIds: newActivePatternIds };
        }
        case ActionType.UPDATE_PATTERN_PARAMS: {
            const { patternId, params } = action.payload;
            return {
                ...state,
                patterns: state.patterns.map(p => p.id === patternId ? { ...p, ...params } : p),
            };
        }
        case ActionType.LOAD_PROJECT_STATE:
             // Keep audioContext, but load everything else
            return { ...state, ...action.payload, audioContext: state.audioContext, isPlaying: false, currentStep: -1, isRecording: false, isArmed: false };
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