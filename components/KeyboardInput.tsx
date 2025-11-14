import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, PlaybackParams } from '../types';

interface KeyboardInputProps {
    playSample: (id: number, time: number, params?: Partial<PlaybackParams>) => void;
    activeSampleId: number;
    isPlaying: boolean;
    currentStep: number;
    activePatternId: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const KeyboardInput: React.FC<KeyboardInputProps> = ({ playSample, activeSampleId, isPlaying, currentStep, activePatternId }) => {
    const { dispatch } = useContext(AppContext);
    const [octave, setOctave] = useState(4); // Middle C octave

    const handleNotePlay = (note: number) => {
        // Play sample for immediate feedback
        playSample(activeSampleId, 0, { note });

        // If recording, dispatch action to update pattern
        if (isPlaying && currentStep >= 0) {
            dispatch({
                type: ActionType.RECORD_STEP,
                payload: {
                    patternId: activePatternId,
                    sampleId: activeSampleId,
                    step: currentStep,
                    note: note,
                }
            });
        }
    };

    const renderKey = (noteIndex: number, isBlack: boolean) => {
        const noteNumber = (octave + 1) * 12 + noteIndex;
        const noteName = NOTE_NAMES[noteIndex];
        
        const baseClasses = "h-full rounded-b-md border-2 transition-colors";
        const whiteKeyClasses = "w-full bg-white border-slate-200 active:bg-pink-200";
        const blackKeyClasses = "w-2/3 h-2/3 bg-slate-800 border-slate-600 absolute z-10 -ml-[33.33%] active:bg-pink-500";
        
        return (
            <div className={`relative ${isBlack ? '' : 'flex-1'}`}>
                {!isBlack && (
                     <button
                        onMouseDown={() => handleNotePlay(noteNumber)}
                        className={`${baseClasses} ${whiteKeyClasses}`}
                    >
                         <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-slate-400">{noteName}{octave}</span>
                    </button>
                )}
                 {isBlack && (
                     <button
                        onMouseDown={() => handleNotePlay(noteNumber)}
                        className={`${baseClasses} ${blackKeyClasses}`}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg flex flex-col justify-between items-center space-y-2 min-h-[150px]">
            <div className="flex items-center space-x-4">
                <button 
                    onClick={() => setOctave(o => Math.max(0, o - 1))}
                    className="px-4 py-2 bg-emerald-200 text-emerald-800 font-bold rounded-md"
                >
                    &lt; Oct
                </button>
                <span className="font-bold text-lg text-slate-600">Octave: {octave}</span>
                 <button 
                    onClick={() => setOctave(o => Math.min(8, o + 1))}
                    className="px-4 py-2 bg-emerald-200 text-emerald-800 font-bold rounded-md"
                >
                    Oct &gt;
                </button>
            </div>
            <div className="w-full h-24 flex">
                {renderKey(0, false)}
                {renderKey(1, true)}
                {renderKey(2, false)}
                {renderKey(3, true)}
                {renderKey(4, false)}
                {renderKey(5, false)}
                {renderKey(6, true)}
                {renderKey(7, false)}
                {renderKey(8, true)}
                {renderKey(9, false)}
                {renderKey(10, true)}
                {renderKey(11, false)}
            </div>
        </div>
    );
};

export default KeyboardInput;
