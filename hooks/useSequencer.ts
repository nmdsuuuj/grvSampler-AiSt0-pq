
import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, PlaybackParams, Sample } from '../types';
import { STEPS_PER_PART, GROOVE_PATTERNS, TOTAL_BANKS, PADS_PER_BANK } from '../constants';

interface TrackState {
    nextStepTime: number;
    partStep: number;
    currentPart: 'A' | 'B';
    partRepetition: number;
}

export const useSequencer = (playSample: (sampleId: number, time: number, params: Partial<PlaybackParams>) => void) => {
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
        // The reducer handles resetting currentSteps now when isPlaying becomes false
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
            const { patterns, activePatternIds, grooveDepth, activeGrooveId, bpm, activeSampleBank, samples } = sequencerStateRef.current;
            if(!audioContext) return;

            while (true) {
                let earliestTime = Infinity;
                let nextTrackIndex = -1;

                for (let i = 0; i < TOTAL_BANKS; i++) {
                    if (trackStates.current[i].nextStepTime < earliestTime) {
                        earliestTime = trackStates.current[i].nextStepTime;
                        nextTrackIndex = i;
                    }
                }
                
                if (earliestTime > audioContext.currentTime + scheduleAheadTime) {
                    break;
                }
                
                const trackState = trackStates.current[nextTrackIndex];
                const patternId = activePatternIds[nextTrackIndex];
                const pattern = patterns[patternId];
                if (!pattern) continue;

                const isPartA = trackState.currentPart === 'A';
                const displayStep = isPartA ? trackState.partStep : trackState.partStep + STEPS_PER_PART;

                const firstSampleInBank = nextTrackIndex * PADS_PER_BANK;
                const lastSampleInBank = firstSampleInBank + PADS_PER_BANK;
                for (let sampleId = firstSampleInBank; sampleId < lastSampleInBank; sampleId++) {
                    const stepInfo = pattern.steps[sampleId]?.[displayStep];
                    if (stepInfo?.active) {
                        const sample = samples[sampleId];
                        const paramLocks = pattern.paramLocks[sampleId];

                        const playbackParams: Partial<PlaybackParams> = {
                            detune: stepInfo.detune, // Correct: detune is stored directly on the step
                            velocity: stepInfo.velocity, // Correct: velocity is stored directly on the step
                            volume: paramLocks?.volume?.[displayStep] ?? sample.volume,
                            pitch: paramLocks?.pitch?.[displayStep] ?? sample.pitch,
                            start: paramLocks?.start?.[displayStep] ?? sample.start,
                            decay: paramLocks?.decay?.[displayStep] ?? sample.decay,
                            lpFreq: paramLocks?.lpFreq?.[displayStep] ?? sample.lpFreq,
                            hpFreq: paramLocks?.hpFreq?.[displayStep] ?? sample.hpFreq,
                        };
                        
                        const stepResolution = isPartA ? pattern.stepResolutionA : pattern.stepResolutionB;
                        const stepDurationForGroove = 60.0 / bpm / (stepResolution / 4);
                        const groovePattern = GROOVE_PATTERNS[activeGrooveId];
                        const grooveOffsetIndex = displayStep % STEPS_PER_PART;
                        const offsetFraction = groovePattern.offsets[grooveOffsetIndex] || 0;
                        const timeShift = stepDurationForGroove * offsetFraction * grooveDepth;
                        const scheduledTime = trackState.nextStepTime + timeShift;
                        
                        playSample(sampleId, scheduledTime, playbackParams);
                    }
                }
                
                // Dispatch current step for every bank to enable multi-bank recording
                dispatch({ type: ActionType.SET_CURRENT_STEP, payload: { bankIndex: nextTrackIndex, step: displayStep } });

                if (nextTrackIndex === activeSampleBank) {
                    // This part is for the loop meter UI, which only needs the active bank's state.
                    dispatch({ 
                        type: ActionType.SET_PLAYBACK_TRACK_STATE, 
                        payload: { 
                            bankIndex: nextTrackIndex, 
                            state: { 
                                currentPart: trackState.currentPart, 
                                partRepetition: trackState.partRepetition 
                            } 
                        } 
                    });
                }

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