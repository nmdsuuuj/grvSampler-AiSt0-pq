// FIX: Removed self-import of 'Groove' which conflicted with the local declaration of 'Groove'.
export interface Groove {
    id: number;
    name: string;
    offsets: number[];
}

export interface Sample {
    id: number;
    name: string;
    buffer: AudioBuffer | null;
    volume: number;
    pitch: number;
    start: number; // 0-1
    decay: number; // 0-1
}

export interface Pattern {
    id: number;
    steps: boolean[][]; // [sampleId][step]
    stepResolutionA: number; // e.g., 16 for 16th notes
    stepLengthA: number; // 1-16
    loopCountA: number;
    stepResolutionB: number;
    stepLengthB: number;
    loopCountB: number;
}

export interface AppState {
    audioContext: AudioContext | null;
    isInitialized: boolean;
    isPlaying: boolean;
    isRecording: boolean;
    isArmed: boolean;
    recordingThreshold: number;
    bpm: number;
    currentStep: number;
    activeSampleId: number;
    activeSampleBank: number;
    activeGrooveId: number;
    activeGrooveBank: number;
    grooveDepth: number;
    samples: Sample[];
    patterns: Pattern[];
    activePatternIds: number[]; // one per bank
    grooves: Groove[];
    bankVolumes: number[]; // one per bank
    sampleClipboard: Sample | null;
}

export enum ActionType {
    INITIALIZE_AUDIO,
    TOGGLE_PLAY,
    SET_BPM,
    SET_CURRENT_STEP,
    SET_ACTIVE_SAMPLE,
    SET_ACTIVE_SAMPLE_BANK,
    SET_ACTIVE_GROOVE,
    SET_ACTIVE_GROOVE_BANK,
    SET_GROOVE_DEPTH,
    UPDATE_SAMPLE_PARAM,
    UPDATE_SAMPLE_NAME,
    SET_SAMPLES, // for loading/recording
    TOGGLE_STEP,
    SET_ACTIVE_PATTERN_FOR_BANK,
    UPDATE_PATTERN_PARAMS,
    LOAD_PROJECT_STATE,
    SET_RECORDING_STATE,
    SET_ARMED_STATE,
    SET_RECORDING_THRESHOLD,
    SET_BANK_VOLUME,
    COPY_SAMPLE,
    PASTE_SAMPLE,
}

export type Action =
    | { type: ActionType.INITIALIZE_AUDIO; payload: AudioContext }
    | { type: ActionType.TOGGLE_PLAY }
    | { type: ActionType.SET_BPM; payload: number }
    | { type: ActionType.SET_CURRENT_STEP; payload: number }
    | { type: ActionType.SET_ACTIVE_SAMPLE; payload: number }
    | { type: ActionType.SET_ACTIVE_SAMPLE_BANK; payload: number }
    | { type: ActionType.SET_ACTIVE_GROOVE; payload: number }
    | { type: ActionType.SET_ACTIVE_GROOVE_BANK; payload: number }
    | { type: ActionType.SET_GROOVE_DEPTH; payload: number }
    | { type: ActionType.UPDATE_SAMPLE_PARAM; payload: { sampleId: number; param: 'volume' | 'pitch' | 'start' | 'decay'; value: number } }
    | { type: ActionType.UPDATE_SAMPLE_NAME; payload: { sampleId: number; name: string } }
    | { type: ActionType.SET_SAMPLES; payload: Sample[] }
    | { type: ActionType.TOGGLE_STEP; payload: { patternId: number; sampleId: number; step: number } }
    | { type: ActionType.SET_ACTIVE_PATTERN_FOR_BANK; payload: { bankIndex: number; patternId: number } }
    | { type: ActionType.UPDATE_PATTERN_PARAMS; payload: { patternId: number; params: Partial<Omit<Pattern, 'id' | 'steps'>> } }
    | { type: ActionType.LOAD_PROJECT_STATE; payload: Partial<AppState> }
    | { type: ActionType.SET_RECORDING_STATE; payload: boolean }
    | { type: ActionType.SET_ARMED_STATE; payload: boolean }
    | { type: ActionType.SET_RECORDING_THRESHOLD; payload: number }
    | { type: ActionType.SET_BANK_VOLUME; payload: { bankIndex: number; volume: number } }
    | { type: ActionType.COPY_SAMPLE }
    | { type: ActionType.PASTE_SAMPLE };