
import React, { useContext, useState, useEffect } from 'react';
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
                        <div className="flex items-center space-x-2">
                             <span className="font-bold text-sm text-slate-600 w-12">OSC 1</span>
                             <div className="flex-grow">
                                <Fader 
                                    value={OSC_WAVEFORMS.indexOf(synth.osc1.type)} 
                                    onChange={v => handleParamChange('osc1.type', OSC_WAVEFORMS[v])}
                                    min={0} 
                                    max={OSC_WAVEFORMS.length - 1} 
                                    step={1} 
                                    defaultValue={OSC_WAVEFORMS.indexOf('Saw Down')}
                                    hideInfo={true}
                                />
                             </div>
                             <span className="font-semibold text-xs text-slate-500 truncate w-20 text-right">{synth.osc1.type}</span>
                        </div>
                        <Fader label="Oct" value={synth.osc1.octave} onChange={v => handleParamChange('osc1.octave', v)} min={-4} max={2} step={1} defaultValue={0} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc1.detune} onChange={v => handleParamChange('osc1.detune', v)} min={-100} max={100} step={1} defaultValue={0} displayPrecision={0} />
                        <div className="flex items-center space-x-2">
                             <div className="flex-grow">
                                <Fader 
                                    value={WAVESHAPER_TYPES.indexOf(synth.osc1.waveshapeType)} 
                                    onChange={v => handleParamChange('osc1.waveshapeType', WAVESHAPER_TYPES[v])}
                                    min={0} 
                                    max={WAVESHAPER_TYPES.length - 1} 
                                    step={1} 
                                    defaultValue={0}
                                    hideInfo={true}
                                />
                             </div>
                             <span className="font-semibold text-[10px] text-slate-500 truncate w-24 text-right">{synth.osc1.waveshapeType}</span>
                        </div>
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
                        <div className="flex items-center space-x-2">
                             <span className="font-bold text-sm text-slate-600 w-12">OSC 2</span>
                             <div className="flex-grow">
                                <Fader 
                                    value={OSC_WAVEFORMS.indexOf(synth.osc2.type)} 
                                    onChange={v => handleParamChange('osc2.type', OSC_WAVEFORMS[v])}
                                    min={0} 
                                    max={OSC_WAVEFORMS.length - 1} 
                                    step={1} 
                                    defaultValue={OSC_WAVEFORMS.indexOf('Square')}
                                    hideInfo={true}
                                />
                             </div>
                             <span className="font-semibold text-xs text-slate-500 truncate w-20 text-right">{synth.osc2.type}</span>
                        </div>
                        <Fader label="Oct" value={synth.osc2.octave} onChange={v => handleParamChange('osc2.octave', v)} min={-4} max={2} step={1} defaultValue={-1} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc2.detune} onChange={v => handleParamChange('osc2.detune', v)} min={-7200} max={7200} step={1} defaultValue={7} displayPrecision={0} />
                         {synth.osc1.sync && (
                            <Fader label="P.Env" value={synth.osc2.pitchEnvAmount || 0} onChange={v => handleParamChange('osc2.pitchEnvAmount', v)} min={-7200} max={7200} step={1} defaultValue={0} displayPrecision={0} />
                        )}
                        <div className="flex items-center space-x-2">
                             <div className="flex-grow">
                                <Fader 
                                    value={WAVESHAPER_TYPES.indexOf(synth.osc2.waveshapeType)} 
                                    onChange={v => handleParamChange('osc2.waveshapeType', WAVESHAPER_TYPES[v])}
                                    min={0} 
                                    max={WAVESHAPER_TYPES.length - 1} 
                                    step={1} 
                                    defaultValue={0}
                                    hideInfo={true}
                                />
                             </div>
                             <span className="font-semibold text-[10px] text-slate-500 truncate w-24 text-right">{synth.osc2.waveshapeType}</span>
                        </div>
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
                            <div className="flex items-center space-x-2">
                                <div className="flex-grow">
                                    <Fader 
                                        value={FILTER_TYPES.indexOf(synth.filter.type)} 
                                        onChange={v => handleParamChange('filter.type', FILTER_TYPES[v])}
                                        min={0} 
                                        max={FILTER_TYPES.length - 1} 
                                        step={1} 
                                        defaultValue={0}
                                        hideInfo={true}
                                    />
                                </div>
                                <span className="font-semibold text-xs text-slate-500 truncate w-28 text-right">{synth.filter.type}</span>
                            </div>
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
                return (
                    <div className="p-1 h-full flex flex-col space-y-1">
                        <div className="flex justify-around gap-1 h-28">
                            {renderControlSection('', <>
                                <div className="h-10">
                                    <LfoVisualizer analyser={lfoAnalysers.current.lfo1} color="#f472b6" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <div className="flex-grow">
                                        <Fader 
                                            value={LFO_WAVEFORMS.indexOf(synth.lfo1.type)}
                                            onChange={v => handleParamChange('lfo1.type', LFO_WAVEFORMS[v])}
                                            min={0} max={LFO_WAVEFORMS.length - 1} step={1} defaultValue={0} hideInfo={true}
                                        />
                                    </div>
                                    <span className="font-semibold text-[10px] text-slate-500 truncate w-20 text-right">{synth.lfo1.type}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => handleParamChange('lfo1.rateMode', synth.lfo1.rateMode === 'hz' ? 'sync' : 'hz')} className="w-1/4 h-5 bg-emerald-100 p-1 rounded text-xs uppercase">{synth.lfo1.rateMode}</button>
                                    <div className="w-3/4 bg-emerald-50 rounded text-center py-1 text-xs font-bold text-slate-600">
                                        {synth.lfo1.rateMode === 'sync' ? LFO_SYNC_RATES[synth.lfo1.rate]?.label : synth.lfo1.rate.toFixed(2) + ' Hz'}
                                    </div>
                                </div>
                                {synth.lfo1.rateMode === 'hz' ? (
                                    <Fader hideInfo value={lfoRateToFaderValue(synth.lfo1.rate)} onChange={v => handleParamChange('lfo1.rate', faderValueToLfoRate(v))} min={0} max={1} step={0.001} defaultValue={lfoRateToFaderValue(5)} />
                                ) : (
                                    <Fader hideInfo value={synth.lfo1.rate} onChange={v => handleParamChange('lfo1.rate', v)} min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={8} />
                                )}
                                <button onClick={() => {
                                    const currentIndex = LFO_SYNC_TRIGGERS.indexOf(synth.lfo1.syncTrigger);
                                    const nextIndex = (currentIndex + 1) % LFO_SYNC_TRIGGERS.length;
                                    handleParamChange('lfo1.syncTrigger', LFO_SYNC_TRIGGERS[nextIndex]);
                                }} className="bg-emerald-100 p-1 rounded text-xs font-bold text-slate-600 w-full">Sync Trig: {synth.lfo1.syncTrigger}</button>
                            </>, "w-1/2")}
                            {renderControlSection('', <>
                                <div className="h-10">
                                    <LfoVisualizer analyser={lfoAnalysers.current.lfo2} color="#38bdf8" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <div className="flex-grow">
                                        <Fader 
                                            value={LFO_WAVEFORMS.indexOf(synth.lfo2.type)}
                                            onChange={v => handleParamChange('lfo2.type', LFO_WAVEFORMS[v])}
                                            min={0} max={LFO_WAVEFORMS.length - 1} step={1} defaultValue={0} hideInfo={true}
                                        />
                                    </div>
                                    <span className="font-semibold text-[10px] text-slate-500 truncate w-20 text-right">{synth.lfo2.type}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => handleParamChange('lfo2.rateMode', synth.lfo2.rateMode === 'hz' ? 'sync' : 'hz')} className="w-1/4 h-5 bg-emerald-100 p-1 rounded text-xs uppercase">{synth.lfo2.rateMode}</button>
                                    <div className="w-3/4 bg-emerald-50 rounded text-center py-1 text-xs font-bold text-slate-600">
                                        {synth.lfo2.rateMode === 'sync' ? LFO_SYNC_RATES[synth.lfo2.rate]?.label : synth.lfo2.rate.toFixed(2) + ' Hz'}
                                    </div>
                                </div>
                                {synth.lfo2.rateMode === 'hz' ? (
                                    <Fader hideInfo value={lfoRateToFaderValue(synth.lfo2.rate)} onChange={v => handleParamChange('lfo2.rate', faderValueToLfoRate(v))} min={0} max={1} step={0.001} defaultValue={lfoRateToFaderValue(5)} />
                                ) : (
                                    <Fader hideInfo value={synth.lfo2.rate} onChange={v => handleParamChange('lfo2.rate', v)} min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={8} />
                                )}
                                <button onClick={() => {
                                    const currentIndex = LFO_SYNC_TRIGGERS.indexOf(synth.lfo2.syncTrigger);
                                    const nextIndex = (currentIndex + 1) % LFO_SYNC_TRIGGERS.length;
                                    handleParamChange('lfo2.syncTrigger', LFO_SYNC_TRIGGERS[nextIndex]);
                                }} className="bg-emerald-100 p-1 rounded text-xs font-bold text-slate-600 w-full">Sync Trig: {synth.lfo2.syncTrigger}</button>
                            </>, "w-1/2")}
                        </div>
                        <div className="bg-white shadow-md p-1.5 rounded-lg flex-grow">
                            <div className="grid grid-cols-[40px_repeat(8,1fr)] gap-x-1 text-center text-xs">
                                {/* Row 1: Controls + Section Headers */}
                                <div className="flex flex-col items-center justify-center space-y-1">
                                    <button onClick={handleMuteMatrix} className={`w-full rounded p-1 text-[10px] font-bold transition-colors ${isModMatrixMuted ? 'bg-amber-400 text-white' : 'bg-emerald-200'}`}>Mute</button>
                                    <button onClick={handleClearMatrix} className="w-full bg-rose-200 text-rose-800 rounded p-1 text-[10px] font-bold hover:bg-rose-300 transition-colors">Clear</button>
                                    <button onClick={handleRandomizeMatrixOnly} className="w-full bg-sky-200 text-sky-800 rounded p-1 text-[10px] font-bold hover:bg-sky-300 transition-colors">Rnd</button>
                                </div>
                                <div className="col-span-3 text-center text-xs font-bold text-slate-500 border-b-2 border-emerald-200 pb-1">OSC 1</div>
                                <div className="col-span-3 text-center text-xs font-bold text-slate-500 border-b-2 border-emerald-200 pb-1">OSC 2</div>
                                <div className="col-span-2 text-center text-xs font-bold text-slate-500 border-b-2 border-emerald-200 pb-1">FLT</div>

                                {/* Row 2: Empty cell + Destination Labels */}
                                <div />
                                {MOD_DESTINATIONS.map(dest => (
                                    <div key={dest} className="h-6 flex items-center justify-center">
                                        <span className="font-semibold text-slate-500 text-xs">{destLabels[dest]}</span>
                                    </div>
                                ))}

                                {/* Rows 3-5: Source Labels + Modulation Nodes */}
                                {MOD_SOURCES.map(source => (
                                    <React.Fragment key={source}>
                                        <div className="h-12 flex items-center justify-center font-bold text-slate-600">
                                            {source}
                                        </div>
                                        {MOD_DESTINATIONS.map(dest => (
                                            <div key={`${source}-${dest}`} className="h-12 flex items-center justify-center">
                                                <ModulationNode
                                                    value={synthModMatrix[source]?.[dest] || 0}
                                                    onChange={(newValue) => handleMatrixChange(source, dest, newValue)}
                                                />
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'PRESETS': return (
                <div className="p-1 h-full">
                    {renderControlSection('PRESETS', 
                        <div className="space-y-1 flex-grow flex flex-col h-full">
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
                                <div className="flex space-x-1 items-center">
                                    <div className="flex-grow">
                                        {selectedPresetSlot !== null ? (
                                            <div className="flex items-center space-x-1">
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
                                            <p className="text-xs text-slate-500 text-center py-1">Select a slot to save or clear</p>
                                        )}
                                    </div>
                                    <button onClick={handleRandomizeAll} className="bg-rose-400 text-white font-bold px-2 py-1 rounded text-xs whitespace-nowrap">Rnd All</button>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-1.5 flex-grow">
                                {Array.from({ length: 16 }).map((_, i) => {
                                    const presetIndex = presetBank * 16 + i;
                                    const preset = synthPresets[presetIndex];
                                    const isActive = presetMode === 'SAVE' && selectedPresetSlot === presetIndex;
                                    return (
                                        <Pad
                                            key={i}
                                            id={presetIndex}
                                            label={preset?.name.substring(0, 4) || ``}
                                            onClick={() => handlePresetPadClick(presetIndex)}
                                            isActive={isActive}
                                            hasContent={!!preset}
                                            padType="pattern"
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    , "h-full flex flex-col")}
                </div>
            );
        }
    };

    return (
        <div className="p-1 h-full flex flex-col space-y-1">
            <div className="flex-shrink-0 grid grid-cols-4 gap-1 p-1 bg-emerald-200 rounded-lg">
                {(['OSC', 'FLT/ENV', 'LFO/MOD', 'PRESETS'] as SynthTab[]).map(tab => (
                     <button 
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-grow py-1.5 text-sm font-bold rounded-md transition-colors ${activeTab === tab ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-grow min-h-0">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default SynthView;
