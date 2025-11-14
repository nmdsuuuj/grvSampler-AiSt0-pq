
import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, PlaybackParams } from '../types';
import SCALES from '../scales';


interface KeyboardInputProps {
    playSample: (id: number, time: number, params?: Partial<PlaybackParams>) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];


const KeyboardInput: React.FC<KeyboardInputProps> = ({ playSample }) => {
    const { state, dispatch } = useContext(AppContext);
    const { activeKey, activeScale, activeSampleId, isPlaying, currentSteps, activePatternIds, activeSampleBank } = state;
    const [octave, setOctave] = useState(4); // Middle C octave

    const activePatternId = activePatternIds[activeSampleBank];
    const currentStep = currentSteps[activeSampleBank];

    const handleNotePlay = (detune: number) => {
        const detuneWithOctave = detune + ((octave - 4) * 1200);
        
        // Play sample for immediate feedback
        playSample(activeSampleId, 0, { detune: detuneWithOctave });

        // If recording, dispatch action to update pattern
        if (isPlaying && currentStep >= 0) {
            dispatch({
                type: ActionType.RECORD_STEP,
                payload: {
                    patternId: activePatternId,
                    sampleId: activeSampleId,
                    step: currentStep,
                    detune: detuneWithOctave,
                }
            });
        }
    };

    const scaleNotes = useMemo(() => {
        const scale = SCALES.find(s => s.name === activeScale);
        if (!scale) return [];
        
        const notes = [];
        let cumulativeCents = 0;
        for (const interval of scale.intervals) {
            notes.push(cumulativeCents);
            cumulativeCents += interval;
        }
        return notes;
    }, [activeScale]);

    const formatNoteName = (cents: number): { name: string, offset: number } => {
        const totalCentsFromC = (activeKey * 100) + cents;
        const midiNote = Math.round(totalCentsFromC / 100);
        const nearestCents = midiNote * 100;
        const offset = Math.round(totalCentsFromC - nearestCents);
        const noteName = NOTE_NAMES[(midiNote % 12 + 12) % 12];
        return { name: noteName, offset };
    };


    return (
        <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg flex flex-col justify-between items-center space-y-2 min-h-[150px]">
            <div className="w-full flex justify-between items-center">
                 <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => setOctave(o => Math.max(0, o - 1))}
                        className="px-3 py-1 bg-emerald-200 text-emerald-800 font-bold rounded-md"
                    >
                        &lt;
                    </button>
                    <span className="font-bold text-lg text-slate-700 w-4 text-center">{octave}</span>
                    <button 
                        onClick={() => setOctave(o => Math.min(8, o + 1))}
                        className="px-3 py-1 bg-emerald-200 text-emerald-800 font-bold rounded-md"
                    >
                        &gt;
                    </button>
                </div>

                <div className="flex items-center space-x-1">
                     <select 
                        value={activeKey} 
                        onChange={(e) => dispatch({ type: ActionType.SET_KEY, payload: parseInt(e.target.value)})}
                        className="bg-emerald-200 text-emerald-800 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400"
                    >
                        {NOTE_NAMES.map((name, index) => (
                            <option key={name} value={index}>{name}</option>
                        ))}
                    </select>
                     <select 
                        value={activeScale} 
                        onChange={(e) => dispatch({ type: ActionType.SET_SCALE, payload: e.target.value})}
                        className="bg-emerald-200 text-emerald-800 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400 max-w-[120px]"
                    >
                        {SCALES.map(scale => (
                            <option key={scale.name} value={scale.name}>{scale.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="w-full h-24 flex flex-wrap gap-1 content-start">
                 {scaleNotes.map((cents, index) => {
                    const { name, offset } = formatNoteName(cents);
                    return (
                        <button
                            key={index}
                            onMouseDown={() => handleNotePlay(cents)}
                            className="h-10 flex-grow basis-10 rounded-md border-2 transition-colors flex flex-col items-center justify-center bg-white border-slate-200 active:bg-pink-200"
                        >
                           <span className="font-bold text-base">{name}</span>
                           {offset !== 0 && <span className="text-[10px] text-slate-500">{offset > 0 ? '+' : ''}{offset}c</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default KeyboardInput;