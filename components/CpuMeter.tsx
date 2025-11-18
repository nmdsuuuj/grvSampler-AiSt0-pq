import React, { useState, useEffect, useContext, useRef } from 'react';
import { AppContext } from '../context/AppContext';

const CpuMeter: React.FC = () => {
    // Fix: Correctly destructure `audioContext` from the `state` object provided by the context.
    const { state } = useContext(AppContext);
    const { audioContext } = state;
    const [cpuLoad, setCpuLoad] = useState(0);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!audioContext || processorRef.current) return;

        // ScriptProcessorNode is deprecated but is the simplest way to get a recurring callback
        // in the audio thread for this kind of monitoring without a full AudioWorklet.
        const bufferSize = 4096;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        let lastPlaybackTime = audioContext.currentTime;
        let smoothedLoad = 0;

        processor.onaudioprocess = (e) => {
            const now = e.playbackTime;
            const elapsedTime = now - lastPlaybackTime;
            const expectedTime = e.inputBuffer.duration;
            
            // Calculate jitter: the difference between expected time and actual elapsed time.
            // A positive jitter means the audio thread is lagging.
            const jitter = elapsedTime - expectedTime;
            const load = Math.max(0, (jitter / expectedTime) * 100);

            // Smooth the value to make it more readable
            smoothedLoad = smoothedLoad * 0.9 + load * 0.1;
            lastPlaybackTime = now;
        };

        // Connect to the graph to start processing. It doesn't need to process any audio.
        processor.connect(audioContext.destination);
        processorRef.current = processor;

        const updateDisplay = () => {
            setCpuLoad(smoothedLoad);
            animationFrameRef.current = requestAnimationFrame(updateDisplay);
        };
        animationFrameRef.current = requestAnimationFrame(updateDisplay);

        return () => {
            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };

    }, [audioContext]);

    const loadPercent = Math.min(100, cpuLoad).toFixed(0);
    const barColor = cpuLoad > 80 ? 'bg-rose-500' : cpuLoad > 50 ? 'bg-yellow-400' : 'bg-emerald-400';

    return (
        <div className="flex items-center space-x-2 w-full justify-center">
            <span className="text-xs font-bold text-slate-500">CPU</span>
            <div className="w-12 h-4 bg-emerald-100 rounded-sm overflow-hidden border border-emerald-200">
                <div className={`h-full ${barColor} transition-all duration-100`} style={{ width: `${loadPercent}%` }} />
            </div>
            <span className="text-xs font-mono text-slate-500 w-8 text-right">{loadPercent}%</span>
        </div>
    );
};

export default CpuMeter;