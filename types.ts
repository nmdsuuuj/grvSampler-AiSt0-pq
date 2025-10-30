// types.ts
export interface Sample {
  id: number;
  buffer: AudioBuffer | null;
  volume: number; // 0 to 1
  pitch: number; // semitones, -24 to 24
  start: number; // 0 to 1
  decay: number; // 0 to 1 (acts as length multiplier)
}

export interface Pattern {
  id: number;
  steps: boolean[][]; // [sampleId][step]
  stepResolutionA: number;
  stepResolutionB: number;
  stepLengthA: number; // 1-16
  stepLengthB: number; // 1-16
  loopCountA: number;
  loopCountB: number;
}

export interface Groove {
    id: number;
    name: string;
    offsets: number[]; // Array of 16 timing offsets (-1 to 1)
}

export interface AppState {
  audioContext: AudioContext | null;
  samples: Sample[];
  patterns: Pattern[];
  isPlaying: boolean;
  bpm: number;
  grooveDepth: number; // -8 to 8, represents -800% to 800%
  activeSampleId: number;
  activePatternIds: number[]; // Index corresponds to bank index, stores GLOBAL pattern ID
  activeGrooveId: number;
  activeSampleBank: number;
  activeGrooveBank: number;
  isRecording: boolean;
  currentStep: number;
}

export enum ActionType {
  INITIALIZE_AUDIO_ENGINE = 'INITIALIZE_AUDIO_ENGINE',
  LOAD_SAMPLE = 'LOAD_SAMPLE',
  UPDATE_SAMPLE_PARAM = 'UPDATE_SAMPLE_PARAM',
  TOGGLE_PLAY = 'TOGGLE_PLAY',
  SET_BPM = 'SET_BPM',
  SET_CURRENT_STEP = 'SET_CURRENT_STEP',
  TOGGLE_STEP = 'TOGGLE_STEP',
  SET_ACTIVE_SAMPLE = 'SET_ACTIVE_SAMPLE',
  SET_ACTIVE_PATTERN_FOR_BANK = 'SET_ACTIVE_PATTERN_FOR_BANK',
  SET_ACTIVE_SAMPLE_BANK = 'SET_ACTIVE_SAMPLE_BANK',
  START_RECORDING = 'START_RECORDING',
  STOP_RECORDING = 'STOP_RECORDING',
  SET_GROOVE_DEPTH = 'SET_GROOVE_DEPTH',
  SET_ACTIVE_GROOVE = 'SET_ACTIVE_GROOVE',
  SET_ACTIVE_GROOVE_BANK = 'SET_ACTIVE_GROOVE_BANK',
  UPDATE_PATTERN_PARAMS = 'UPDATE_PATTERN_PARAMS',
}

export type AppAction =
  | { type: ActionType.INITIALIZE_AUDIO_ENGINE }
  | { type: ActionType.LOAD_SAMPLE; payload: { sampleId: number; buffer: AudioBuffer } }
  | { type: ActionType.UPDATE_SAMPLE_PARAM; payload: { sampleId: number; param: keyof Omit<Sample, 'id' | 'buffer'>; value: number } }
  | { type: ActionType.TOGGLE_PLAY }
  | { type: ActionType.SET_BPM; payload: number }
  | { type: ActionType.SET_CURRENT_STEP; payload: number }
  | { type: ActionType.TOGGLE_STEP; payload: { patternId: number; sampleId: number; step: number } }
  | { type: ActionType.SET_ACTIVE_SAMPLE; payload: number }
  | { type: ActionType.SET_ACTIVE_PATTERN_FOR_BANK; payload: { bankIndex: number, patternId: number } }
  | { type: ActionType.SET_ACTIVE_SAMPLE_BANK; payload: number }
  | { type: ActionType.START_RECORDING }
  | { type: ActionType.STOP_RECORDING }
  | { type: ActionType.SET_GROOVE_DEPTH; payload: number }
  | { type: ActionType.SET_ACTIVE_GROOVE; payload: number }
  | { type: ActionType.SET_ACTIVE_GROOVE_BANK; payload: number }
  | { type: ActionType.UPDATE_PATTERN_PARAMS; payload: { patternId: number; params: Partial<Omit<Pattern, 'id' | 'steps'>> } };