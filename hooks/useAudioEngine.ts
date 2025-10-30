import { useContext, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';

export const useAudioEngine = () => {
    const { state, dispatch } = useContext(AppContext);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // A ref to hold the latest state, preventing callbacks from becoming stale or causing re-renders.
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const playSample = useCallback((sampleId: number, time: number) => {
        // Read the latest state from the ref to ensure all parameters are current.
        const { audioContext, samples } = stateRef.current;
        if (!audioContext) return;
        const sample = samples[sampleId];
        if (!sample.buffer) return;

        const source = audioContext.createBufferSource();
        source.buffer = sample.buffer;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = sample.volume;

        source.playbackRate.value = Math.pow(2, sample.pitch / 12);

        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const offset = sample.start * sample.buffer.duration;
        const duration = (sample.buffer.duration - offset) * sample.decay;
        
        source.start(time, offset, duration);
    }, []); // Empty dependency array makes this function's reference stable.

    const startRecording = useCallback(async () => {
        const { isRecording, audioContext } = stateRef.current;
        if (isRecording || !audioContext) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            dispatch({ type: ActionType.START_RECORDING });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = event => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                // Re-read from ref to get the latest context and active sample ID.
                const currentCtx = stateRef.current.audioContext;
                const currentActiveSampleId = stateRef.current.activeSampleId;
                
                if (currentCtx) {
                    const decodedBuffer = await currentCtx.decodeAudioData(arrayBuffer);
                    
                    // Normalize the audio buffer
                    let peak = 0;
                    for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                        const channelData = decodedBuffer.getChannelData(i);
                        for (let j = 0; j < channelData.length; j++) {
                            const amp = Math.abs(channelData[j]);
                            if (amp > peak) {
                                peak = amp;
                            }
                        }
                    }
                    
                    let finalBuffer = decodedBuffer;
                    if (peak > 0) {
                        const gain = 1 / peak;
                        const newBuffer = currentCtx.createBuffer(
                            decodedBuffer.numberOfChannels,
                            decodedBuffer.length,
                            decodedBuffer.sampleRate
                        );
                    
                        for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                            const oldChannelData = decodedBuffer.getChannelData(i);
                            const newChannelData = newBuffer.getChannelData(i);
                            for (let j = 0; j < oldChannelData.length; j++) {
                                newChannelData[j] = oldChannelData[j] * gain;
                            }
                        }
                        finalBuffer = newBuffer;
                    }
                    
                    dispatch({ type: ActionType.LOAD_SAMPLE, payload: { sampleId: currentActiveSampleId, buffer: finalBuffer }});
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
        } catch (err) {
            console.error("Error starting recording:", err);
            dispatch({ type: ActionType.STOP_RECORDING });
        }
    }, [dispatch]); // Depends only on the stable dispatch function.

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            dispatch({ type: ActionType.STOP_RECORDING });
        }
    }, [dispatch]); // Depends only on the stable dispatch function.

    return { playSample, startRecording, stopRecording };
};
