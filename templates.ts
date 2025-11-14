
export interface Template {
    name: string;
    category: string;
    steps: boolean[];
}

const T = true;
const F = false;

// All patterns are 32 steps long
const TEMPLATES: Template[] = [
    // --- Basic Drums ---
    {
        name: 'Four On The Floor',
        category: 'Drums',
        steps: [
            T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F,
            T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F,
        ]
    },
    {
        name: 'Backbeat',
        category: 'Drums',
        steps: [
            F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F,
            F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F,
        ]
    },
    {
        name: 'Offbeat Hats',
        category: 'Drums',
        steps: [
            F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F,
            F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F,
        ]
    },
    {
        name: '16th Hats',
        category: 'Drums',
        steps: [
            T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T,
            T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T,
        ]
    },
    {
        name: 'Amen Break (Kick)',
        category: 'Drums',
        steps: [
            T, F, F, F, F, F, T, F, F, T, F, F, F, F, T, F,
            T, F, F, F, F, F, T, F, F, T, F, F, T, F, T, F,
        ]
    },
     {
        name: 'Amen Break (Snare)',
        category: 'Drums',
        steps: [
            F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F,
            F, F, F, F, T, F, F, T, F, F, F, F, F, F, F, F,
        ]
    },

    // --- Techno & House ---
    {
        name: 'Classic House',
        category: 'Techno/House',
        steps: [
            T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F,
            T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F,
        ]
    },
    {
        name: 'Minimal Syncopation',
        category: 'Techno/House',
        steps: [
            T, F, F, F, F, T, F, F, T, F, F, F, T, F, F, T,
            T, F, F, F, F, T, F, F, T, F, F, F, T, F, F, T,
        ]
    },
    {
        name: 'Rolling Bass',
        category: 'Techno/House',
        steps: [
            T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F,
            T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F,
        ]
    },

    // --- Melodic ---
    {
        name: 'Simple Arp Up',
        category: 'Melodic',
        steps: [
            T, F, F, F, F, T, F, F, F, F, T, F, F, F, F, T,
            T, F, F, F, F, T, F, F, F, F, T, F, F, F, F, T,
        ]
    },
    {
        name: '3-Step Arp',
        category: 'Melodic',
        steps: [
            T, F, F, T, F, F, T, F, F, F, F, F, F, F, F, F,
            T, F, F, T, F, F, T, F, F, F, F, F, F, F, F, F,
        ]
    },
];

export default TEMPLATES;
