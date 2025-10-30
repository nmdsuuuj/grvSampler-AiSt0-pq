import React, { createContext, useReducer, Dispatch } from 'react';
import { AppState, AppAction, ActionType, Sample, Pattern } from '../types';
import { TOTAL_SAMPLES, TOTAL_PATTERNS, STEPS_PER_PATTERN, PADS_PER_BANK, TOTAL_BANKS, PATTERNS_PER_BANK } from '../constants';

const initialSamples: Sample[] = Array.from({ length: TOTAL_SAMPLES }, (_, i) => ({
  id: i,
  buffer: null,
  volume: 1,
  pitch: 0,
  start: 0,
  decay: 1,
}));

const initialPatterns: Pattern[] = Array.from({ length: TOTAL_PATTERNS }, (_, i) => ({
  id: i,
  steps: Array.from({ length: TOTAL_SAMPLES }, () =>
    Array(STEPS_PER_PATTERN).fill(false)
  ),
  stepResolutionA: 16,
  stepResolutionB: 16,
  stepLengthA: 16,
  stepLengthB: 16,
  loopCountA: 1,
  loopCountB: 1,
}));

export const initialState: AppState = {
  audioContext: null,
  samples: initialSamples,
  patterns: initialPatterns,
  isPlaying: false,
  bpm: 120,
  grooveDepth: 0,
  activeSampleId: 0,
  activePatternIds: Array.from({ length: TOTAL_BANKS }, (_, i) => i * PATTERNS_PER_BANK), // [0, 32, 64, 96]
  activeGrooveId: 0,
  activeSampleBank: 0,
  activeGrooveBank: 0,
  isRecording: false,
  currentStep: -1,
};

export const AppContext = createContext<{
  state: AppState;
  dispatch: Dispatch<AppAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case ActionType.INITIALIZE_AUDIO_ENGINE:
      return {
        ...state,
        audioContext: new (window.AudioContext || (window as any).webkitAudioContext)(),
      };
    case ActionType.LOAD_SAMPLE: {
        const newSamples = [...state.samples];
        newSamples[action.payload.sampleId] = {
            ...newSamples[action.payload.sampleId],
            buffer: action.payload.buffer,
        };
        return { ...state, samples: newSamples };
    }
    case ActionType.UPDATE_SAMPLE_PARAM: {
      const { sampleId, param, value } = action.payload;
      const newSamples = [...state.samples];
      const sampleToUpdate = { ...newSamples[sampleId] };
      if (param in sampleToUpdate) {
        (sampleToUpdate as any)[param] = value;
      }
      newSamples[sampleId] = sampleToUpdate;
      return { ...state, samples: newSamples };
    }
    case ActionType.TOGGLE_PLAY:
      return { ...state, isPlaying: !state.isPlaying, currentStep: -1 };
    case ActionType.SET_BPM:
      return { ...state, bpm: action.payload };
    case ActionType.SET_GROOVE_DEPTH:
        return { ...state, grooveDepth: action.payload };
    case ActionType.SET_ACTIVE_GROOVE:
        return { ...state, activeGrooveId: action.payload };
    case ActionType.SET_ACTIVE_GROOVE_BANK:
        const firstGrooveInBank = action.payload * PADS_PER_BANK;
        return { ...state, activeGrooveBank: action.payload, activeGrooveId: firstGrooveInBank };
    case ActionType.SET_CURRENT_STEP:
      return { ...state, currentStep: action.payload };
    case ActionType.TOGGLE_STEP: {
      const { patternId, sampleId, step } = action.payload;
      
      const newPatterns = [...state.patterns];
      const patternIndex = newPatterns.findIndex(p => p.id === patternId);
      
      if (patternIndex > -1) {
          const patternToUpdate = { ...newPatterns[patternIndex] };
          patternToUpdate.steps = patternToUpdate.steps.map(s => [...s]);
          // Ensure the row exists before trying to access it
          if (!patternToUpdate.steps[sampleId]) {
              patternToUpdate.steps[sampleId] = Array(STEPS_PER_PATTERN).fill(false);
          }
          patternToUpdate.steps[sampleId][step] = !patternToUpdate.steps[sampleId][step];
          newPatterns[patternIndex] = patternToUpdate;
          return { ...state, patterns: newPatterns };
      }
      return state;
    }
    case ActionType.SET_ACTIVE_SAMPLE:
      return { ...state, activeSampleId: action.payload };
    case ActionType.SET_ACTIVE_PATTERN_FOR_BANK: {
        const { bankIndex, patternId } = action.payload;
        const newActivePatternIds = [...state.activePatternIds];
        newActivePatternIds[bankIndex] = patternId;
        return { ...state, activePatternIds: newActivePatternIds };
    }
    case ActionType.SET_ACTIVE_SAMPLE_BANK: {
        const firstSampleInBank = action.payload * PADS_PER_BANK;
        return { ...state, activeSampleBank: action.payload, activeSampleId: firstSampleInBank };
    }
    case ActionType.START_RECORDING:
      return { ...state, isRecording: true };
    case ActionType.STOP_RECORDING:
      return { ...state, isRecording: false };
    case ActionType.UPDATE_PATTERN_PARAMS: {
        const { patternId, params } = action.payload;
        const newPatterns = [...state.patterns];
        const patternIndex = newPatterns.findIndex(p => p.id === patternId);
        if (patternIndex > -1) {
            newPatterns[patternIndex] = { ...newPatterns[patternIndex], ...params };
        }
        return { ...state, patterns: newPatterns };
    }
    default:
      return state;
  }
};

export const AppProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};