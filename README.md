# Groove Sampler

An advanced sampler and sequencer for mobile browsers, featuring a powerful groove engine for creating unique rhythms. Record sounds, arrange patterns, and manipulate your beats with detailed controls, including support for microtonal world music scales.

## Key Features

-   **4 Banks & 32 Pads**: Organize your sounds across four banks, each with eight sample pads.
-   **32-Step Sequencer**: Create complex rhythms with a 32-step sequencer featuring A/B parts with independent lengths, resolutions, and loop counts.
-   **Per-Bank Groove Engine**: Apply unique groove templates and depths to each of the four banks independently, allowing for complex polyrhythms. The groove settings are saved with each pattern.
-   **Smart Copy & Paste**: A context-aware copy/paste system that understands your workflow. The scope automatically switches between Lane, Bank, and Pattern based on your actions, minimizing clicks.
-   **Microtonal Engine & World Scales**: Go beyond 12-tone music with a cents-based pitch engine and a huge library of authentic world scales (Maqamat, Ragas, Gamelan, and more).
-   **Comprehensive PC Keyboard Control**: Control the entire application with your computer keyboard. Play pads, perform melodies with a scale-aware keyboard, change octaves, keys, and scales, and access UI functions on the fly.
-   **Sampling & Drum Kits**: Record your own sounds directly through the microphone, or load pre-made classic drum machine kits.
-   **Channel Mixer & Master FX**: Mix your four banks with dedicated volume faders, pan controls, and Mute/Solo buttons. A master compressor and safety clipper are included on the master channel to add punch and prevent clipping.
-   **Project Saving**: Save and load your entire projects, including all samples, patterns, and settings.

### Copy & Paste Scope Definitions

The copy/paste functionality operates on three distinct scopes:

-   **Lane**: Copies only the sequence data (steps and parameter locks) for the currently selected single sample pad.
-   **Bank**: Copies the sequence data for all 8 pads within the currently selected bank, plus that bank's specific Groove settings.
-   **Pattern**: Copies the entire state of the current pattern, which includes the sequence data for all 32 pads across all 4 banks, and the groove settings for all 4 banks.

The scope selector automatically switches to **Bank** when you change banks and to **Lane** when you select a different pad within the same bank, anticipating your needs.

## Current Status

This is an actively developed project. For a list of current features and known issues (such as the **Load Kit** and **Pattern Copy/Paste** functionality), please see the [CHANGELOG.md](./CHANGELOG.md) file.

## PC Keyboard Shortcuts

For a detailed list of all available keyboard shortcuts, please see the [KEYBOARD_SHORTCUTS.md](./KEYBOARD_SHORTCUTS.md) file.

## Build for Android

To resolve mobile browser issues (like screen scrolling on fader use), you can package this web app into a native Android APK. For instructions, please see the [BUILD_GUIDE.md](./BUILD_GUIDE.md) file.
