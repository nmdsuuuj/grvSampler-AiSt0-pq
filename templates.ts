
export interface Template {
    name: string;
    category: string;
    // For single-track templates
    steps?: boolean[];
    // For multi-track drum templates (Bank A, pads 0-7)
    sequences?: { [key: number]: boolean[] };
}

const T = true;
const F = false;

// All patterns are 32 steps long
const TEMPLATES: Template[] = [
    // --- Drum Patterns (Bank A) ---
    {
        name: 'Classic Techno',
        category: 'Drum Patterns (Bank A)',
        sequences: {
            0: [T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F], // Kick
            1: [F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F], // Snare
            2: [F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F], // Closed Hat
            3: [F,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, F,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F], // Open Hat
        }
    },
    {
        name: 'Classic House',
        category: 'Drum Patterns (Bank A)',
        sequences: {
            0: [T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F, T,F,F,F], // Kick
            1: [F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,T, F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F], // Snare/Clap
            2: [F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F, F,F,T,F], // Closed Hat
            3: [F,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, F,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F], // Open Hat
        }
    },
    {
        name: 'Classic Hip-Hop',
        category: 'Drum Patterns (Bank A)',
        sequences: {
            0: [T,F,F,T, F,F,F,F, T,F,F,F, T,F,F,F, T,F,F,T, F,F,F,F, T,F,F,F, F,F,F,F], // Kick
            1: [F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F, F,F,F,F, T,F,F,F], // Snare
            2: [T,T,T,T, T,T,T,T, T,T,T,T, T,T,T,T, T,T,T,T, T,T,T,T, T,T,T,T, T,T,T,T], // Hi-Hat
        }
    },
    
    // --- Drums (General) ---
    {
        name: 'Four On The Floor',
        category: 'Drums (General)',
        steps: [ T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, ]
    },
    {
        name: 'Backbeat (Snare)',
        category: 'Drums (General)',
        steps: [ F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, ]
    },
    {
        name: 'Rock Beat (Kick)',
        category: 'Drums (General)',
        steps: [ T, F, F, F, F, F, F, F, T, T, F, F, F, F, F, F, T, F, F, F, F, F, F, F, T, T, F, F, F, F, F, F, ]
    },
    {
        name: 'Offbeat Hats',
        category: 'Drums (General)',
        steps: [ F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F, ]
    },
    {
        name: '16th Hats',
        category: 'Drums (General)',
        steps: [ T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, ]
    },
    
    // --- Techno/House ---
    {
        name: 'Classic House Kick',
        category: 'Techno/House',
        steps: [ T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F, T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F, ]
    },
    {
        name: 'Minimal Syncopation',
        category: 'Techno/House',
        steps: [ T, F, F, F, F, T, F, F, T, F, F, F, T, F, F, T, T, F, F, F, F, T, F, F, T, F, F, F, T, F, F, T, ]
    },
    {
        name: 'Rolling Bass',
        category: 'Techno/House',
        steps: [ T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, T, F, ]
    },
    {
        name: 'Tom Groove',
        category: 'Techno/House',
        steps: [ F, F, F, F, F, F, T, F, F, F, T, F, T, F, F, F, F, F, F, F, F, F, T, F, F, F, T, F, T, F, F, F, ]
    },

    // --- Hip-Hop/Funk ---
    {
        name: 'Boom Bap Kick',
        category: 'Hip-Hop/Funk',
        steps: [ T, F, F, F, F, F, F, T, T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, T, T, F, F, F, F, F, F, F, ]
    },
    {
        name: 'Boom Bap Snare',
        category: 'Hip-Hop/Funk',
        steps: [ F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, F, T, F, F, F, ]
    },
    {
        name: 'Trap Hats (Simple)',
        category: 'Hip-Hop/Funk',
        steps: [ F, F, T, F, F, F, T, F, F, F, T, F, F, T, T, T, F, F, T, F, F, F, T, F, F, F, T, F, F, T, T, F, ]
    },
    {
        name: 'Funky Drummer Kick',
        category: 'Hip-Hop/Funk',
        steps: [ T, F, F, T, F, F, T, F, F, F, T, F, T, F, F, F, T, F, F, T, F, F, T, F, F, F, T, F, T, F, F, F, ]
    },

    // --- Latin/World ---
    {
        name: 'Bossa Nova Kick',
        category: 'Latin/World',
        steps: [ T, F, F, T, F, F, T, F, T, F, T, F, T, F, F, F, T, F, F, T, F, F, T, F, T, F, T, F, T, F, F, F, ]
    },
    {
        name: 'Son Clave 3-2',
        category: 'Latin/World',
        steps: [ T, F, F, T, F, F, T, F, F, F, F, F, T, F, T, F, T, F, F, T, F, F, T, F, F, F, F, F, T, F, T, F, ]
    },
    {
        name: 'Rumba Clave 3-2',
        category: 'Latin/World',
        steps: [ T, F, F, T, F, F, F, T, F, F, F, F, T, F, T, F, T, F, F, T, F, F, F, T, F, F, F, F, T, F, T, F, ]
    },
    {
        name: 'Afrobeat Kick',
        category: 'Latin/World',
        steps: [ T, F, T, F, T, F, T, T, F, T, T, F, T, F, F, F, T, F, T, F, T, F, T, T, F, T, T, F, T, F, F, F, ]
    },

    // --- Melodic & Bass ---
    {
        name: 'Simple Arp Up',
        category: 'Melodic & Bass',
        steps: [ T, F, F, F, F, T, F, F, F, F, T, F, F, F, F, T, T, F, F, F, F, T, F, F, F, F, T, F, F, F, F, T, ]
    },
    {
        name: 'Arp Up/Down',
        category: 'Melodic & Bass',
        steps: [ T, F, F, F, F, T, F, F, F, F, T, F, F, T, F, F, F, F, T, F, F, F, F, F, T, F, F, F, F, F, F, F, ]
    },
    {
        name: 'Acid Bassline',
        category: 'Melodic & Bass',
        steps: [ T, F, F, T, F, T, F, F, T, F, F, T, F, T, F, F, T, F, F, T, F, T, F, F, T, F, F, F, F, T, F, F, ]
    },
    {
        name: 'Walking Bass',
        category: 'Melodic & Bass',
        steps: [ T, F, F, T, F, F, T, F, T, F, F, T, F, F, T, F, T, F, F, T, F, F, T, F, T, F, F, T, F, F, T, F, ]
    },
];

export default TEMPLATES;
