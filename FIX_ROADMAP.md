
# Emergency Fix Roadmap (Post-Restore)

This roadmap focuses strictly on stabilizing the application after restoring to the "Effects Introduction" state. No new features will be added.

## Phase 1: Stability & Safety (Current Step)
- [x] **Fix Non-Finite Value Errors:** Implement robust type checking and safety wrappers (`safe()` and `setTarget()`) for all Web Audio API calls. This prevents the "Failed to execute 'setTargetAtTime'" crash.
- [x] **Secure Calculations:** Ensure frequency, delay time, and gain calculations never result in `NaN` or `Infinity`.

## Phase 2: Synth Audio Restoration
- [ ] **Verify Signal Flow:** Ensure the Synth VCA connects correctly through the new Bank Gain -> FX Chain -> Master path.
- [ ] **Fix Envelope Triggers:** Ensure the VCA and Filter Envelopes are receiving valid start times and values.
- [ ] **Verify Mute/Solo Logic:** Ensure the synth bank isn't accidentally muted by the new mixer logic.

## Phase 3: Effector Functionality
- [ ] **Fix Parameter Mapping:** Ensure UI sliders in the Mixer view correctly map to the underlying audio nodes without error.
- [ ] **Verify Bypass Logic:** Ensure effects pass audio cleanly when bypassed or when "Dry" mix is 100%.
