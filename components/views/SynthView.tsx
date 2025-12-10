
import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, SynthPreset } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { OSC_WAVEFORMS, LFO_WAVEFORMS, FILTER_TYPES, WAVESHAPER_TYPES, MOD_SOURCES, MOD_DESTINATIONS, LFO_SYNC_RATES, LFO_SYNC_TRIGGERS } from '../../constants';
import ModulationNode from '../ModulationNode';
import LfoVisualizer from '../LfoVisualizer';

interface SynthViewProps {
    playSynthNote: (detune: number, time?: number) => void;
    lfoAnalysers: React.MutableRefObject<{ lfo1: AnalyserNode | null; lfo2: AnalyserNode | null; }>;
}

type SynthTab = 'OSC' | 'FLT/ENV' | 'LFO/MOD' | 'PRESETS';
type PresetMode = 'LOAD' | 'SAVE';

const SynthView: React.FC<SynthViewProps> = ({ playSynthNote, lfoAnalysers }) => {
    const { state, dispatch } = useContext(AppContext);
    const { synth, synthModMatrix, synthPresets, isModMatrixMuted } = state;

    const [activeTab, setActiveTab] = useState<SynthTab>('OSC');
    const [presetBank, setPresetBank] = useState(0);
    const [selectedPresetSlot, setSelectedPresetSlot] = useState<number | null>(null);
    const [presetMode, setPresetMode] = useState<PresetMode>('LOAD');
    const [presetNameInput, setPresetNameInput] = useState('');

    useEffect(() => {
        if (presetMode === 'LOAD') {
            setSelectedPresetSlot(null);
        }
    }, [presetMode]);

    useEffect(() => {
        if (presetMode === 'SAVE' && selectedPresetSlot !== null) {
            const existingPreset = synthPresets[selectedPresetSlot];
            setPresetNameInput(existingPreset?.name || `Preset ${selectedPresetSlot + 1}`);
        } else {
            setPresetNameInput('');
        }
    }, [selectedPresetSlot, presetMode, synthPresets]);

    const handleParamChange = (paramPath: string, value: string | number | boolean) => {
        dispatch({ type: ActionType.UPDATE_SYNTH_PARAM, payload: { path: paramPath, value } });
    };

    const handleMatrixChange = (source: string, dest: string, value: number) => {
        dispatch({ type: ActionType.SET_SYNTH_MOD_MATRIX, payload: { source, dest, value } });
    };
    
    const handleRandomizeAll = () => {
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_PARAMS });
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_MOD_MATRIX });
    };
    
    const handleRandomizeMatrixOnly = () => {
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_MOD_MATRIX });
    };

    const handleSavePreset = () => {
        if (selectedPresetSlot === null || !presetNameInput.trim()) return;
        const name = presetNameInput.trim();
        dispatch({
            type: ActionType.SAVE_SYNTH_PRESET_AT_INDEX,
            payload: { index: selectedPresetSlot, name, synth, matrix: synthModMatrix }
        });
        alert(`Saved preset "${name}" to slot ${selectedPresetSlot + 1}.`);
        setSelectedPresetSlot(null);
    };

    const handleClearPreset = () => {
        if (selectedPresetSlot === null) return;
        const presetToClear = synthPresets[selectedPresetSlot];
        if (presetToClear && window.confirm(`Are you sure you want to clear preset "${presetToClear.name}"?`)) {
            dispatch({ type: ActionType.CLEAR_SYNTH_PRESET_AT_INDEX, payload: { index: selectedPresetSlot } });
        }
    };
    
    const handleLoadPreset = (preset: SynthPreset) => {
        dispatch({ type: ActionType.LOAD_SYNTH_PRESET, payload: preset });
    };

    const handlePresetPadClick = (presetIndex: number) => {
        if (presetMode === 'LOAD') {
            const preset = synthPresets[presetIndex];
            if (preset) {
                handleLoadPreset(preset);
            }
        } else { // SAVE mode
            setSelectedPresetSlot(prev => (prev === presetIndex ? null : presetIndex));
        }
    };

    const handleMuteMatrix = () => {
        dispatch({ type: ActionType.TOGGLE_SYNTH_MOD_MATRIX_MUTE });
    };
    
    // FIX: Removed useCallback to ensure the dispatch function always has the latest context,
    // which was the likely cause of the button being unresponsive.
    const handleClearMatrix = () => {
        if (window.confirm('Are you sure you want to clear the entire modulation matrix?')) {
            dispatch({ type: ActionType.CLEAR_SYNTH_MOD_MATRIX });
        }
    };

    const renderControlSection = (title: string, children: React.ReactNode, className: string = "") => (
        <div className={`bg-white shadow-md p-1.5 rounded-lg ${className}`}>
            {title && <h3 className="text-center font-bold text-slate-600 mb-1 text-xs">{title}</h3>}
            <div className="space-y-1">{children}</div>
        </div>
    );
    
    const FILTER_MIN_FREQ = 20, FILTER_MAX_FREQ = 20000;
    const filterLinearToLog = (v: number) => FILTER_MIN_FREQ * Math.pow(FILTER_MAX_FREQ / FILTER_MIN_FREQ, v);
    const filterLogToLinear = (v: number) => (v <= FILTER_MIN_FREQ) ? 0 : (v >= FILTER_MAX_FREQ) ? 1 : Math.log(v / FILTER_MIN_FREQ) / Math.log(FILTER_MAX_FREQ / FILTER_MIN_FREQ);

    const LFO_MIN_RATE = 0.01, LFO_MAX_RATE = 50;
    const lfoRateToFaderValue = (hz: number) => Math.log(hz / LFO_MIN_RATE) / Math.log(LFO_MAX_RATE / LFO_MIN_RATE);
    const faderValueToLfoRate = (val: number) => LFO_MIN_RATE * Math.pow(LFO_MAX_RATE / LFO_MIN_RATE, val);

    const renderTabContent = () => {
        switch(activeTab) {
            case 'OSC': return (
                <div className="p-1 h-full grid grid-cols-2 gap-1 overflow-hidden">
                    {/* OSC 1 Section */}
                    <div className="bg-white shadow-md p-1.5 rounded-lg flex flex-col space-y-1">
                        <Fader 
                            label="OSC 1"
                            value={OSC_WAVEFORMS.indexOf(synth.osc1.type)} 
                            onChange={v => handleParamChange('osc1.type', OSC_WAVEFORMS[v])}
                            min={0} 
                            max={OSC_WAVEFORMS.length - 1} 
                            step={1} 
                            defaultValue={OSC_WAVEFORMS.indexOf('Saw Down')}
                            displayString={synth.osc1.type}
                        />
                        <Fader label="Oct" value={synth.osc1.octave} onChange={v => handleParamChange('osc1.octave', v)} min={-4} max={2} step={1} defaultValue={0} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc1.detune} onChange={v => handleParamChange('osc1.detune', v)} min={-100} max={100} step={1} defaultValue={0} displayPrecision={0} />
                        <Fader 
                            label="WS Type"
                            value={WAVESHAPER_TYPES.indexOf(synth.osc1.waveshapeType)} 
                            onChange={v => handleParamChange('osc1.waveshapeType', WAVESHAPER_TYPES[v])}
                            min={0} 
                            max={WAVESHAPER_TYPES.length - 1} 
                            step={1} 
                            defaultValue={0}
                            displayString={synth.osc1.waveshapeType}
                        />
                        <Fader label="WS Amt" value={synth.osc1.waveshapeAmount} onChange={v => handleParamChange('osc1.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                        <Fader label="LFO>WS" value={synth.osc1.wsLfoAmount || 0} onChange={v => handleParamChange('osc1.wsLfoAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                         <div className="flex items-center space-x-1">
                            <button onClick={() => handleParamChange('osc1.sync', !synth.osc1.sync)} className={`w-1/4 py-1 text-xs font-bold rounded ${synth.osc1.sync ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>HdSyc</button>
                            <div className="w-3/4">
                                <Fader label="FM 2>1" value={synth.osc2.fmDepth} onChange={v => handleParamChange('osc2.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} displayPrecision={0} />
                            </div>
                        </div>
                    </div>
                    {/* OSC 2 Section */}
                    <div className="bg-white shadow-md p-1.5 rounded-lg flex flex-col space-y-1">
                        <Fader 
                            label="OSC 2"
                            value={OSC_WAVEFORMS.indexOf(synth.osc2.type)} 
                            onChange={v => handleParamChange('osc2.type', OSC_WAVEFORMS[v])}
                            min={0} 
                            max={OSC_WAVEFORMS.length - 1} 
                            step={1} 
                            defaultValue={OSC_WAVEFORMS.indexOf('Square')}
                            displayString={synth.osc2.type}
                        />
                        <Fader label="Oct" value={synth.osc2.octave} onChange={v => handleParamChange('osc2.octave', v)} min={-4} max={2} step={1} defaultValue={-1} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc2.detune} onChange={v => handleParamChange('osc2.detune', v)} min={-7200} max={7200} step={1} defaultValue={7} displayPrecision={0} />
                         {synth.osc1.sync && (
                            <Fader label="P.Env" value={synth.osc2.pitchEnvAmount || 0} onChange={v => handleParamChange('osc2.pitchEnvAmount', v)} min={-7200} max={7200} step={1} defaultValue={0} displayPrecision={0} />
                        )}
                        <Fader 
                            label="WS Type"
                            value={WAVESHAPER_TYPES.indexOf(synth.osc2.waveshapeType)} 
                            onChange={v => handleParamChange('osc2.waveshapeType', WAVESHAPER_TYPES[v])}
                            min={0} 
                            max={WAVESHAPER_TYPES.length - 1} 
                            step={1} 
                            defaultValue={0}
                            displayString={synth.osc2.waveshapeType}
                        />
                        <Fader label="WS Amt" value={synth.osc2.waveshapeAmount} onChange={v => handleParamChange('osc2.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                        <Fader label="LFO>WS" value={synth.osc2.wsLfoAmount || 0} onChange={v => handleParamChange('osc2.wsLfoAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                        <Fader label="FM 1>2" value={synth.osc1.fmDepth} onChange={v => handleParamChange('osc1.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} displayPrecision={0} />
                    </div>
                </div>
            );
            case 'FLT/ENV': return (
                <div className="p-1 h-full grid grid-cols-2 gap-1 overflow-hidden">
                    <div className="flex flex-col space-y-1">
                        {renderControlSection('FLT', <>
                            <Fader 
                                label="Type"
                                value={FILTER_TYPES.indexOf(synth.filter.type)} 
                                onChange={v => handleParamChange('filter.type', FILTER_TYPES[v])}
                                min={0} 
                                max={FILTER_TYPES.length - 1} 
                                step={1} 
                                defaultValue={0}
                                displayString={synth.filter.type}
                            />
                            <Fader label="Cutoff" value={filterLogToLinear(synth.filter.cutoff)} onChange={v => handleParamChange('filter.cutoff', filterLinearToLog(v))} min={0} max={1} step={0.001} defaultValue={1} displayValue={synth.filter.cutoff} displayPrecision={0} />
                            <Fader label="Res" value={synth.filter.resonance} onChange={v => handleParamChange('filter.resonance', v)} min={0} max={30} step={0.1} defaultValue={1} />
                            <Fader label="Env Amt" value={synth.filter.envAmount} onChange={v => handleParamChange('filter.envAmount', v)} min={-7000} max={7000} step={10} defaultValue={0} displayPrecision={0}/>
                        </>)}
                        {renderControlSection('MIX', <>
                            <Fader label="Osc Mix" value={synth.oscMix} onChange={v => handleParamChange('oscMix', v)} min={0} max={1} step={0.01} defaultValue={0.5} />
                        </>)}
                    </div>
                    <div className="flex flex-col space-y-1">
                        {renderControlSection('AMP ENV', <>
                            <Fader label="D" value={synth.ampEnv.decay} onChange={v => handleParamChange('ampEnv.decay', v)} min={0.001} max={5} step={0.001} defaultValue={0.5} />
                        </>)}
                         {renderControlSection('FLT ENV (ADS)', <>
                            <div className="grid grid-cols-2 gap-1">
                                <Fader label="A" value={synth.filterEnv.attack} onChange={v => handleParamChange('filterEnv.attack', v)} min={0.001} max={4} step={0.001} defaultValue={0.01} />
                                <Fader label="D" value={synth.filterEnv.decay} onChange={v => handleParamChange('filterEnv.decay', v)} min={0.001} max={4} step={0.001} defaultValue={0.2} />
                            </div>
                            <Fader label="S" value={synth.filterEnv.sustain} onChange={v => handleParamChange('filterEnv.sustain', v)} min={0} max={1} step={0.01} defaultValue={0.5} />
                        </>)}
                    </div>
                </div>
            );
            case 'LFO/MOD': 
                const destLabels: { [key: string]: string } = {
                    osc1Pitch: 'P', osc1Wave: 'Wv', osc1FM: 'FM',
                    osc2Pitch: 'P', osc2Wave: 'Wv', osc2FM: 'FM',
                    filterCutoff: 'Cut', filterQ: 'Q',
                };
                const lfo1RateString = synth.lfo1.rateMode === 'sync' ? (LFO_SYNC_RATES[synth.lfo1.rate]?.label || '...') : synth.lfo1.rate.toFixed(2) + ' Hz';
                const lfo2RateString = synth.lfo2.rateMode === 'sync' ? (LFO_SYNC_RATES[synth.lfo2.rate]?.label || '...') : synth.lfo2.rate.toFixed(2) + ' Hz';

                return (
                    <div className="p-1 h-full flex flex-col space-y-1">
                        <div className="flex justify-around gap-1 h-32">
                            {renderControlSection('', <>
                                <Fader 
                                    label="LFO 1"
                                    value={LFO_WAVEFORMS.indexOf(synth.lfo1.type)}
                                    onChange={v => handleParamChange('lfo1.type', LFO_WAVEFORMS[v])}
                                    min={0}
                                    // FIX: Use .length - 1 for the max value of an array-based fader.
                                    max={LFO_WAVEFORMS.length - 1}
                                    step={1} 
                                    defaultValue={0}
                                    displayString={synth.lfo1.type}
                                />
                                <Fader
                                    label="Sync Trg"
                                    value={LFO_SYNC_TRIGGERS.indexOf(synth.lfo1.syncTrigger)}
                                    onChange={v => handleParamChange('lfo1.syncTrigger', LFO_SYNC_TRIGGERS[v])}
                                    min={0} max={LFO_SYNC_TRIGGERS.length - 1} step={1} defaultValue={0}
                                    displayString={synth.lfo1.syncTrigger}
                                />
                                {synth.lfo1.rateMode === 'sync' ? (
                                    <Fader 
                                        label="Rate"
                                        value={synth.lfo1.rate}
                                        onChange={v => handleParamChange('lfo1.rate', v)}
                                        min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={19}
                                        displayString={lfo1RateString}
                                    />
                                ) : (
                                    <Fader 
                                        label="Rate"
                                        value={lfoRateToFaderValue(synth.lfo1.rate)}
                                        onChange={v => handleParamChange('lfo1.rate', faderValueToLfoRate(v))}
                                        min={0} max={1} step={0.001} defaultValue={0.5}
                                        displayString={lfo1RateString}
                                    />
                                )}
                                <div className="flex items-center justify-center space-x-2">
                                    <button onClick={() => handleParamChange('lfo1.rateMode', synth.lfo1.rateMode === 'hz' ? 'sync' : 'hz')} className="bg-emerald-200 px-3 py-1 text-xs font-bold rounded">
                                        {synth.lfo1.rateMode.toUpperCase()}
                                    </button>
                                    <LfoVisualizer analyser={lfoAnalysers.current.lfo1} color="#f472b6" />
                                </div>
                            </>, 'w-1/2')}
                             {renderControlSection('', <>
                                <Fader 
                                    label="LFO 2"
                                    value={LFO_WAVEFORMS.indexOf(synth.lfo2.type)}
                                    onChange={v => handleParamChange('lfo2.type', LFO_WAVEFORMS[v])}
                                    min={0} max={LFO_WAVEFORMS.length - 1} step={1} 
                                    defaultValue={0}
                                    displayString={synth.lfo2.type}
                                />
                                <Fader
                                    label="Sync Trg"
                                    value={LFO_SYNC_TRIGGERS.indexOf(synth.lfo2.syncTrigger)}
                                    onChange={v => handleParamChange('lfo2.syncTrigger', LFO_SYNC_TRIGGERS[v])}
                                    min={0} max={LFO_SYNC_TRIGGERS.length - 1} step={1} defaultValue={0}
                                    displayString={synth.lfo2.syncTrigger}
                                />
                                 {synth.lfo2.rateMode === 'sync' ? (
                                    <Fader 
                                        label="Rate"
                                        value={synth.lfo2.rate}
                                        onChange={v => handleParamChange('lfo2.rate', v)}
                                        min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={19}
                                        displayString={lfo2RateString}
                                    />
                                ) : (
                                    <Fader 
                                        label="Rate"
                                        value={lfoRateToFaderValue(synth.lfo2.rate)}
                                        onChange={v => handleParamChange('lfo2.rate', faderValueToLfoRate(v))}
                                        min={0} max={1} step={0.001} defaultValue={0.5}
                                        displayString={lfo2RateString}
                                    />
                                )}
                                <div className="flex items-center justify-center space-x-2">
                                    <button onClick={() => handleParamChange('lfo2.rateMode', synth.lfo2.rateMode === 'hz' ? 'sync' : 'hz')} className="bg-emerald-200 px-3 py-1 text-xs font-bold rounded">
                                        {synth.lfo2.rateMode.toUpperCase()}
                                    </button>
                                     <LfoVisualizer analyser={lfoAnalysers.current.lfo2} color="#60a5fa" />
                                </div>
                            </>, 'w-1/2')}
                        </div>
                        <div className="flex-grow bg-white shadow-md p-1.5 rounded-lg">
                            <h3 className="text-center font-bold text-slate-600 text-xs">Mod Matrix</h3>
                            <div className="grid grid-cols-4 gap-y-1 gap-x-2 text-xs font-bold text-center">
                                <div className="text-slate-500">Source</div>
                                <div className="text-slate-500 col-span-3">Destinations</div>
                                <div />
                                <div className="grid grid-cols-4 gap-1 col-span-3 text-[10px] text-slate-400">
                                    <div className="col-span-3 text-center">OSC 1</div>
                                    <div />
                                </div>
                                <div />
                                <div className="grid grid-cols-4 gap-1 col-span-3 text-[10px] text-slate-400">
                                    <span>P</span><span>Wv</span><span>FM</span>
                                    <span>Mix</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-y-1 gap-x-2 items-center text-xs font-bold">
                                {MOD_SOURCES.map(source => (
                                    <React.Fragment key={source}>
                                        <div className="text-right text-rose-500">{source.toUpperCase()}</div>
                                        <div className="col-span-3 grid grid-cols-4 gap-2">
                                            {MOD_DESTINATIONS.map(dest => (
                                                <ModulationNode 
                                                    key={dest} 
                                                    value={synthModMatrix[source]?.[dest] || 0}
                                                    onChange={v => handleMatrixChange(source, dest, v)}
                                                />
                                            ))}
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>
                            <div className="flex justify-center space-x-1 mt-1">
                                <button onClick={handleRandomizeMatrixOnly} className="bg-sky-200 text-sky-800 text-xs font-bold px-2 py-1 rounded">Rand</button>
                                <button onClick={handleClearMatrix} className="bg-rose-200 text-rose-800 text-xs font-bold px-2 py-1 rounded">Clear</button>
                                <button onClick={handleMuteMatrix} className={`text-xs font-bold px-2 py-1 rounded ${isModMatrixMuted ? 'bg-slate-400 text-white' : 'bg-emerald-200'}`}>{isModMatrixMuted ? 'Muted' : 'Mute'}</button>
                            </div>
                        </div>
                    </div>
                );
            case 'PRESETS':
                 return (
                    <div className="p-1 h-full flex flex-col space-y-1">
                        <div className="bg-white shadow-md p-1.5 rounded-lg space-y-2">
                            <h3 className="text-center font-bold text-slate-600 text-sm">Synth Presets</h3>
                            <div className="flex justify-between items-center">
                                <div className="flex space-x-1 flex-wrap">
                                    {[0,1,2,3,4,5,6,7].map(i => (
                                        <button key={i} onClick={() => setPresetBank(i)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${presetBank === i ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>B{i+1}</button>
                                    ))}
                                </div>
                                <div className="flex p-0.5 bg-emerald-200 rounded-lg">
                                    <button onClick={() => setPresetMode('LOAD')} className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${presetMode === 'LOAD' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>Load</button>
                                    <button onClick={() => setPresetMode('SAVE')} className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${presetMode === 'SAVE' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>Save</button>
                                </div>
                            </div>
                            {presetMode === 'SAVE' && (
                                <div className="flex items-center space-x-1">
                                    {selectedPresetSlot !== null ? (
                                        <div className="flex-grow flex items-center space-x-1">
                                            <input 
                                                type="text" 
                                                value={presetNameInput}
                                                onChange={(e) => setPresetNameInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                                                className="w-full bg-emerald-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                                                placeholder="Preset Name"
                                            />
                                            <button onClick={handleSavePreset} className="bg-sky-500 text-white font-bold px-2 py-1 rounded text-xs">Save</button>
                                            <button onClick={handleClearPreset} disabled={!synthPresets[selectedPresetSlot]} className="bg-rose-500 text-white font-bold px-2 py-1 rounded text-xs disabled:bg-slate-300">Clear</button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 text-center py-1 w-full">Select a slot to save or clear</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="bg-white shadow-md p-1.5 rounded-lg flex-grow grid grid-cols-4 gap-2">
                            {Array.from({ length: 16 }).map((_, i) => {
                                const presetIndex = presetBank * 16 + i;
                                const preset = synthPresets[presetIndex];
                                const isActive = presetMode === 'SAVE' && selectedPresetSlot === presetIndex;
                                return (
                                    <Pad
                                        key={i}
                                        id={presetIndex}
                                        label={preset?.name.substring(0, 10) || `P${presetIndex+1}`}
                                        onClick={() => handlePresetPadClick(presetIndex)}
                                        isActive={isActive}
                                        hasContent={!!preset}
                                        padType="pattern"
                                    />
                                );
                            })}
                        </div>
                         <div className="bg-white shadow-md p-1.5 rounded-lg text-center">
                            <button onClick={handleRandomizeAll} className="bg-sky-200 text-sky-800 text-xs font-bold px-4 py-2 rounded">Randomize All Synth Params</button>
                        </div>
                    </div>
                );
        }
    };
    // FIX: Add a return statement to the main component function body.
    return (
        <div className="flex flex-col h-full">
            {/* Tab buttons */}
            <div className="flex-shrink-0 p-1">
                <div className="flex justify-around items-center space-x-1 p-1 bg-emerald-200 rounded-lg">
                    <button onClick={() => setActiveTab('OSC')} className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${activeTab === 'OSC' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>OSC</button>
                    <button onClick={() => setActiveTab('FLT/ENV')} className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${activeTab === 'FLT/ENV' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>FLT/ENV</button>
                    <button onClick={() => setActiveTab('LFO/MOD')} className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${activeTab === 'LFO/MOD' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>LFO/MOD</button>
                    <button onClick={() => setActiveTab('PRESETS')} className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${activeTab === 'PRESETS' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>PRESETS</button>
                </div>
            </div>
            
            {/* Main content area */}
            <div className="flex-grow min-h-0 overflow-y-auto">
                {renderTabContent()}
            </div>

            {/* Global Controls Footer */}
            <div className="flex-shrink-0 p-1 grid grid-cols-2 gap-1">
                 <div className="bg-white shadow-md p-1.5 rounded-lg">
                    <Fader label="Gate" value={synth.globalGateTime} onChange={v => handleParamChange('globalGateTime', v)} min={0.01} max={4} step={0.001} defaultValue={0.2} />
                 </div>
                 <div className="bg-white shadow-md p-1.5 rounded-lg">
                    <Fader label="Mod Whl" value={synth.modWheel} onChange={v => handleParamChange('modWheel', v)} min={0} max={1} step={0.01} defaultValue={1} />
                 </div>
            </div>
        </div>
    );
};

// FIX: Add a default export to make the component importable.
export default SynthView;
