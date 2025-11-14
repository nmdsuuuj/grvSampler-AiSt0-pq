
import React, { useContext, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, Pattern, LockableParam, Sample, PlaybackParams } from '../../types';
import Pad from '../Pad';
import { PADS_PER_BANK, STEPS_PER_PART, LOOP_PRESETS, PATTERNS_PER_BANK, STEPS_PER_PATTERN } from '../../constants';
import Fader from '../Fader';
import BankSelector from '../BankSelector';
import KeyboardInput from '../KeyboardInput';
import SCALES from '../../scales';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];


const PARAMS: { value: LockableParam; label: string; min: number; max: number; step: number; isNote: boolean; }[] = [
    { value: 'pitch', label: 'Pitch', min: -24, max: 24, step: 0.01, isNote: false },
    { value: 'volume', label: 'Vol', min: 0, max: 1, step: 0.01, isNote: false },
    { value: 'decay', label: 'Decay', min: 0.01, max: 1, step: 0.001, isNote: false },
    { value: 'start', label: 'Start', min: 0, max: 1, step: 0.001, isNote: false },
    { value: 'lpFreq', label: 'LP F', min: 20, max: 20000, step: 1, isNote: false },
    { value: 'hpFreq', label: 'HP F', min: 20, max: 20000, step: 1, isNote: false },
    { value: 'velocity', label: 'Velo', min: 0, max: 1, step: 0.01, isNote: false },
    { value: 'detune', label: 'Detune', min: -1200, max: 1200, step: 1, isNote: true },
];

const FADER_PARAMS = PARAMS.filter(p => !['pitch', 'volume', 'detune'].includes(p.value));
const DETUNE_PARAM = PARAMS.find(p => p.value === 'detune');


interface SeqViewProps {
    playSample: (id: number, time: number, params?: Partial<PlaybackParams>) => void;
    startRecording: () => void;
    stopRecording: () => void;
}

const ALL_RATE_VALUES = [32, 27, 24, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3];
type SeqMode = 'PART' | 'PARAM' | 'REC';
type ParamGridMode = 'select' | 'selectAndGate';

const LoopMeter: React.FC<{ part: 'A' | 'B'; count: number; currentRep: number }> = ({ part, count, currentRep }) => (
    <div className="flex items-center space-x-1">
        <span className="text-xs font-bold text-slate-500 w-3">{part}</span>
        <div className="flex items-center space-x-0.5">
            {Array.from({ length: count > 15 ? 15 : count }).map((_, i) => (
                <div key={i} className={`w-1.5 h-4 rounded-sm transition-colors ${i < currentRep ? 'bg-pink-400' : 'bg-emerald-200'}`} />
            ))}
            { count > 15 && <span className="text-xs text-slate-400 -ml-0.5">...</span>}
        </div>
    </div>
);


const PartSettings: React.FC<{
    activePattern: Pattern;
    updatePatternParams: (params: Partial<Omit<Pattern, 'id' | 'steps' | 'paramLocks' | 'playbackKey' | 'playbackScale'>>) => void;
    updatePlaybackScale: (params: { key?: number; scale?: string }) => void;
    playbackState: { currentPart: 'A' | 'B'; partRepetition: number; };
}> = ({ activePattern, updatePatternParams, updatePlaybackScale, playbackState }) => {

    const handleLoopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = LOOP_PRESETS.find(p => p.label === e.target.value);
        if (preset) {
            updatePatternParams({ loopCountA: preset.a, loopCountB: preset.b });
        }
    };

    const currentLoopPreset = LOOP_PRESETS.find(p => p.a === activePattern.loopCountA && p.b === activePattern.loopCountB);

    return (
        <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg space-y-2">
            {/* Playback Scale Controls */}
            <div className="bg-emerald-50/80 p-1 rounded-md flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 px-2">Playback Scale</span>
                <div className="flex items-center space-x-1">
                     <select 
                        value={activePattern.playbackKey} 
                        onChange={(e) => updatePlaybackScale({ key: parseInt(e.target.value)})}
                        className="bg-emerald-200 text-emerald-800 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400"
                    >
                        {NOTE_NAMES.map((name, index) => (
                            <option key={name} value={index}>{name}</option>
                        ))}
                    </select>
                     <select 
                        value={activePattern.playbackScale} 
                        onChange={(e) => updatePlaybackScale({ scale: e.target.value})}
                        className="bg-emerald-200 text-emerald-800 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400 max-w-[120px]"
                    >
                        {SCALES.map(scale => (
                            <option key={scale.name} value={scale.name}>{scale.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2">
                {/* Part A */}
                <div className="bg-emerald-50/80 p-2 rounded-md space-y-2">
                     <div className="grid grid-cols-5 gap-1">
                        {ALL_RATE_VALUES.map(rate => (
                            <button
                                key={`a-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionA: rate })}
                                className={`py-1 text-[10px] font-bold rounded transition-colors ${activePattern.stepResolutionA === rate ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Fader label="Len" value={activePattern.stepLengthA} onChange={val => updatePatternParams({ stepLengthA: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-white text-3xl font-bold opacity-60 drop-shadow-md">A</span>
                        </div>
                    </div>
                </div>
                {/* Part B */}
                <div className="bg-emerald-50/80 p-2 rounded-md space-y-2">
                     <div className="grid grid-cols-5 gap-1">
                         {ALL_RATE_VALUES.map(rate => (
                            <button
                                key={`b-${rate}`}
                                onClick={() => updatePatternParams({ stepResolutionB: rate })}
                                className={`py-1 text-[10px] font-bold rounded transition-colors ${activePattern.stepResolutionB === rate ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}>
                                {rate}
                            </button>
                        ))}
                    </div>
                     <div className="relative">
                        <Fader label="Len" value={activePattern.stepLengthB} onChange={val => updatePatternParams({ stepLengthB: val })} min={1} max={16} step={1} defaultValue={16} displayPrecision={0} />
                         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-white text-3xl font-bold opacity-60 drop-shadow-md">B</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Loop Controls */}
             <div className="flex items-center space-x-2">
                <select
                    onChange={handleLoopChange}
                    value={currentLoopPreset?.label || ''}
                    className="bg-emerald-200 text-emerald-800 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400 w-1/4"
                >
                    {LOOP_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <div className="flex-grow bg-emerald-100/70 rounded p-1 flex items-center justify-around">
                    <LoopMeter part="A" count={activePattern.loopCountA} currentRep={playbackState.currentPart === 'A' ? playbackState.partRepetition + 1 : activePattern.loopCountA} />
                    <LoopMeter part="B" count={activePattern.loopCountB} currentRep={playbackState.currentPart === 'B' ? playbackState.partRepetition + 1 : 0} />
                </div>
            </div>
        </div>
    );
};


const SeqView: React.FC<SeqViewProps> = ({ playSample }) => {
    const { state, dispatch } = useContext(AppContext);
    const [patternViewBank, setPatternViewBank] = useState(0);
    const [mode, setMode] = useState<SeqMode>('PART');
    const [selectedStep, setSelectedStep] = useState<number>(0);
    const [paramGridMode, setParamGridMode] = useState<ParamGridMode>('select');


    const {
        patterns,
        activePatternIds,
        activeSampleId,
        activeSampleBank,
        currentSteps,
        samples,
        audioContext,
        playbackTrackStates,
        isPlaying,
    } = state;
    
    const activePatternId = activePatternIds[activeSampleBank];
    const activePattern = patterns.find(p => p.id === activePatternId);
    const activeSample = samples[activeSampleId];
    const playbackState = playbackTrackStates[activeSampleBank];
    const currentStep = currentSteps[activeSampleBank];

    const handleStepToggle = (sampleId: number, step: number) => {
        if (!activePattern) return;
        dispatch({ type: ActionType.TOGGLE_STEP, payload: { patternId: activePattern.id, sampleId, step } });
    };

    const handleSamplePadClick = (id: number) => {
        // In REC mode, pads only select the active sample for the keyboard.
        // Recording is triggered by the KeyboardInput component.
        if (mode === 'REC') {
            dispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: id });
            return;
        }

        // Default behavior for other modes
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

    const updatePatternParams = (params: Partial<Omit<Pattern, 'id' | 'steps' | 'paramLocks' | 'playbackKey' | 'playbackScale'>>) => {
        if (!activePattern) return;
        dispatch({
            type: ActionType.UPDATE_PATTERN_PARAMS,
            payload: { patternId: activePattern.id, params },
        });
    };
    
    const updatePlaybackScale = (params: { key?: number; scale?: string }) => {
        if (!activePattern) return;
        dispatch({
            type: ActionType.UPDATE_PATTERN_PLAYBACK_SCALE,
            payload: { patternId: activePattern.id, ...params },
        });
    };

    const handleParamChange = (param: LockableParam, value: number) => {
        if (selectedStep === null || !activePattern) return;
        dispatch({
            type: ActionType.UPDATE_PARAM_LOCK,
            payload: {
                patternId: activePattern.id,
                sampleId: activeSampleId,
                param: param,
                step: selectedStep,
                value: value,
            },
        });
    };
    
    const handleParamStepClick = (stepIndex: number) => {
        setSelectedStep(stepIndex);
        if (paramGridMode === 'selectAndGate') {
            handleStepToggle(activeSampleId, stepIndex);
        }
    };
    
    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;
    const patternBankOffsetForView = (activeSampleBank * PATTERNS_PER_BANK) + (patternViewBank * PADS_PER_BANK);

    if (!activePattern || !activeSample) {
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
                 <button 
                    onClick={() => setMode('REC')}
                    className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'REC' ? 'bg-rose-500 text-white shadow' : 'bg-transparent text-slate-600'}`}
                >
                    REC
                </button>
            </div>
            
            {mode === 'PART' && <PartSettings activePattern={activePattern} updatePatternParams={updatePatternParams} updatePlaybackScale={updatePlaybackScale} playbackState={playbackState} />}
            {mode === 'PARAM' && (
                 <div className="flex-shrink-0 bg-white shadow-md p-2 rounded-lg space-y-2">
                    {DETUNE_PARAM && (() => {
                        const p = DETUNE_PARAM;
                        const lockedValue = activePattern.steps[sampleId]?.[selectedStep]?.[p.value];
                        
                        let displayValue = (lockedValue === null || lockedValue === undefined) ? 0 : lockedValue;

                        return (
                            <Fader 
                                key={p.value}
                                label="Detune (c)"
                                value={displayValue} 
                                onChange={(val) => handleParamChange(p.value, val)} 
                                min={p.min} 
                                max={p.max} 
                                step={p.step} 
                                defaultValue={0}
                                displayValue={displayValue}
                                displayPrecision={0}
                            />
                        );
                    })()}
                    <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                        {FADER_PARAMS.map(p => {
                            const lockedValue = (p.value === 'velocity')
                                ? activePattern.steps[sampleId]?.[selectedStep]?.[p.value]
                                : activePattern.paramLocks[sampleId]?.[p.value]?.[selectedStep];
                            
                            let displayValue;
                            if (lockedValue !== null && lockedValue !== undefined) {
                                displayValue = lockedValue;
                            } else {
                                if (p.value === 'velocity') displayValue = 1; // Default velocity
                                else displayValue = activeSample[p.value as keyof Omit<Sample, 'id'|'name'|'buffer'>];
                            }
                            
                            return (
                                <Fader 
                                    key={p.value}
                                    label={p.label} 
                                    value={displayValue} 
                                    onChange={(val) => handleParamChange(p.value, val)} 
                                    min={p.min} 
                                    max={p.max} 
                                    step={p.step} 
                                    defaultValue={p.value === 'velocity' ? 1 : activeSample[p.value as keyof Omit<Sample, 'id'|'name'|'buffer'>]}
                                    displayValue={displayValue}
                                    displayPrecision={p.value.includes('Freq') ? 0 : 2}
                                    size="thin"
                                />
                            );
                        })}
                        <div className="flex items-center justify-end">
                            <button
                                onClick={() => setParamGridMode(prev => prev === 'select' ? 'selectAndGate' : 'select')}
                                className={`h-full w-12 rounded text-[10px] font-bold transition-colors ${paramGridMode === 'selectAndGate' ? 'bg-pink-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
                            >
                                {paramGridMode === 'select' ? 'SEL' : 'SEL+G'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {mode === 'REC' && (
                <KeyboardInput 
                    playSample={playSample} 
                />
            )}


            {/* Step Sequencer Grid / Param Editor */}
            <div className="bg-white shadow-md p-2 rounded-lg">
                <div className="grid grid-cols-8 gap-1.5">
                    {Array.from({ length: STEPS_PER_PATTERN }).map((_, stepIndex) => {
                        const stepInfo = activePattern.steps[sampleId]?.[stepIndex];
                        const isStepOn = stepInfo?.active;
                        const isCurrentStep = currentStep === stepIndex;
                        const isPartB = stepIndex >= STEPS_PER_PART;
                        
                        if (mode === 'PART' || mode === 'REC') {
                            let colorClasses;
                            if (isPartB) {
                                colorClasses = isStepOn ? 'bg-fuchsia-400' : 'bg-emerald-100';
                            } else {
                                colorClasses = isStepOn ? 'bg-pink-400' : 'bg-emerald-200';
                            }
                            
                            if (isCurrentStep) {
                                colorClasses = isStepOn ? 'bg-lime-300 brightness-125' : 'bg-lime-400/50';
                            }
                            const baseClasses = 'w-full h-8 rounded-sm transition-colors';

                            return (
                                <button
                                    key={stepIndex}
                                    onClick={() => handleStepToggle(sampleId, stepIndex)}
                                    className={`${baseClasses} ${colorClasses}`}
                                    disabled={mode === 'REC'}
                                />
                            );
                        } else { // 'PARAM' mode - Step Selector
                            let bgClass = isPartB ? 'bg-emerald-100' : 'bg-emerald-200';
                            if (isCurrentStep) bgClass = 'bg-lime-400/50';
                            
                            const isSelected = selectedStep === stepIndex;
                            const noteOnClass = isStepOn ? 'border-2 border-pink-400' : 'border-2 border-transparent';
                            const selectedClass = isSelected ? 'ring-2 ring-sky-400 ring-offset-1' : '';

                            return (
                                <button
                                    key={stepIndex}
                                    onClick={() => handleParamStepClick(stepIndex)}
                                    className={`w-full h-8 rounded-sm transition-colors ${bgClass} ${noteOnClass} ${selectedClass}`}
                                />
                            );
                        }
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
