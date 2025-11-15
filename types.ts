
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
    playbackKey: number; // 0-11 for C-B, for non-destructive playback re-pitching
    playbackScale: string; // Name of the scale for non-destructive playback re-pitching
    // Each pattern now stores its own groove settings for all 4 banks
    grooveIds: number[]; 
    grooveDepths: number[];
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

// MIDI Learn types
export type MidiParamId = 
    | `sample.${number}.volume`
    | `sample.${number}.pitch`
    | `sample.${number}.start`
    | `sample.${number}.decay`
    | `sample.${number}.lpFreq`
    | `sample.${number}.hpFreq`
    | `bank.${number}.volume`
    | `bank.${number}.pan`
    | `master.volume`
    | `compressor.${keyof MasterCompressorParams}`;

export interface MidiMapping {
    cc: number; // MIDI CC number (0-127)
    paramIds: MidiParamId[]; // Multiple parameters can be mapped to one CC
    min: number; // Parameter min value
    max: number; // Parameter max value
}

// Template for saving/loading MIDI mappings
export interface MidiMappingTemplate {
    id: string;
    name: string;
    mappings: MidiMapping[];
    createdAt: number;
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
    // "Live" groove settings, loaded from the active pattern
    activeGrooveIds: number[]; 
    grooveDepths: number[];
    activeKey: number; // 0-11 for C-B
    activeScale: string; // Name of the scale
    keyboardOctave: number; // For PC keyboard note input
    seqMode: 'PART' | 'PARAM' | 'REC'; // Sequencer view mode
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
    patternClipboard: Pattern | null;
    masterCompressorOn: boolean;
    masterCompressorParams: MasterCompressorParams;
    playbackTrackStates: {
        currentPart: 'A' | 'B';
        partRepetition: number;
    }[];
    // MIDI Learn state
    midiLearnMode: MidiParamId | null; // null = not learning, otherwise the param ID being learned
    midiMappings: MidiMapping[]; // Array of MIDI CC to parameter mappings
    midiMappingTemplates: MidiMappingTemplate[]; // Saved MIDI mapping templates
}

export enum ActionType {
    INITIALIZE_AUDIO,
    TOGGLE_PLAY,
    SET_BPM,
    SET_CURRENT_STEP,
    SET_ACTIVE_SAMPLE,
    SET_ACTIVE_SAMPLE_BANK,
    SET_ACTIVE_GROOVE,
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
    UPDATE_PATTERN_PLAYBACK_SCALE,
    RANDOMIZE_SEQUENCE,
    CLEAR_SEQUENCE,
    FILL_SEQUENCE,
    RANDOMIZE_PITCH,
    APPLY_SEQUENCE_TEMPLATE,
    APPLY_BANK_A_DRUM_TEMPLATE,
    COPY_PATTERN,
    PASTE_PATTERN,
    SET_KEYBOARD_OCTAVE,
    SET_SEQ_MODE,
    START_MIDI_LEARN,
    STOP_MIDI_LEARN,
    ADD_MIDI_MAPPING,
    ADD_MIDI_MAPPING_TO_CC, // Add parameter to existing CC mapping
    REMOVE_MIDI_MAPPING,
    REMOVE_PARAM_FROM_MIDI_MAPPING,
    SAVE_MIDI_MAPPING_TEMPLATE,
    LOAD_MIDI_MAPPING_TEMPLATE,
    DELETE_MIDI_MAPPING_TEMPLATE,
}

export type Action =
    | { type: ActionType.INITIALIZE_AUDIO; payload: AudioContext }
    | { type: ActionType.TOGGLE_PLAY }
    | { type: ActionType.SET_BPM; payload: number }
    | { type: ActionType.SET_CURRENT_STEP; payload: { bankIndex: number; step: number } }
    | { type: ActionType.SET_ACTIVE_SAMPLE; payload: number }
    | { type: ActionType.SET_ACTIVE_SAMPLE_BANK; payload: number }
    | { type: ActionType.SET_ACTIVE_GROOVE; payload: { bankIndex: number; grooveId: number } }
    | { type: ActionType.SET_GROOVE_DEPTH; payload: { bankIndex: number; value: number } }
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
    | { type: ActionType.SET_SCALE, payload: string }
    | { type: ActionType.UPDATE_PATTERN_PLAYBACK_SCALE, payload: { patternId: number; key?: number; scale?: string } }
    | { type: ActionType.RANDOMIZE_SEQUENCE, payload: { patternId: number; sampleId: number } }
    | { type: ActionType.CLEAR_SEQUENCE, payload: { patternId: number; sampleId: number } }
    | { type: ActionType.FILL_SEQUENCE, payload: { patternId: number; sampleId: number } }
    | { type: ActionType.RANDOMIZE_PITCH, payload: { patternId: number; sampleId: number; key: number; scale: string } }
    | { type: ActionType.APPLY_SEQUENCE_TEMPLATE, payload: { patternId: number; sampleId: number; steps: boolean[] } }
    | { type: ActionType.APPLY_BANK_A_DRUM_TEMPLATE, payload: { patternId: number; sequences: { [key: number]: boolean[] } } }
    | { type: ActionType.COPY_PATTERN, payload: { patternId: number } }
    | { type: ActionType.PASTE_PATTERN, payload: { patternId: number } }
    | { type: ActionType.SET_KEYBOARD_OCTAVE, payload: number }
    | { type: ActionType.SET_SEQ_MODE, payload: 'PART' | 'PARAM' | 'REC' }
    | { type: ActionType.START_MIDI_LEARN, payload: MidiParamId }
    | { type: ActionType.STOP_MIDI_LEARN }
    | { type: ActionType.ADD_MIDI_MAPPING, payload: MidiMapping }
    | { type: ActionType.ADD_MIDI_MAPPING_TO_CC, payload: { cc: number; paramId: MidiParamId } }
    | { type: ActionType.REMOVE_MIDI_MAPPING, payload: { cc: number } }
    | { type: ActionType.REMOVE_PARAM_FROM_MIDI_MAPPING, payload: { cc: number; paramId: MidiParamId } }
    | { type: ActionType.SAVE_MIDI_MAPPING_TEMPLATE, payload: { name: string } }
    | { type: ActionType.LOAD_MIDI_MAPPING_TEMPLATE, payload: { templateId: string } }
    | { type: ActionType.DELETE_MIDI_MAPPING_TEMPLATE, payload: { templateId: string } };
