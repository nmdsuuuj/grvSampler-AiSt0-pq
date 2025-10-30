import React, { useContext, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, Pattern } from '../../types';
import Pad from '../Pad';
import { PADS_PER_BANK, STEPS_PER_PART, LOOP_PRESETS, PATTERNS_PER_BANK } from '../../constants';
import Fader from '../Fader';
import BankSelector from '../BankSelector';

interface SeqViewProps {
    playSample: (id: number, time: number) => void;
    startRecording: () => void;
    stopRecording: () => void;
}

const RATE_VALUES = [32, 24, 16, 12, 8, 6, 4, 3];

const PatternSettings: React.FC<{
    activePattern: Pattern;
    updatePatternParams: (params: Partial<Omit<Pattern, 'id' | 'steps'>>) => void;
}> = ({ activePattern, updatePatternParams }) => {

    const handleLoopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = LOOP_PRESETS.find(p => p.label === e.target.value);
        if (preset) {
            updatePatternParams({ loopCountA: preset.a, loopCountB: preset.b });
        }
    };

    const currentLoopPreset = LOOP_PRESETS.find(p => p.a === activePattern.loopCountA && p.b === activePattern.loopCountB);

    return (
        <div className="flex-shrink-0 bg-slate-800 p-2 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-x-2">
                {/* Part A */}
                <div className="bg-slate-900/50 p-2 rounded-md space-y-2">
                    <label className="text-xs font-bold text-slate-300">PART A</label>
                    <div className="grid grid-cols-4 gap-1">
                        {RATE_VALUES.map(rate => (
                            <button
                                key={`a-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionA: rate })}
                                className={`py-2 text-xs font-bold rounded transition-colors ${activePattern.stepResolutionA === rate ? 'bg-amber-500 text-black' : 'bg-slate-700 hover:bg-slate-600'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                    <Fader label="Len" value={activePattern.stepLengthA} onChange={val => updatePatternParams({ stepLengthA: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                </div>
                {/* Part B */}
                <div className="bg-slate-900/50 p-2 rounded-md space-y-2">
                    <label className="text-xs font-bold text-slate-300">PART B</label>
                     <div className="grid grid-cols-4 gap-1">
                         {RATE_VALUES.map(rate => (
                            <button
                                key={`b-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionB: rate })}
                                className={`py-2 text-xs font-bold rounded transition-colors ${activePattern.stepResolutionB === rate ? 'bg-amber-500 text-black' : 'bg-slate-700 hover:bg-slate-600'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                    <Fader label="Len" value={activePattern.stepLengthB} onChange={val => updatePatternParams({ stepLengthB: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                </div>
            </div>

            {/* Loop Controls */}
             <div className="flex items-center space-x-2">
                <label className="text-sm font-bold text-slate-300 flex-shrink-0">LOOP</label>
                <select
                    onChange={handleLoopChange}
                    value={currentLoopPreset?.label || ''}
                    className="bg-slate-700 text-white rounded p-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                    {LOOP_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
            </div>
        </div>
    );
};


const SeqView: React.FC<SeqViewProps> = ({ playSample }) => {
    const { state, dispatch } = useContext(AppContext);
    const [patternViewBank, setPatternViewBank] = useState(0);
    const {
        patterns,
        activePatternIds,
        activeSampleId,
        activeSampleBank,
        currentStep,
        samples,
    } = state;
    
    // The pattern being edited/viewed is the one for the currently active *sample* bank
    const activePatternId = activePatternIds[activeSampleBank];
    const activePattern = patterns.find(p => p.id === activePatternId);

    const handleStepToggle = (sampleId: number, step: number) => {
        if (!activePattern) return;
        dispatch({ type: ActionType.TOGGLE_STEP, payload: { patternId: activePattern.id, sampleId, step } });
    };

    const handleSamplePadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: id });
        if (samples[id].buffer) {
            playSample(id, 0);
        }
    };
    
    const handlePatternPadClick = (id: number) => {
        // Assigns the clicked pattern (with global ID) to the currently active sample bank.
        dispatch({ type: ActionType.SET_ACTIVE_PATTERN_FOR_BANK, payload: { bankIndex: activeSampleBank, patternId: id } });
    };

    const updatePatternParams = (params: Partial<Omit<Pattern, 'id' | 'steps'>>) => {
        if (!activePattern) return;
        dispatch({
            type: ActionType.UPDATE_PATTERN_PARAMS,
            payload: { patternId: activePattern.id, params },
        });
    };

    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;
    
    // Calculate the offset for which patterns to display from the dedicated set of 32
    const patternBankOffsetForView = (activeSampleBank * PATTERNS_PER_BANK) + (patternViewBank * PADS_PER_BANK);

    if (!activePattern) {
        return <div className="text-center p-4">Loading Sequencer...</div>;
    }

    const sampleId = activeSampleId;

    return (
        <div className="flex flex-col h-full p-1 justify-between">
            
            <PatternSettings activePattern={activePattern} updatePatternParams={updatePatternParams} />

            {/* Step Sequencer Grid */}
            <div className="bg-slate-800 p-2 rounded-lg">
                <div className="grid grid-cols-8 gap-1.5">
                    {Array.from({ length: STEPS_PER_PART * 2 }).map((_, stepIndex) => {
                        const isStepOn = activePattern.steps[sampleId]?.[stepIndex];
                        const isCurrentStep = currentStep === stepIndex;
                        const isPartB = stepIndex >= STEPS_PER_PART;
                        
                        let baseClasses = 'w-full h-6 rounded-sm transition-colors';
                        let colorClasses = isStepOn ? 'bg-sky-500' : 'bg-slate-700';
                        if (isPartB) {
                            colorClasses = isStepOn ? 'bg-indigo-500' : 'bg-slate-600/70';
                        }
                        if(isCurrentStep) {
                            colorClasses = isStepOn ? 'bg-amber-400 brightness-125' : 'bg-amber-600/50';
                        }

                        return (
                            <button
                                key={stepIndex}
                                onClick={() => handleStepToggle(sampleId, stepIndex)}
                                className={`${baseClasses} ${colorClasses}`}
                            />
                        );
                    })}
                </div>
            </div>
            
            {/* Bottom controls */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800 p-2 rounded-lg flex flex-col space-y-2">
                     <BankSelector type="sample" />
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: PADS_PER_BANK }).map((_, i) => (
                             <Pad key={i} id={sampleBankOffset + i} label={`${String.fromCharCode(65 + activeSampleBank)}${i + 1}`} onClick={handleSamplePadClick} isActive={activeSampleId === sampleBankOffset + i} hasContent={!!samples[sampleBankOffset + i].buffer} />
                        ))}
                    </div>
                </div>
                 <div className="bg-slate-800 p-2 rounded-lg flex flex-col space-y-2">
                    <div className="flex justify-center space-x-1">
                        {[0, 1, 2, 3].map(bankIndex => (
                            <button
                                key={bankIndex}
                                onClick={() => setPatternViewBank(bankIndex)}
                                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${patternViewBank === bankIndex ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'}`}
                            >
                                {bankIndex + 1}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                         {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
                            const globalPatternId = patternBankOffsetForView + i;
                            const localPatternNum = (patternViewBank * PADS_PER_BANK) + i + 1;
                            const isActive = state.activePatternIds[activeSampleBank] === globalPatternId;
                            return <Pad key={i} id={globalPatternId} label={`P${localPatternNum}`} onClick={handlePatternPadClick} isActive={isActive} hasContent={patterns[globalPatternId]?.steps.some(row => row.some(step => step))} />
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default SeqView;