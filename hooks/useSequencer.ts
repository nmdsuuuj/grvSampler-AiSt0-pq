import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';
import { STEPS_PER_PART, GROOVE_PATTERNS, TOTAL_BANKS, PADS_PER_BANK } from '../constants';

interface TrackState {
    nextStepTime: number;
    partStep: number;
    currentPart: 'A' | 'B';
    partRepetition: number;
}

export const useSequencer = (playSample: (sampleId: number, time: number) => void) => {
    const { state, dispatch } = useContext(AppContext);
    const { isPlaying, audioContext } = state;

    const sequencerStateRef = useRef({ ...state });
    useEffect(() => {
        sequencerStateRef.current = state;
    }, [state]);

    const trackStates = useRef<TrackState[]>([]);
    
    const timerRef = useRef<number | null>(null);
    const lookahead = 25.0; // ms
    const scheduleAheadTime = 0.1; // sec

    const resetSequence = () => {
        trackStates.current = Array.from({ length: TOTAL_BANKS }, () => ({
            nextStepTime: 0,
            partStep: 0,
            currentPart: 'A',
            partRepetition: 0,
        }));
        dispatch({ type: ActionType.SET_CURRENT_STEP, payload: -1 });
    };
    
    // Initialize track states
    useEffect(() => {
        resetSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    useEffect(() => {
        if (!isPlaying || !audioContext) {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
            resetSequence();
            return;
        }

        const now = audioContext.currentTime;
        trackStates.current.forEach(track => {
            track.nextStepTime = now;
            track.partStep = 0;
            track.currentPart = 'A';
            track.partRepetition = 0;
        });

        const scheduler = () => {
            const { patterns, activePatternIds, grooveDepth, activeGrooveId, bpm, activeSampleBank } = sequencerStateRef.current;
            if(!audioContext) return;

            // This loop ensures we keep scheduling events as long as there are events within the lookahead window.
            while (true) {
                let earliestTime = Infinity;
                let nextTrackIndex = -1;

                // Find which of the 4 tracks has the next event due.
                for (let i = 0; i < TOTAL_BANKS; i++) {
                    if (trackStates.current[i].nextStepTime < earliestTime) {
                        earliestTime = trackStates.current[i].nextStepTime;
                        nextTrackIndex = i;
                    }
                }
                
                // If the next event is outside our scheduling window, stop for now.
                if (earliestTime > audioContext.currentTime + scheduleAheadTime) {
                    break;
                }
                
                // --- Schedule the next event for the determined track ---
                const trackState = trackStates.current[nextTrackIndex];
                const patternId = activePatternIds[nextTrackIndex];
                const pattern = patterns[patternId];
                if (!pattern) continue;

                const isPartA = trackState.currentPart === 'A';
                const displayStep = isPartA ? trackState.partStep : trackState.partStep + STEPS_PER_PART;

                // Schedule samples for this track's step
                const firstSampleInBank = nextTrackIndex * PADS_PER_BANK;
                const lastSampleInBank = firstSampleInBank + PADS_PER_BANK;
                for (let sampleId = firstSampleInBank; sampleId < lastSampleInBank; sampleId++) {
                    if (pattern.steps[sampleId]?.[displayStep]) {
                        const stepResolution = isPartA ? pattern.stepResolutionA : pattern.stepResolutionB;
                        const stepDurationForGroove = 60.0 / bpm / (stepResolution / 4);
                        const groovePattern = GROOVE_PATTERNS[activeGrooveId];
                        const grooveOffsetIndex = displayStep % STEPS_PER_PART;
                        const offsetFraction = groovePattern.offsets[grooveOffsetIndex] || 0;
                        const timeShift = stepDurationForGroove * offsetFraction * grooveDepth;
                        const scheduledTime = trackState.nextStepTime + timeShift;
                        playSample(sampleId, scheduledTime);
                    }
                }
                
                // Update UI playhead based on the active bank's progress
                if (nextTrackIndex === activeSampleBank) {
                    dispatch({ type: ActionType.SET_CURRENT_STEP, payload: displayStep });
                }

                // --- Advance this track's state to its next event time ---
                const stepResolution = isPartA ? pattern.stepResolutionA : pattern.stepResolutionB;
                const stepDuration = 60.0 / bpm / (stepResolution / 4);
                trackState.nextStepTime += stepDuration;
                trackState.partStep++;

                const stepLength = isPartA ? pattern.stepLengthA : pattern.stepLengthB;
                if (trackState.partStep >= stepLength) {
                    trackState.partStep = 0;
                    trackState.partRepetition++;
                    
                    const loopCount = isPartA ? pattern.loopCountA : pattern.loopCountB;
                    if (trackState.partRepetition >= loopCount) {
                        trackState.currentPart = isPartA ? 'B' : 'A';
                        trackState.partRepetition = 0;
                    }
                }
            }
        };

        timerRef.current = window.setInterval(scheduler, lookahead);

        return () => {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
            }
        };

    }, [isPlaying, audioContext, dispatch, playSample]);
};
