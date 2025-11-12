# Project Roadmap

This document outlines the future development plan for the Groove Sampler. While the current version focuses on a powerful sequencing and groove engine, the next phase aims to elevate it into a complete beat-making station by adding dedicated mixing, mastering, and final export capabilities.

## Phase 2: The Mixing & Mastering Update

### 1. Mixer Tab & Functionality

#### **Overview**
A new "MIXER" tab will be introduced to provide intuitive, professional-style control over the four independent sequencer tracks (sample banks).

#### **UI/UX**
*   **New "MIXER" Tab:** Will be added as a fifth primary tab alongside "SEQ", "SAMPLE", "GROOVE", and "PROJECT".
*   **Channel Strips:**
    *   Four vertical channel strips, one for each sample bank (A, B, C, D).
    *   Each strip will feature:
        *   **Volume Fader:** For intuitive control over each bank's level.
        *   **Pan Knob:** To position each bank in the stereo field.
        *   **MUTE Button:** To temporarily silence a specific bank.
        *   **SOLO Button:** To listen to a single bank in isolation.
*   **Master Channel:**
    *   A final master channel strip on the right, where all bank signals are summed.
    *   It will include a master volume fader to control the final output level.

#### **Technical Implementation**
*   A `GainNode` will be added to each bank's audio chain to control volume.
*   A `StereoPannerNode` will be added for panning.
*   The global state will be updated to manage each bank's `volume`, `pan`, `isMuted`, and `isSoloed` status.

### 2. Master Effects: Limiter / Clipper

#### **Overview**
A master effect unit will be added to the final output stage to prevent clipping and increase the overall loudness and punch of the mix.

#### **UI/UX**
*   A "MASTER FX" section will be located on the Master Channel Strip within the new MIXER tab.
*   Controls will include:
    *   **FX ON/OFF Switch:** To bypass or engage the master effect.
    *   **TYPE Selector:** To choose between "Limiter" (for clean peak prevention) and "Clipper" (for a slightly more saturated, aggressive sound).
    *   **AMOUNT Knob:** To control the intensity of the effect (e.g., threshold for the limiter, drive for the clipper).

#### **Technical Implementation**
*   **Limiter:** Will be implemented using the Web Audio API's `DynamicsCompressorNode`, configured with a very high ratio (e.g., 20:1) and a low threshold.
*   **Clipper:** Will be implemented using a `WaveShaperNode` with a custom curve to apply soft or hard clipping to the signal.
*   This effect node will be the last in the audio chain before the `audioContext.destination`.

### 3. Master Recorder

#### **Overview**
A function to record the final, mixed-down audio output (all banks + master effects) into a single, high-quality audio file for sharing or further editing.

#### **UI/UX**
*   A master "REC" button will be placed in a prominent location, either on the master channel strip or in the main transport header.
*   Clear visual feedback (e.g., a blinking red light) will indicate that recording is in progress.
*   Upon stopping the recording, a file download prompt will automatically appear for a `.wav` file, named with the project name and a timestamp.

#### **Technical Implementation**
*   The final audio signal (post-master effects) will be routed to a `MediaStreamAudioDestinationNode` in parallel with the `audioContext.destination`.
*   This `MediaStream` will be fed into the `MediaRecorder` API to capture the output.
*   The recorded Blob data will be packaged into a WAV file format and offered to the user for download.
