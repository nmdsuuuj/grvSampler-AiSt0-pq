import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, LockableParam, Pattern } from '../types';
import { STEPS_PER_PATTERN } from '../constants';

interface ParamLockEditorProps {
    activePattern: Pattern;
    activeSampleId: number;
}

const PARAMS: { value: LockableParam; label: string; min: number; max: number; step: number; isNote: boolean; }[] = [
    { value: 'note', label: 'Note', min: 0, max: 127, step: 1, isNote: true },
    { value: 'velocity', label: 'Velo', min: 0, max: 1, step: 0.01, isNote: false },
    { value: 'pitch', label: 'Pitch', min: -24, max: 24, step: 0.01, isNote: false },
    { value: 'volume', label: 'Vol', min: 0, max: 1, step: 0.01, isNote: false },
    { value: 'decay', label: 'Decay', min: 0.01, max: 1, step: 0.001, isNote: false },
    { value: 'start', label: 'Start', min: 0, max: 1, step: 0.001, isNote: false },
    { value: 'lpFreq', label: 'LP F', min: 20, max: 20000, step: 1, isNote: false },
    { value: 'hpFreq', label: 'HP F', min: 20, max: 20000, step: 1, isNote: false },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ParamLockEditor: React.FC<ParamLockEditorProps> = ({ activePattern, activeSampleId }) => {
    const { dispatch } = useContext(AppContext);
    const [selectedParam, setSelectedParam] = useState<LockableParam>('note');
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const paramInfo = PARAMS.find(p => p.value === selectedParam)!;

    const handleValueChange = (step: number, value: number | null) => {
        dispatch({
            type: ActionType.UPDATE_PARAM_LOCK,
            payload: {
                patternId: activePattern.id,
                sampleId: activeSampleId,
                param: selectedParam,
                step,
                value,
            },
        });
    };
    
    const handleMouseEvent = (e: React.MouseEvent<HTMLDivElement>, step: number) => {
        if (!isDragging) return;
        if (!containerRef.current) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const percentage = 1 - Math.max(0, Math.min(1, y / rect.height));
        
        let newValue = paramInfo.min + (paramInfo.max - paramInfo.min) * percentage;
        newValue = Math.round(newValue / paramInfo.step) * paramInfo.step;
        
        handleValueChange(step, newValue);
    };
    
    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const touch = e.touches[0];
        const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (targetElement && containerRef.current.contains(targetElement) && targetElement.hasAttribute('data-step')) {
            const step = parseInt(targetElement.getAttribute('data-step')!, 10);
            const rect = targetElement.getBoundingClientRect();
            const y = touch.clientY - rect.top;
            const percentage = 1 - Math.max(0, Math.min(1, y / rect.height));

            let newValue = paramInfo.min + (paramInfo.max - paramInfo.min) * percentage;
            newValue = Math.round(newValue / paramInfo.step) * paramInfo.step;
            
            handleValueChange(step, newValue);
        }
    };


    const formatDisplayValue = (value: number | null) => {
        if (value === null) return '-';
        if (paramInfo.isNote) {
            return `${NOTE_NAMES[value % 12]}${Math.floor(value / 12) - 1}`;
        }
        if (paramInfo.max > 100) return value.toFixed(0);
        return value.toFixed(2);
    };

    return (
        <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg space-y-1">
            <div className="flex items-center space-x-2">
                 <select value={selectedParam} onChange={(e) => setSelectedParam(e.target.value as LockableParam)} className="bg-emerald-200 text-emerald-800 rounded p-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                    {PARAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <button 
                    onClick={() => { if (window.confirm(`Clear all ${paramInfo.label} data for this track?`)) dispatch({type: ActionType.CLEAR_PARAM_LOCK_LANE, payload: {patternId: activePattern.id, sampleId: activeSampleId, param: selectedParam}})}}
                    className="bg-rose-400 text-white text-xs font-bold px-3 py-1.5 rounded"
                >
                    Clear
                </button>
            </div>
           
            <div 
                ref={containerRef}
                className="grid grid-cols-16 gap-px bg-emerald-100 p-px rounded-sm"
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
                onTouchCancel={() => setIsDragging(false)}
                onTouchMove={handleTouchMove}

            >
                {Array.from({ length: STEPS_PER_PATTERN }).map((_, i) => {
                    const stepData = activePattern.steps[activeSampleId]?.[i];
                    let value;
                    if (selectedParam === 'note' || selectedParam === 'velocity') {
                        value = stepData?.[selectedParam] ?? null;
                    } else {
                         value = activePattern.paramLocks[activeSampleId]?.[selectedParam]?.[i] ?? null;
                    }

                    const percentage = value === null ? 0 : (value - paramInfo.min) / (paramInfo.max - paramInfo.min);
                    const isStepOn = stepData?.active;

                    return (
                        <div
                            key={i}
                            data-step={i}
                            className={`h-20 relative cursor-pointer select-none rounded-sm ${isStepOn ? 'bg-emerald-200' : 'bg-slate-50'}`}
                            onMouseMove={(e) => handleMouseEvent(e, i)}
                            onMouseDown={(e) => { setIsDragging(true); handleMouseEvent(e, i); }}
                        >
                            <div className="absolute bottom-0 w-full bg-pink-400/70" style={{ height: `${percentage * 100}%` }}></div>
                            <div className="absolute top-0 left-0 w-full text-center text-[8px] text-slate-500 font-semibold pointer-events-none">
                                {formatDisplayValue(value)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ParamLockEditor;
