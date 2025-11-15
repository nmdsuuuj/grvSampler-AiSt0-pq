
import { Groove } from "./types";

export const PAD_SIZE = 'w-8 h-8';
export const TOTAL_BANKS = 4;
export const PADS_PER_BANK = 8;
export const PATTERNS_PER_BANK = 32;
export const GROOVES_PER_BANK = 16; // Increased from 8
export const TOTAL_SAMPLES = TOTAL_BANKS * PADS_PER_BANK; // 32
export const TOTAL_PATTERNS = TOTAL_BANKS * PATTERNS_PER_BANK; // 128
export const TOTAL_GROOVES = TOTAL_BANKS * GROOVES_PER_BANK; // Now 64
export const STEPS_PER_PATTERN = 32;
export const STEPS_PER_PART = 16;

export const LOOP_PRESETS = [
    { label: '1:1', a: 1, b: 1 },
    { label: '3:1', a: 3, b: 1 },
    { label: '2:2', a: 2, b: 2 },
    { label: '4:2', a: 4, b: 2 },
    { label: '4:3', a: 4, b: 3 },
    { label: '5:3', a: 5, b: 3 },
    { label: '6:2', a: 6, b: 2 },
    { label: '7:1', a: 7, b: 1 },
    { label: '15:1', a: 15, b: 1 },
    { label: '13:3', a: 13, b: 3 },
    { label: '4:4', a: 4, b: 4 },
    { label: '2:6', a: 2, b: 6 },
    { label: '3:5', a: 3, b: 5 },
    { label: '1:15', a: 1, b: 15 },
    { label: '3:13', a: 3, b: 13 },
];


const Z = 0; // Zero offset
const S = 0.33; // Standard Swing
const H = 0.5;  // Hard Swing
const L = 0.67; // Ludicrous Swing

const P = -0.15; // Pushed (early)
const B = 0.15;  // Laid Back (late)

export const GROOVE_PATTERNS: Groove[] = Array.from({ length: TOTAL_GROOVES}, (_, i) => {
    // Default empty groove
    let pattern: Groove = { id: i, name: `Groove ${i + 1}`, offsets: Array(16).fill(0) };

    // Fill in specific patterns
    if (i === 0) pattern = { id: 0, name: 'Straight', offsets: [Z,Z,Z,Z, Z,Z,Z,Z, Z,Z,Z,Z, Z,Z,Z,Z] };
    if (i === 1) pattern = { id: 1, name: 'Swing 16S', offsets: [Z,S,Z,S, Z,S,Z,S, Z,S,Z,S, Z,S,Z,S] };
    if (i === 2) pattern = { id: 2, name: 'Swing 16H', offsets: [Z,H,Z,H, Z,H,Z,H, Z,H,Z,H, Z,H,Z,H] };
    if (i === 3) pattern = { id: 3, name: 'Swing 16L', offsets: [Z,L,Z,L, Z,L,Z,L, Z,L,Z,L, Z,L,Z,L] };
    if (i === 4) pattern = { id: 4, name: 'MPC 62%', offsets: [Z,0.28,Z,0.28, Z,0.28,Z,0.28, Z,0.28,Z,0.28, Z,0.28,Z,0.28] };
    if (i === 5) pattern = { id: 5, name: 'SP-1200', offsets: [Z,0.4,Z,0.2, Z,0.5,Z,0.1, Z,0.4,Z,0.2, Z,0.5,Z,0.1] };
    if (i === 6) pattern = { id: 6, name: 'Pushed', offsets: [P,P,P,P, P,P,P,P, P,P,P,P, P,P,P,P] };
    if (i === 7) pattern = { id: 7, name: 'Laid Back', offsets: [B,B,B,B, B,B,B,B, B,B,B,B, B,B,B,B] };
    if (i === 8) pattern = { id: 8, name: 'Gallop A', offsets: [Z,S,Z,Z, Z,S,Z,Z, Z,S,Z,Z, Z,S,Z,Z] };
    if (i === 9) pattern = { id: 9, name: 'Gallop B', offsets: [Z,Z,S,Z, Z,Z,S,Z, Z,Z,S,Z, Z,Z,S,Z] };
    if (i === 10) pattern = { id: 10, name: 'Drunk', offsets: [0.1,-0.2,0.3,-0.1, 0.2,-0.3,0.1,-0.2, 0.3,-0.1,0.2,-0.3, 0.1,-0.2,0.3,0.1] };
    if (i === 11) pattern = { id: 11, name: 'Hurry Up', offsets: [Z,Z,Z,Z, Z,Z,Z,Z, Z,Z,Z,Z, P,P*2,P*3,P*4] };
    if (i === 12) pattern = { id: 12, name: 'Slow Down', offsets: [Z,Z,Z,Z, Z,Z,Z,Z, Z,Z,Z,Z, B,B*2,B*3,B*4] };
    if (i === 13) pattern = { id: 13, name: 'Randomish', offsets: [0.1,0.3,-0.2,0.15, -0.1,0.25,0.05,-0.3, 0.1,0.3,-0.2,0.15, -0.1,0.25,0.05,-0.3].map(v => v * (Math.random() + 0.5)) };
    if (i === 14) pattern = { id: 14, name: 'Push & Pull', offsets: [P,B,P,B, P,B,P,B, P,B,P,B, P,B,P,B] };
    if (i === 15) pattern = { id: 15, name: 'Accents', offsets: [Z,Z,Z,Z, S,Z,Z,Z, Z,Z,Z,Z, S,Z,Z,Z] }; // Swing on 2 & 4
    
    // Distorted/Weird Grooves
    if (i === 16) pattern = { id: 16, name: 'Clave 3-2', offsets: [L,Z,Z,L,Z, Z,L,Z,Z, L,Z,L,Z,Z,Z,Z] };
    if (i === 17) pattern = { id: 17, name: 'Stutter', offsets: [Z,-L,Z,Z, Z,-L,Z,Z, Z,-L,Z,Z, Z,-L,Z,Z] };
    if (i === 18) pattern = { id: 18, name: 'Warp', offsets: Array(16).fill(0).map((_, idx) => Math.sin(idx / 4) * 0.5) };
    if (i === 19) pattern = { id: 19, name: 'Deconstruct', offsets: [0.9, -0.9, 0.8, -0.8, 0.7, -0.7, 0.6, -0.6, 0.5, -0.5, 0.4, -0.4, 0.3, -0.3, 0.2, -0.2] };
    if (i === 20) pattern = { id: 20, name: 'Snap Back', offsets: [Z,Z,Z,H, Z,Z,Z,H, Z,Z,Z,H, Z,Z,Z,H] }; // Hard swing on 4
    if (i === 21) pattern = { id: 21, name: 'Shuffle', offsets: [S,Z,S,Z, S,Z,S,Z, S,Z,S,Z, S,Z,S,Z] };
    if (i === 22) pattern = { id: 22, name: 'Drag Race', offsets: [Z,Z,P,P*2, Z,Z,P,P*2, Z,Z,P,P*2, Z,Z,P,P*2] };
    if (i === 23) pattern = { id: 23, name: 'Eighths', offsets: [Z,Z,S,S, Z,Z,S,S, Z,Z,S,S, Z,Z,S,S] };
    
    return pattern;
});
