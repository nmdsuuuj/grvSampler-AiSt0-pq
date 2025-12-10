
import React, { createContext, useReducer, Dispatch } from 'react';
import { AppState, Action, ActionType, Sample, MasterCompressorParams, Step, LockableParam, Pattern, LaneClipboardData, BankClipboardData, BankPresetData, Synth, SynthPreset, ModMatrix, ModPatch, MasterCompressorSnapshot } from '../types';
import { TOTAL_SAMPLES, TOTAL_PATTERNS, STEPS_PER_PATTERN, TOTAL_BANKS, GROOVE_PATTERNS, PADS_PER_BANK, OSC_WAVEFORMS, FILTER_TYPES, WAVESHAPER_TYPES, LFO_WAVEFORMS, MOD_SOURCES, MOD_DESTINATIONS, LFO_SYNC_RATES, LFO_SYNC_TRIGGERS } from '../constants';
import SCALES from '../scales';

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
    globalGateTime: 0.2,
    modWheel: 1,
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
// Preset 1: FM Lead
defaultPresets[1] = {
    id: 1, name: 'FM Lead',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Sine', octave: 0 },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: 1, detune: 0, fmDepth: 1200 },
        filter: { type: 'Highpass 12dB', cutoff: 500, resonance: 5, envAmount: 1000 },
        filterEnv: { attack: 0.1, decay: 0.5, sustain: 0.8 },
        ampEnv: { decay: 0.8 },
    },
    modMatrix: { 'filterEnv': { 'osc2FM': 1.0 } },
};
// Preset 2: Sync Lead
defaultPresets[2] = {
    id: 2, name: 'Sync Lead',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: 0, sync: true },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: 0, detune: 0, pitchEnvAmount: 7200 },
        filter: { type: 'Lowpass 24dB', cutoff: 2000, resonance: 10, envAmount: 6000 },
        filterEnv: { attack: 0.02, decay: 0.6, sustain: 0.2 },
        ampEnv: { decay: 1.0 },
    },
    modMatrix: {},
};
// Preset 3: Wobbly Bass
defaultPresets[3] = {
    id: 3, name: 'Wobbly Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Square', octave: -2, waveshapeAmount: 0.3, waveshapeType: 'Soft Clip' },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: -1, waveshapeAmount: 0.3, waveshapeType: 'Soft Clip' },
        filter: { type: 'Lowpass 24dB', cutoff: 400, resonance: 15, envAmount: 100 },
        ampEnv: { decay: 0.3 },
        lfo1: { ...initialSynthState.lfo1, type: 'Sine', rate: LFO_SYNC_RATES.findIndex(r => r.label === '1/8'), rateMode: 'sync', syncTrigger: '1 Bar' },
    },
    modMatrix: { 'lfo1': { 'filterCutoff': 1.0 } },
};
// Preset 4: Perfect Fifth
defaultPresets[4] = {
    id: 4, name: 'Perfect Fifth',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Triangle', octave: 0 },
        osc2: { ...initialSynthState.osc2, type: 'Triangle', octave: 0, detune: 700 },
        ampEnv: { decay: 0.8 },
    },
    modMatrix: {},
};
// Preset 5: Perfect Fourth
defaultPresets[5] = {
    id: 5, name: 'Perfect Fourth',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: 0 },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: 0, detune: 500 },
        ampEnv: { decay: 1.2 },
    },
    modMatrix: {},
};
// Preset 6: Spacy FX
defaultPresets[6] = {
    id: 6, name: 'Spacy FX',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Sine', octave: 1, fmDepth: 2000 },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: -1, fmDepth: 1000 },
        filter: { type: 'Bandpass 12dB', cutoff: 5000, resonance: 25, envAmount: 4000 },
        filterEnv: { attack: 1.5, decay: 2, sustain: 0.5 },
        ampEnv: { decay: 2.0 },
    },
    modMatrix: { 'lfo1': { 'osc1Pitch': 0.2, 'osc2Pitch': -0.2 }, 'lfo2': { 'filterCutoff': 1.0 } },
};
// Preset 7: Aggro Crush
defaultPresets[7] = {
    id: 7, name: 'Aggro Crush',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'PWM', octave: -1, waveshapeAmount: 0.4, waveshapeType: 'Bitcrush', wsLfoAmount: 0.6 },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: -2, waveshapeAmount: 0.5, waveshapeType: 'Hard Clip' },
        filter: { type: 'Lowpass 12dB', cutoff: 1500, resonance: 5, envAmount: 3000 },
        ampEnv: { decay: 0.2 },
        lfo1: { ...initialSynthState.lfo1, type: 'Saw Down', rate: 15, syncTrigger: 'Gate' },
    },
    modMatrix: {},
};
// Preset 8: Supersaw Lead
defaultPresets[8] = {
    id: 8, name: 'Supersaw Lead',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Supersaw', octave: 0, detune: 12 },
        osc2: { ...initialSynthState.osc2, type: 'Supersaw', octave: -1, detune: -12 },
        oscMix: 0.4,
        filter: { type: 'Lowpass 24dB', cutoff: 6000, resonance: 4, envAmount: 4000 },
        filterEnv: { attack: 0.05, decay: 0.8, sustain: 0.3 },
        ampEnv: { decay: 1.0 },
    },
    modMatrix: { 'lfo1': { 'filterCutoff': 0.5 } },
};
// Preset 9: Riser FX
defaultPresets[9] = {
    id: 9, name: 'Riser FX',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Noise' },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: 1, detune: 15 },
        filter: { type: 'Highpass 24dB', cutoff: 100, resonance: 10, envAmount: 8000 },
        filterEnv: { attack: 4, decay: 0.1, sustain: 1 },
        ampEnv: { decay: 4.0 },
    },
    modMatrix: {},
};
// Preset 10: Trance Pluck
defaultPresets[10] = {
    id: 10, name: 'Trance Pluck',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down' },
        osc2: { ...initialSynthState.osc2, type: 'Square', detune: 5 },
        filter: { type: 'Lowpass 12dB', cutoff: 1500, resonance: 5, envAmount: 5000 },
        filterEnv: { attack: 0.01, decay: 0.3, sustain: 0 },
        ampEnv: { decay: 0.4 },
    },
    modMatrix: {},
};
// Preset 11: 8 Bit Arp
defaultPresets[11] = {
    id: 11, name: '8 Bit Arp',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Square', waveshapeType: 'Bitcrush', waveshapeAmount: 0.7 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: -1, detune: 0 },
        filter: { type: 'Lowpass 12dB', cutoff: 12000, resonance: 0, envAmount: 0 },
        ampEnv: { decay: 0.15 },
        globalGateTime: 0.1,
        lfo1: { ...initialSynthState.lfo1, syncTrigger: 'Gate' },
    },
    modMatrix: {},
};
// Preset 12: Lush Pad
defaultPresets[12] = {
    id: 12, name: 'Lush Pad',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Supersaw', detune: 8 },
        osc2: { ...initialSynthState.osc2, type: 'Triangle', octave: -1, detune: -8 },
        filter: { type: 'Lowpass 24dB', cutoff: 4000, resonance: 3, envAmount: 2000 },
        filterEnv: { attack: 1.5, decay: 2, sustain: 0.7 },
        ampEnv: { decay: 3.0 },
        lfo1: { ...initialSynthState.lfo1, type: 'Sine', rate: 0.3 },
    },
    modMatrix: { 'lfo1': { 'osc1Pitch': 0.1, 'osc2Pitch': -0.1 } },
};
// Preset 13: Sub Bass
defaultPresets[13] = {
    id: 13, name: 'Sub Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Sine', octave: -2 },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: -2, detune: 2 },
        oscMix: 0.5,
        filter: { type: 'Lowpass 12dB', cutoff: 300, resonance: 1, envAmount: 100 },
        ampEnv: { decay: 0.3 },
    },
    modMatrix: {},
};
// Preset 14: Hard Pitch Kick
defaultPresets[14] = {
    id: 14, name: 'Hard Pitch Kick',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Square', octave: 1, waveshapeType: 'Hard Clip', waveshapeAmount: 0.9 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: 0 },
        filter: { type: 'Lowpass 12dB', cutoff: 800, resonance: 2, envAmount: 2000 },
        filterEnv: { attack: 0.01, decay: 0.15, sustain: 0 },
        ampEnv: { decay: 0.3 },
        globalGateTime: 0.3,
    },
    modMatrix: { 'filterEnv': { 'osc1Pitch': -1.0 } },
};
// Preset 15: 24dB Acid
defaultPresets[15] = {
    id: 15, name: '24dB Acid',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: -1 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: -2 },
        filter: { type: 'Lowpass 24dB', cutoff: 500, resonance: 25, envAmount: 4000 },
        filterEnv: { attack: 0.01, decay: 0.2, sustain: 0 },
        ampEnv: { decay: 0.2 },
    },
    modMatrix: {},
};
// Preset 16: Moogish Lead
defaultPresets[16] = {
    id: 16, name: 'Moogish Lead',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: 0, detune: -4 },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: 0, detune: 4 },
        oscMix: 0.5,
        filter: { type: 'Lowpass 24dB', cutoff: 1500, resonance: 12, envAmount: 5000 },
        filterEnv: { attack: 0.05, decay: 0.4, sustain: 0.6 },
        ampEnv: { decay: 1.0 },
    },
    modMatrix: {},
};
// Preset 17: Reso Sweep
defaultPresets[17] = {
    id: 17, name: 'Reso Sweep',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Noise' },
        osc2: { ...initialSynthState.osc2, type: 'Noise' },
        filter: { type: 'Bandpass 24dB', cutoff: 200, resonance: 28, envAmount: 10000 },
        filterEnv: { attack: 2, decay: 2, sustain: 0 },
        ampEnv: { decay: 4.0 },
    },
    modMatrix: {},
};
// Preset 18: Formant Pad
defaultPresets[18] = {
    id: 18, name: 'Formant Pad',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Formant', octave: 0 },
        osc2: { ...initialSynthState.osc2, type: 'Voice', octave: -1 },
        filter: { type: 'Formant Vowel', cutoff: 2500, resonance: 10, envAmount: 0 },
        ampEnv: { decay: 2.0 },
        lfo1: { ...initialSynthState.lfo1, type: 'S&H Smooth', rate: 0.5 },
    },
    modMatrix: { lfo1: { filterCutoff: 0.8 } },
};
// Preset 19: Gamelan Bell
defaultPresets[19] = {
    id: 19, name: 'Gamelan Bell',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Metallic', octave: 1, fmDepth: 800 },
        osc2: { ...initialSynthState.osc2, type: 'Glass', octave: 2, fmDepth: 1200 },
        ampEnv: { decay: 1.5 },
        filterEnv: { attack: 0.01, decay: 0.1, sustain: 0 },
    },
    modMatrix: { filterEnv: { osc1FM: 1.0, osc2FM: 1.0 } },
};
// Preset 20: Chaotic Noise
defaultPresets[20] = {
    id: 20, name: 'Chaotic Noise',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Glitch' },
        osc2: { ...initialSynthState.osc2, type: 'Noise' },
        filter: { type: 'Peak', cutoff: 2000, resonance: 20, envAmount: 0 },
        lfo1: { ...initialSynthState.lfo1, type: 'Chaotic 1', rate: 10 },
        lfo2: { ...initialSynthState.lfo2, type: 'S&H Steps', rate: 15 },
    },
    modMatrix: { lfo1: { filterCutoff: 1.0 }, lfo2: { filterQ: 1.0 } },
};
// Preset 21: Digital Bleeps
defaultPresets[21] = {
    id: 21, name: 'Digital Bleeps',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Digital', waveshapeType: 'Resampler', waveshapeAmount: 0.8 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: -1 },
        ampEnv: { decay: 0.1 },
        lfo1: { ...initialSynthState.lfo1, type: 'S&H Steps', rate: 12, syncTrigger: 'Gate' },
    },
    modMatrix: { lfo1: { osc1Pitch: 1.0 } },
};
// Preset 22: Muted Key
defaultPresets[22] = {
    id: 22, name: 'Muted Key',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Triangle' },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: -1 },
        filter: { type: 'Lowpass 24dB', cutoff: 1200, resonance: 2, envAmount: 2000 },
        filterEnv: { attack: 0.01, decay: 0.15, sustain: 0 },
        ampEnv: { decay: 0.2 },
    },
    modMatrix: {},
};
// Preset 23: Soft Pluck
defaultPresets[23] = {
    id: 23, name: 'Soft Pluck',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Pluck' },
        osc2: { ...initialSynthState.osc2, type: 'Half-Sine', octave: 1 },
        filter: { type: 'Lowpass 12dB', cutoff: 4000, resonance: 4, envAmount: 3000 },
        filterEnv: { attack: 0.01, decay: 0.5, sustain: 0 },
        ampEnv: { decay: 0.8 },
    },
    modMatrix: {},
};
// Preset 24: Growl Bass
defaultPresets[24] = {
    id: 24, name: 'Growl Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Growl', octave: -2, waveshapeType: 'Chebyshev', waveshapeAmount: 0.6, wsLfoAmount: 0.8 },
        osc2: { ...initialSynthState.osc2, type: 'Wobble', octave: -1 },
        filter: { type: 'Lowpass 24dB', cutoff: 800, resonance: 8, envAmount: 0 },
        lfo1: { ...initialSynthState.lfo1, type: 'Saw Up', rate: LFO_SYNC_RATES.findIndex(r => r.label === '1/8'), rateMode: 'sync', syncTrigger: '1 Bar' },
    },
    modMatrix: { lfo1: { filterCutoff: 1.0 } },
};
// Preset 25: Phase Distortion
defaultPresets[25] = {
    id: 25, name: 'Phase Distortion',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Sine', waveshapeType: 'Phase Shift', waveshapeAmount: 0.5 },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: 0, detune: 4 },
        lfo1: { ...initialSynthState.lfo1, type: 'Sine', rate: 0.2 },
    },
    modMatrix: { lfo1: { osc1Wave: 1.0 } },
};
// Preset 26: Comb Filter FX
defaultPresets[26] = {
    id: 26, name: 'Comb Filter FX',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Noise' },
        osc2: { ...initialSynthState.osc2, type: 'Noise' },
        ampEnv: { decay: 1.5 },
        filter: { ...initialSynthState.filter, type: 'Comb+', cutoff: 80, resonance: 28 },
        lfo1: { ...initialSynthState.lfo1, rate: 0.3 },
    },
    modMatrix: { lfo1: { filterCutoff: 1.0 } },
};
// Preset 27: Donk Bass
defaultPresets[27] = {
    id: 27, name: 'Donk Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Organ', octave: -1 },
        osc2: { ...initialSynthState.osc2, type: 'Square', octave: -1, fmDepth: 50 },
        filter: { type: 'Peak', cutoff: 1000, resonance: 20, envAmount: 3000 },
        filterEnv: { attack: 0.01, decay: 0.1, sustain: 0 },
        ampEnv: { decay: 0.15 },
    },
    modMatrix: {},
};
// Preset 28: Stomper Bass
defaultPresets[28] = {
    id: 28, name: 'Stomper Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Bass', octave: -2, waveshapeType: 'Tube', waveshapeAmount: 0.5 },
        osc2: { ...initialSynthState.osc2, type: 'Pulse 25%', octave: -1 },
        filter: { type: 'Lowpass 24dB', cutoff: 400, resonance: 5, envAmount: 1500 },
        filterEnv: { attack: 0.01, decay: 0.4, sustain: 0.2 },
        ampEnv: { decay: 0.5 },
    },
    modMatrix: {},
};
// Preset 29: Reese Bass
defaultPresets[29] = {
    id: 29, name: 'Reese Bass',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Saw Down', octave: -1, detune: -15 },
        osc2: { ...initialSynthState.osc2, type: 'Saw Down', octave: -1, detune: 15 },
        filter: { type: 'Lowpass 24dB', cutoff: 1200, resonance: 6, envAmount: 0 },
        lfo1: { ...initialSynthState.lfo1, rate: 0.1 },
    },
    modMatrix: { lfo1: { filterCutoff: 0.4 } },
};
// Preset 30: Laser Toms
defaultPresets[30] = {
    id: 30, name: 'Laser Toms',
    synth: {
        ...initialSynthState,
        osc1: { ...initialSynthState.osc1, type: 'Sine', octave: 0 },
        osc2: { ...initialSynthState.osc2, type: 'Sine', octave: -1 },
        filter: { type: 'Lowpass 12dB', cutoff: 2000, resonance: 1, envAmount: 5000 },
        filterEnv: { attack: 0.01, decay: 0.15, sustain: 0 },
        ampEnv: { decay: 0.2 },
    },
    modMatrix: { filterEnv: { osc1Pitch: -1.0 } },
};
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
    synthPresets: defaultPresets,
    synthModPatches: Array(16).fill(null),
    keyboardSource: 'A',
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
        case ActionType.SET_ACTIVE_SAMPLE: {
            const newSampleId = action.payload;
            const newBankIndex = Math.floor(newSampleId / PADS_PER_BANK);
            
            // CRITICAL FIX: Changing the active sample/bank is a UI focus change.
            // It should NOT alter the "live" groove state, which is derived from the
            // active patterns of each bank and used for playback. The original logic
            // incorrectly reloaded the entire groove state, causing other banks'
            // grooves to change unexpectedly.
            return {
                ...state,
                activeSampleId: newSampleId,
                activeSampleBank: newBankIndex,
            };
        }
        case ActionType.SET_ACTIVE_SAMPLE_BANK: {
            const newBankIndex = action.payload;
            
            // CRITICAL FIX: Similar to SET_ACTIVE_SAMPLE, changing the focused bank
            // is a UI action and should not affect the global groove playback state.
            return {
                ...state,
                activeSampleBank: newBankIndex,
                activeSampleId: newBankIndex * PADS_PER_BANK,
            };
        }
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
            const { patternId, sampleId, steps: templateSteps, grooveId, grooveDepth } = action.payload;
        
            let finalState = { ...state };
        
            const newPatterns = state.patterns.map(pattern => {
                if (pattern.id !== patternId) {
                    return pattern;
                }
        
                // Apply step sequence
                const newSteps = pattern.steps.map((lane, laneIndex) => {
                    if (laneIndex !== sampleId) {
                        return lane;
                    }
                    return lane.map((originalStep, stepIndex) => ({
                        ...originalStep,
                        active: templateSteps[stepIndex] ?? originalStep.active,
                    }));
                });
        
                // Apply groove settings if provided
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
        
            // If the modified pattern is active, update the live groove state
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
        
                // Apply step sequences to Bank A
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
        
                // Apply groove settings for Bank A if provided, otherwise use a default swing
                const newGrooveIds = [...pattern.grooveIds];
                const newGrooveDepths = [...pattern.grooveDepths];
                newGrooveIds[0] = grooveId !== undefined ? grooveId : 1; // Default to Swing 16S
                newGrooveDepths[0] = grooveDepth !== undefined ? grooveDepth : 0.3; // Default to 30%
        
                return {
                    ...pattern,
                    steps: newSteps,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
            });
        
            finalState = { ...finalState, patterns: newPatterns };
        
            // If the modified pattern is active in Bank A, update the live groove state
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

            // Find the newly activated pattern to read its groove settings
            const newActivePattern = state.patterns.find(p => p.id === patternId);
            if (!newActivePattern) return state; // Should not happen, but good practice

            // Create new "live" groove state arrays by copying the old ones
            const newActiveGrooveIds = [...state.activeGrooveIds];
            const newGrooveDepths = [...state.grooveDepths];

            // CRITICAL FIX: Update ONLY the groove settings for the bank whose pattern has changed.
            // This preserves the independent groove settings of the other banks.
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
                
                // Paste sequences
                for (let i = 0; i < PADS_PER_BANK; i++) {
                    newSteps[startSampleId + i] = state.bankClipboard!.sequences[i];
                }

                // Paste param locks, re-indexing the keys
                for (let i = 0; i < PADS_PER_BANK; i++) {
                    const localIndex = i;
                    const globalIndex = startSampleId + i;
                    if (state.bankClipboard.paramLocks[localIndex]) {
                         newParamLocks[globalIndex] = state.bankClipboard.paramLocks[localIndex];
                    } else {
                        delete newParamLocks[globalIndex];
                    }
                }
                
                // Paste groove
                const newGrooveIds = [...p.grooveIds];
                const newGrooveDepths = [...p.grooveDepths];
                newGrooveIds[activeSampleBank] = state.bankClipboard.grooveId;
                newGrooveDepths[activeSampleBank] = state.bankClipboard.grooveDepth;
                
                const newPattern = { 
                    ...p, 
                    steps: newSteps, 
                    paramLocks: newParamLocks,
                    grooveIds: newGrooveIds,
                    grooveDepths: newGrooveDepths,
                };
                
                return newPattern;
            });
            
             // If pasting into the currently active bank, also load the pasted groove state
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
        
            // 1. Update samples
            const newSamples = [...state.samples];
            const startSampleIndex = bankIndex * PADS_PER_BANK;
            for (let i = 0; i < PADS_PER_BANK; i++) {
                // Give the loaded sample the correct global ID
                newSamples[startSampleIndex + i] = {
                    ...presetSamples[i],
                    id: startSampleIndex + i,
                };
            }
        
            // 2. Update pattern for the active bank
            const activePatternId = state.activePatternIds[bankIndex];
            const newPatterns = state.patterns.map(p => {
                if (p.id !== activePatternId) return p;
        
                const newSteps = [...p.steps];
                const newParamLocks = { ...p.paramLocks };
                
                // Paste sequences
                for (let i = 0; i < PADS_PER_BANK; i++) {
                    newSteps[startSampleIndex + i] = sequences[i];
                }
        
                // Clear existing param locks for this bank first
                for (let i = 0; i < PADS_PER_BANK; i++) {
                     delete newParamLocks[startSampleIndex + i];
                }
                 // Paste new param locks, re-indexing keys from local (0-7) to global
                for (const localIndexStr in paramLocks) {
                    const localIndex = parseInt(localIndexStr, 10);
                    const globalIndex = startSampleIndex + localIndex;
                    newParamLocks[globalIndex] = paramLocks[localIndex];
                }
                
                // Paste groove
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
        
            // 3. Update live groove state to match the loaded preset
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
                // Give the loaded sample the correct global ID
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

            // Helper for efficient, deep immutable updates.
            // This avoids the performance cost of JSON.parse(JSON.stringify(...)).
            const setDeepValue = (obj: any, pathKeys: string[], val: any): any => {
                const key = pathKeys[0];
                // Base case: If it's the last key, set the value.
                if (pathKeys.length === 1) {
                    // Avoid creating a new object if the value hasn't changed.
                    if (obj[key] === val) return obj;
                    return { ...obj, [key]: val };
                }
                // Recursive step: Create new objects down the path.
                return {
                    ...obj,
                    [key]: setDeepValue(obj[key] || {}, pathKeys.slice(1), val),
                };
            };

            return { ...state, synth: setDeepValue(state.synth, keys, value) };
        }
        case ActionType.RANDOMIZE_SYNTH_PARAMS: {
            const random = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
            const randomFloat = (min: number, max: number) => Math.random() * (max - min) + min;
            const randomInt = (min: number, max: number) => Math.floor(randomFloat(min, max + 1));

            const randomLfo1RateMode = Math.random() > 0.5 ? 'hz' : 'sync';
            const randomLfo1Rate = randomLfo1RateMode === 'sync'
                ? randomInt(0, LFO_SYNC_RATES.length - 1)
                : randomFloat(0.1, 20);

            const randomLfo2RateMode = Math.random() > 0.5 ? 'hz' : 'sync';
            const randomLfo2Rate = randomLfo2RateMode === 'sync'
                ? randomInt(0, LFO_SYNC_RATES.length - 1)
                : randomFloat(0.1, 20);

            const newSynth: Synth = {
                ...state.synth,
                osc1: {
                    ...state.synth.osc1,
                    type: random(OSC_WAVEFORMS),
                    octave: randomInt(-4, 2),
                    detune: randomFloat(-50, 50),
                    fmDepth: randomFloat(0, 3000),
                    waveshapeAmount: Math.random() > 0.5 ? randomFloat(0, 1) : 0,
                    waveshapeType: random(WAVESHAPER_TYPES),
                    wsLfoAmount: Math.random() > 0.6 ? randomFloat(0, 1) : 0,
                    sync: Math.random() > 0.7,
                },
                osc2: {
                     ...state.synth.osc2,
                    type: random(OSC_WAVEFORMS),
                    octave: randomInt(-4, 2),
                    detune: randomFloat(-50, 50),
                    fmDepth: randomFloat(0, 3000),
                    waveshapeAmount: Math.random() > 0.5 ? randomFloat(0, 1) : 0,
                    waveshapeType: random(WAVESHAPER_TYPES),
                    wsLfoAmount: Math.random() > 0.6 ? randomFloat(0, 1) : 0,
                    pitchEnvAmount: Math.random() > 0.5 ? randomFloat(-7200, 7200) : 0,
                },
                oscMix: randomFloat(0, 1),
                filter: {
                    ...state.synth.filter,
                    type: random(FILTER_TYPES),
                    cutoff: randomFloat(100, 10000),
                    resonance: randomFloat(0, 25),
                    envAmount: randomFloat(-6000, 6000),
                },
                filterEnv: {
                    attack: randomFloat(0.001, 1.5),
                    decay: randomFloat(0.1, 2),
                    sustain: randomFloat(0, 1),
                },
                ampEnv: {
                    decay: randomFloat(0.1, 2),
                },
                lfo1: { ...state.synth.lfo1, type: random(LFO_WAVEFORMS), rate: randomLfo1Rate, rateMode: randomLfo1RateMode, syncTrigger: random(LFO_SYNC_TRIGGERS) },
                lfo2: { ...state.synth.lfo2, type: random(LFO_WAVEFORMS), rate: randomLfo2Rate, rateMode: randomLfo2RateMode, syncTrigger: random(LFO_SYNC_TRIGGERS) },
                globalGateTime: randomFloat(0.05, 1.5),
                modWheel: 1.0,
            };
            return { ...state, synth: newSynth };
        }
        case ActionType.SET_SYNTH_MOD_MATRIX: {
            const { source, dest, value } = action.payload;
            const newMatrix = JSON.parse(JSON.stringify(state.synthModMatrix));
            if (!newMatrix[source]) {
                newMatrix[source] = {};
            }
            newMatrix[source][dest] = value;
            // Clean up if value is 0 to keep the state clean
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
                    if (Math.random() > 0.7) { // ~30% chance of connection
                        if (!newMatrix[source]) newMatrix[source] = {};
                        newMatrix[source][dest] = Math.random() * 2 - 1; // Random bipolar amount
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
        case ActionType.SET_KEYBOARD_SOURCE: {
            const newSource = action.payload;
            let newActiveSampleBank = state.activeSampleBank;
            let newActiveSampleId = state.activeSampleId;

            if (newSource === 'A') {
                newActiveSampleBank = 0;
            } else if (newSource === 'B') {
                newActiveSampleBank = 1;
            } else if (newSource === 'C') {
                newActiveSampleBank = 2;
            } else if (newSource === 'SYNTH') {
                newActiveSampleBank = 3;
            }
            
            // If the bank changes, set the active sample to the first pad of that bank
            if (newActiveSampleBank !== state.activeSampleBank) {
                newActiveSampleId = newActiveSampleBank * PADS_PER_BANK;
            }

            return { 
                ...state, 
                keyboardSource: newSource, 
                activeSampleBank: newActiveSampleBank,
                activeSampleId: newActiveSampleId,
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
    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};
