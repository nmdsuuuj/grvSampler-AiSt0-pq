# Groove Sampler - Changelog

This document tracks the major changes, feature implementations, and requirement adjustments throughout the development of the Groove Sampler application.

## Version 0.4.0 (Current) - Mobile UX & Fader Overhaul

### Implemented Features & Fixes
- **Mobile-First Fader Interaction**:
  - **FIX**: Re-engineered the fader double-tap functionality to work reliably on both desktop (double-click) and mobile (double-tap). The previous implementation was not compatible with touch events.
  - **UX**: Further increased the size of fader tracks and thumbs to improve touch accuracy on mobile devices, addressing jerky input issues.
- **Project Documentation**:
  - Added this `CHANGELOG.md` file to track project progress and specification changes as requested.

---

## Version 0.3.0 - Advanced Features & UI Refinement

### Implemented Features
- **Master Dynamics FX**: Added a master compressor/dynamics processor on the master channel with a dedicated "FX" view in the Mixer tab for detailed parameter control.
- **Sample Filters**: Implemented per-sample High-Pass (HP) and Low-Pass (LP) filters.
- **Sample View UI Overhaul**:
  - Introduced a "Sampling Mode" and "Parameter Mode" to show context-relevant controls.
  - Redesigned the layout to be more compact, moving the sample name display and organizing buttons into a single row.
- **Recording Workflow Improvements**:
  - **FIX**: Implemented automatic normalization for recorded samples to ensure optimal volume levels.
  - **FIX**: Improved the recording threshold sensitivity by adjusting the default value and fader curve to prevent recording delays.
- **Fader Performance**:
  - **FIX**: Optimized all `Fader` components using `requestAnimationFrame` to ensure smooth UI updates and eliminate stuttering/jank.

---

## Version 0.2.0 - BPM & UI Polish

### Implemented Features
- **Advanced BPM Control**:
  - Implemented a TAP tempo button.
  - Added a long-press feature on the TAP button to switch between Fader, Ratio, and Numeric input modes.
  - Expanded the Ratio mode with more multiplier options (e.g., x1.25, x1.5, x2).
- **UI/UX Enhancements**:
  - Redesigned the Transport area to integrate the BPM display into the TAP button, saving space.
  - Color-coded the `ARM` button in Sample View to be red, and adjusted other button colors for better visual hierarchy.
  - Redesigned all faders to be thicker and display their label/value information internally for a cleaner look.
  - Color-coded UI elements to distinguish between "Sample" related controls (pastel blue) and "Sequence/Pattern" related controls (pink).
  - Changed Sequencer Part B step color to be pink-based for better consistency with Part A.

---

## Version 0.1.0 - Core Functionality

### Implemented Features
- **Sequencer & Recorder Sync**: The master recorder is now armed first, and recording starts in sync with the sequencer's play button.
- **File Naming Convention**: Recorded master audio files are now named with a timestamp and the current BPM (e.g., `GrvSmp_YYMMDD_HHMMSS_B120.wav`).
- **Core Engine**:
  - Established the base audio engine with sample playback.
  - Implemented the step sequencer with a groove engine.
  - Set up basic project saving/loading functionality.
