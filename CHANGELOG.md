# Groove Sampler - Changelog

This document tracks the major changes, feature implementations, and requirement adjustments throughout the development of the Groove Sampler application.

## Known Issues

- **Pattern Copy/Paste**: The functionality to copy and paste a pattern between different banks (e.g., from Bank A to Bank B) is currently unreliable. While pattern parameters like length and division may be copied, the core step sequence data (note triggers, pitch, velocity) is often lost in the process. This is a high-priority bug that will be addressed in a future refactoring of the state management for patterns.

## Version 0.6.0 - MIDI Control & Template System

This major update introduces a comprehensive MIDI Learn system with advanced mapping capabilities, template management, and live performance features.

### Implemented Features

- **MIDI Learn Functionality**:
  - **Complete Re-implementation**: Fully rebuilt the MIDI Learn system with proper state management and reliable MIDI CC mapping.
  - **Multi-Parameter Mapping**: A single MIDI CC can now control multiple parameters simultaneously. For example, one CC can control all volume faders in a bank, or multiple different parameters across different samples.
  - **Visual Feedback**: Fader components now display MIDI mapping status with color-coded "M" buttons:
    - Gray: Not mapped
    - Blue: Single parameter mapped
    - Purple: Multiple parameters mapped to the same CC
    - Yellow (pulsing): Currently in MIDI Learn mode
  - **Parameter Removal**: Individual parameters can be removed from a multi-parameter mapping without affecting other parameters on the same CC.

- **BANK-Wide MIDI Assignment Mode**:
  - **Toggle Mode**: Added a "BANK単位一括アサイン" (Bank-Wide Assignment) toggle in the MIDI Template Manager.
  - **Automatic Multi-Pad Assignment**: When enabled, assigning a MIDI CC to any parameter on one pad automatically assigns the same CC to the same parameter on all 8 pads in that bank.
  - **Use Case**: Dramatically speeds up MIDI setup for banks where all pads should respond to the same control (e.g., all volume faders, all filter frequencies).

- **MIDI Mapping Templates**:
  - **Template System**: Users can save their current MIDI mappings as named templates for quick recall.
  - **Template Management UI**: New MIDI Template Manager component provides:
    - Save current mappings with custom names
    - Load saved templates
    - Delete templates
    - View mapping information (CC numbers and parameter counts)
  - **Template Persistence**: Templates are saved in application state and persist across sessions (when project is saved).

- **Live Template Switching**:
  - **MIDI CC Assignment for Templates**: Each template can have a dedicated MIDI CC assigned for instant switching during live performance.
  - **Separate Management**: Template switch CC mappings are managed separately from parameter mappings, preventing conflicts.
  - **Instant Switching**: When a template switch CC is triggered (value > 0.5), the corresponding template is loaded immediately, allowing seamless transitions between different MIDI control setups during performance.
  - **Visual Indicators**: Templates with assigned switch CCs are displayed in purple, showing the CC number.

- **Supported Parameters**:
  - Sample parameters: Volume, Pitch, Start, Decay, Low-Pass Frequency, High-Pass Frequency
  - Bank parameters: Volume, Pan
  - Master parameters: Master Volume
  - Compressor parameters: Threshold, Ratio, Knee, Attack, Release

### Technical Implementation

- **State Management**: 
  - Extended `AppState` with `midiMappings`, `midiMappingTemplates`, `bankWideMidiLearn`, and `templateSwitchMappings`.
  - Implemented new action types for MIDI mapping operations.
- **MIDI Message Processing**:
  - Template switch CCs are checked first (before learn mode and parameter control).
  - MIDI Learn mode supports both single-parameter and bank-wide multi-parameter assignment.
  - Parameter control applies to all parameters mapped to the same CC simultaneously.
- **UI Components**:
  - Enhanced `Fader` component with MIDI Learn buttons and status indicators.
  - New `MidiTemplateManager` component for template management and bank-wide mode toggle.
  - Integrated template manager into main App component.

### Use Cases

1. **Live Performance Setup**: 
   - Create multiple templates for different songs or sections.
   - Assign template switch CCs to physical buttons on MIDI controller.
   - Switch between templates instantly during performance without touching the computer.

2. **Efficient Bank Control**:
   - Enable bank-wide mode.
   - Assign one CC to control all volume faders in a bank simultaneously.
   - Perfect for mixing or live performance where all pads in a bank need unified control.

3. **Complex Multi-Parameter Control**:
   - Map one CC to control multiple different parameters (e.g., CC1 controls Bank A volume, Sample 0 pitch, and Master volume simultaneously).
   - Create rich, expressive control setups with limited physical controllers.

## Version 0.5.0 - The Microtonal & World Scale Update

This major update transforms the Groove Sampler from a standard 12-tone sequencer into a unique and powerful tool for exploring and composing with world music scales.

### Implemented Features
- **Microtonal Engine Implementation**:
  - **Core Change**: Re-engineered the core audio and sequencer engine to use a **cents-based `detune` system** instead of MIDI note numbers. This allows for the authentic reproduction of scales that do not conform to 12-tone equal temperament.
- **Massively Expanded Scale Database**:
  - Added over 40 authentic world music scales to the database, defined with their proper microtonal intervals in cents.
  - Includes a wide variety of scales from Arabic (Maqamat), Indian (Ragas), Indonesian (Pelog/Slendro), Japanese, African, and ancient Greek traditions.
- **New "Dynamic Keyboard" UI**:
  - Replaced the static piano keyboard in `REC` mode with a dynamic UI that **only displays the notes of the selected scale**. This eliminates "unused" keys and provides a highly intuitive way to compose within a specific scale.
- **Non-Destructive Playback Scale Remapping**:
  - Introduced a powerful new **"Playback Scale"** feature in `PART` mode.
  - This allows users to apply a different scale to an *entire existing pattern* during playback without altering the original recorded notes.
  - The sequencer remaps the notes to the closest tones in the selected playback scale in real-time. Setting the scale to `"Thru"` instantly reverts to the original performance.
- **Critical Bug Fixes**:
  - Resolved a persistent bug where the keyboard UI would render incorrectly (e.g., as thin lines), especially for scales with fewer or more than 12 notes. The new dynamic keyboard with a flexbox layout completely solves this issue.
  - Fixed a logic error in the sequencer that prevented microtonal parameter locks from being played back correctly.

---

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