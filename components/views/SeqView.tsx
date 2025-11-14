
import React, { useContext, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, Pattern } from '../../types';
import Pad from '../Pad';
import { PADS_PER_BANK, STEPS_PER_PART, LOOP_PRESETS, PATTERNS_PER_BANK, STEPS_PER_PATTERN } from '../../constants';
import Fader from '../Fader';
import BankSelector from '../BankSelector';
import ParamLockEditor from '../ParamLockEditor';

interface SeqViewProps {
    playSample: (id: number, time: number, params?: any) => void;
    startRecording: () => void;
    stopRecording: () => void;
}

const RATE_VALUES = [32, 24, 16, 12, 8, 6, 4, 3];
type SeqMode = 'PART' | 'PARAM';

const PartSettings: React.FC<{
    activePattern: Pattern;
    updatePatternParams: (params: Partial<Omit<Pattern, 'id' | 'steps' | 'paramLocks'>>) => void;
}> = ({ activePattern, updatePatternParams }) => {

    const handleLoopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = LOOP_PRESETS.find(p => p.label === e.target.value);
        if (preset) {
            updatePatternParams({ loopCountA: preset.a, loopCountB: preset.b });
        }
    };

    const currentLoopPreset = LOOP_PRESETS.find(p => p.a === activePattern.loopCountA && p.b === activePattern.loopCountB);

    return (
        <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-x-2">
                {/* Part A */}
                <div className="bg-emerald-50/80 p-2 rounded-md space-y-2">
                    <label className="text-xs font-bold text-slate-600">PART A</label>
                    <div className="grid grid-cols-4 gap-1">
                        {RATE_VALUES.map(rate => (
                            <button
                                key={`a-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionA: rate })}
                                className={`py-2 text-xs font-bold rounded transition-colors ${activePattern.stepResolutionA === rate ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                    <Fader label="Len" value={activePattern.stepLengthA} onChange={val => updatePatternParams({ stepLengthA: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                </div>
                {/* Part B */}
                <div className="bg-emerald-50/80 p-2 rounded-md space-y-2">
                    <label className="text-xs font-bold text-slate-600">PART B</label>
                     <div className="grid grid-cols-4 gap-1">
                         {RATE_VALUES.map(rate => (
                            <button
                                key={`b-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionB: rate })}
                                className={`py-2 text-xs font-bold rounded transition-colors ${activePattern.stepResolutionB === rate ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                    <Fader label="Len" value={activePattern.stepLengthB} onChange={val => updatePatternParams({ stepLengthB: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                </div>
            </div>

            {/* Loop Controls */}
             <div className="flex items-center space-x-2">
                <label className="text-sm font-bold text-slate-600 flex-shrink-0">LOOP</label>
                <select
                    onChange={handleLoopChange}
                    value={currentLoopPreset?.label || ''}
                    className="bg-emerald-200 text-emerald-800 rounded p-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
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
    const [mode, setMode] = useState<SeqMode>('PART');

    const {
        patterns,
        activePatternIds,
        activeSampleId,
        activeSampleBank,
        currentStep,
        samples,
        audioContext,
    } = state;
    
    const activePatternId = activePatternIds[activeSampleBank];
    const activePattern = patterns.find(p => p.id === activePatternId);

    const handleStepToggle = (sampleId: number, step: number) => {
        if (!activePattern) return;
        dispatch({ type: ActionType.TOGGLE_STEP, payload: { patternId: activePattern.id, sampleId, step } });
    };

    const handleSamplePadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: id });
        if (samples[id] && samples[id].buffer) {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    playSample(id, 0);
                });
            } else if (audioContext) {
                playSample(id, 0);
            }
        }
    };
    
    const handlePatternPadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_PATTERN_FOR_BANK, payload: { bankIndex: activeSampleBank, patternId: id } });
    };

    const updatePatternParams = (params: Partial<Omit<Pattern, 'id' | 'steps' | 'paramLocks'>>) => {
        if (!activePattern) return;
        dispatch({
            type: ActionType.UPDATE_PATTERN_PARAMS,
            payload: { patternId: activePattern.id, params },
        });
    };

    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;
    const patternBankOffsetForView = (activeSampleBank * PATTERNS_PER_BANK) + (patternViewBank * PADS_PER_BANK);

    if (!activePattern) {
        return <div className="text-center p-4">Loading Sequencer...</div>;
    }

    const sampleId = activeSampleId;

    return (
        <div className="flex flex-col h-full p-1 justify-between">
            <div className="flex items-center justify-center space-x-1 p-1 bg-emerald-200 rounded-lg mb-1">
                <button 
                    onClick={() => setMode('PART')}
                    className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'PART' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}
                >
                    PART
                </button>
                 <button 
                    onClick={() => setMode('PARAM')}
                    className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'PARAM' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}
                >
                    PARAM
                </button>
            </div>
            
            {mode === 'PART' && <PartSettings activePattern={activePattern} updatePatternParams={updatePatternParams} />}
            {mode === 'PARAM' && <ParamLockEditor activePattern={activePattern} activeSampleId={activeSampleId} />}

            {/* Step Sequencer Grid */}
            <div className="bg-white shadow-md p-2 rounded-lg">
                <div className="grid grid-cols-8 gap-1.5">
                    {Array.from({ length: STEPS_PER_PATTERN }).map((_, stepIndex) => {
                        const stepInfo = activePattern.steps[sampleId]?.[stepIndex];
                        const isStepOn = stepInfo?.active;
                        const isCurrentStep = currentStep === stepIndex;
                        const isPartB = stepIndex >= STEPS_PER_PART;
                        
                        let colorClasses;
                        if (isPartB) {
                            colorClasses = isStepOn ? 'bg-fuchsia-400' : 'bg-emerald-100';
                        } else {
                            colorClasses = isStepOn ? 'bg-pink-400' : 'bg-emerald-200';
                        }
                        
                        if (isCurrentStep) {
                            colorClasses = isStepOn ? 'bg-lime-300 brightness-125' : 'bg-lime-400/50';
                        }
                        const baseClasses = 'w-full h-6 rounded-sm transition-colors';

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
                <div className="bg-white shadow-md p-2 rounded-lg flex flex-col space-y-2">
                     <BankSelector type="sample" />
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: PADS_PER_BANK }).map((_, i) => (
                             <Pad key={i} id={sampleBankOffset + i} label={`${String.fromCharCode(65 + activeSampleBank)}${i + 1}`} onClick={handleSamplePadClick} isActive={activeSampleId === sampleBankOffset + i} hasContent={!!samples[sampleBankOffset + i].buffer} padType="sample" />
                        ))}
                    </div>
                </div>
                 <div className="bg-white shadow-md p-2 rounded-lg flex flex-col space-y-2">
                    <div className="flex justify-center space-x-1">
                        {[0, 1, 2, 3].map(bankIndex => (
                            <button
                                key={bankIndex}
                                onClick={() => setPatternViewBank(bankIndex)}
                                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${patternViewBank === bankIndex ? 'bg-pink-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
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
                            // Check if any step in any sample lane is active for hasContent
                            const hasContent = patterns[globalPatternId]?.steps.some(sampleLane => sampleLane.some(step => step.active));
                            return <Pad key={i} id={globalPatternId} label={`P${localPatternNum}`} onClick={handlePatternPadClick} isActive={isActive} hasContent={hasContent} padType="pattern" />
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default SeqView;
