
export interface Groove {
    id: number;
    name: string;
    offsets: number[];
}

export interface Sample {
    id: number;
    name: string;
    buffer: AudioBuffer | null;
    volume: number; // Base volume
    pitch: number;  // Base pitch in semitones
    start: number; // 0-1
    decay: number; // 0-1
    lpFreq: number; // Low-pass filter frequency
    hpFreq: number; // High-pass filter frequency
}

export interface Step {
    active: boolean;
    detune: number | null; // Pitch detune from base note in cents
    velocity: number; // 0-1
}

// Parameters that can be locked per step for a given sample
export type LockableParam = 'detune' | 'velocity' | 'volume' | 'pitch' | 'start' | 'decay' | 'lpFreq' | 'hpFreq';

export interface Pattern {
    id: number;
    steps: Step[][]; // [sampleId][step]
    paramLocks: Record<number, Partial<Record<LockableParam, (number | null)[]>>>; // { sampleId: { param: [stepValue, ...] } }
    stepResolutionA: number;
    stepLengthA: number;
    loopCountA: number;
    stepResolutionB: number;
    stepLengthB: number;
    loopCountB: number;
}

export interface MasterCompressorParams {
    threshold: number; // dB, -100 to 0
    knee: number;      // dB, 0 to 40
    ratio: number;     // unitless, 1 to 20
    attack: number;    // seconds, 0 to 1
    release: number;   // seconds, 0 to 1
}

export interface PlaybackParams {
    detune: number | null;
    velocity: number;
    volume: number;
    pitch: number;
    start: number;
    decay: number;
    lpFreq: number;
    hpFreq: number;
}

export interface AppState {
    audioContext: AudioContext | null;
    isInitialized: boolean;
    isPlaying: boolean;
    isRecording: boolean;
    isArmed: boolean;
    recordingThreshold: number;
    bpm: number;
    currentSteps: number[];
    activeSampleId: number;
    activeSampleBank: number;
    activeGrooveId: number;
    activeGrooveBank: number;
    grooveDepth: number;
    activeKey: number; // 0-11 for C-B
    activeScale: string; // Name of the scale
    samples: Sample[];
    patterns: Pattern[];
    activePatternIds: number[]; // one per bank
    grooves: Groove[];
    bankVolumes: number[]; // one per bank
    bankPans: number[]; // one per bank, -1 (L) to 1 (R)
    bankMutes: boolean[]; // one per bank
    bankSolos: boolean[]; // one per bank
    masterVolume: number;
    isMasterRecording: boolean;
    isMasterRecArmed: boolean;
    sampleClipboard: Sample | null;
    masterCompressorOn: boolean;
    masterCompressorParams: MasterCompressorParams;
    playbackTrackStates: {
        currentPart: 'A' | 'B';
        partRepetition: number;
    }[];
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
    SET_SAMPLES,
    TOGGLE_STEP,
    UPDATE_PARAM_LOCK,
    CLEAR_PARAM_LOCK_LANE,
    SET_ACTIVE_PATTERN_FOR_BANK,
    UPDATE_PATTERN_PARAMS,
    LOAD_PROJECT_STATE,
    SET_RECORDING_STATE,
    SET_ARMED_STATE,
    SET_RECORDING_THRESHOLD,
    SET_BANK_VOLUME,
    SET_BANK_PAN,
    TOGGLE_BANK_MUTE,
    TOGGLE_BANK_SOLO,
    SET_MASTER_VOLUME,
    TOGGLE_MASTER_RECORDING,
    TOGGLE_MASTER_REC_ARMED,
    COPY_SAMPLE,
    PASTE_SAMPLE,
    TOGGLE_MASTER_COMPRESSOR,
    UPDATE_MASTER_COMPRESSOR_PARAM,
    SET_PLAYBACK_TRACK_STATE,
    RECORD_STEP,
    SET_KEY,
    SET_SCALE,
}

export type Action =
    | { type: ActionType.INITIALIZE_AUDIO; payload: AudioContext }
    | { type: ActionType.TOGGLE_PLAY }
    | { type: ActionType.SET_BPM; payload: number }
    | { type: ActionType.SET_CURRENT_STEP; payload: { bankIndex: number; step: number } }
    | { type: ActionType.SET_ACTIVE_SAMPLE; payload: number }
    | { type: ActionType.SET_ACTIVE_SAMPLE_BANK; payload: number }
    | { type: ActionType.SET_ACTIVE_GROOVE; payload: number }
    | { type: ActionType.SET_ACTIVE_GROOVE_BANK; payload: number }
    | { type: ActionType.SET_GROOVE_DEPTH; payload: number }
    | { type: ActionType.UPDATE_SAMPLE_PARAM; payload: { sampleId: number; param: 'volume' | 'pitch' | 'start' | 'decay' | 'lpFreq' | 'hpFreq'; value: number } }
    | { type: ActionType.UPDATE_SAMPLE_NAME; payload: { sampleId: number; name: string } }
    | { type: ActionType.SET_SAMPLES; payload: Sample[] }
    | { type: ActionType.TOGGLE_STEP; payload: { patternId: number; sampleId: number; step: number } }
    | { type: ActionType.UPDATE_PARAM_LOCK; payload: { patternId: number; sampleId: number; param: LockableParam; step: number; value: number | null } }
    | { type: ActionType.CLEAR_PARAM_LOCK_LANE; payload: { patternId: number; sampleId: number; param: LockableParam } }
    | { type: ActionType.SET_ACTIVE_PATTERN_FOR_BANK; payload: { bankIndex: number; patternId: number } }
    | { type: ActionType.UPDATE_PATTERN_PARAMS; payload: { patternId: number; params: Partial<Omit<Pattern, 'id' | 'steps' | 'paramLocks'>> } }
    | { type: ActionType.LOAD_PROJECT_STATE; payload: Partial<AppState> }
    | { type: ActionType.SET_RECORDING_STATE; payload: boolean }
    | { type: ActionType.SET_ARMED_STATE; payload: boolean }
    | { type: ActionType.SET_RECORDING_THRESHOLD; payload: number }
    | { type: ActionType.SET_BANK_VOLUME; payload: { bankIndex: number; volume: number } }
    | { type: ActionType.SET_BANK_PAN; payload: { bankIndex: number; pan: number } }
    | { type: ActionType.TOGGLE_BANK_MUTE; payload: { bankIndex: number } }
    | { type: ActionType.TOGGLE_BANK_SOLO; payload: { bankIndex: number } }
    | { type: ActionType.SET_MASTER_VOLUME; payload: number }
    | { type: ActionType.TOGGLE_MASTER_RECORDING }
    | { type: ActionType.TOGGLE_MASTER_REC_ARMED }
    | { type: ActionType.COPY_SAMPLE }
    | { type: ActionType.PASTE_SAMPLE }
    | { type: ActionType.TOGGLE_MASTER_COMPRESSOR }
    | { type: ActionType.UPDATE_MASTER_COMPRESSOR_PARAM; payload: { param: keyof MasterCompressorParams; value: number } }
    | { type: ActionType.SET_PLAYBACK_TRACK_STATE; payload: { bankIndex: number; state: { currentPart: 'A' | 'B'; partRepetition: number; } } }
    | { type: ActionType.RECORD_STEP; payload: { patternId: number; sampleId: number; step: number; detune: number } }
    | { type: ActionType.SET_KEY, payload: number }
    | { type: ActionType.SET_SCALE, payload: string };
