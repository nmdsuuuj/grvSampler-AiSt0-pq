
import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, SynthPreset } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { OSC_WAVEFORMS, LFO_WAVEFORMS, FILTER_TYPES, WAVESHAPER_TYPES, MOD_SOURCES, MOD_DESTINATIONS, LFO_SYNC_RATES, LFO_SYNC_TRIGGERS } from '../../constants';
import ModulationNode from '../ModulationNode';
import LfoVisualizer from '../LfoVisualizer';
import { SubTab } from '../../App';

interface SynthViewProps {
    playSynthNote: (detune: number, time?: number) => void;
    lfoAnalysers: React.MutableRefObject<{ lfo1: AnalyserNode | null; lfo2: AnalyserNode | null; }>;
    setSubTabs: (tabs: SubTab[]) => void;
}

type SynthTab = 'OSC' | 'FLT/ENV' | 'LFO' | 'MOD' | 'PRESETS';
type PresetMode = 'LOAD' | 'SAVE';

const SynthView: React.FC<SynthViewProps> = ({ playSynthNote, lfoAnalysers, setSubTabs }) => {
    const { state, dispatch } = useContext(AppContext);
    const { synth, synthModMatrix, synthPresets, isModMatrixMuted, isModWheelLockMuted } = state;

    const [activeTab, setActiveTab] = useState<SynthTab>('OSC');
    const [presetBank, setPresetBank] = useState(0);
    const [selectedPresetSlot, setSelectedPresetSlot] = useState<number | null>(null);
    const [presetMode, setPresetMode] = useState<PresetMode>('LOAD');
    const [presetNameInput, setPresetNameInput] = useState('');

    useEffect(() => {
        setSubTabs([
            { label: 'OSC', onClick: () => setActiveTab('OSC'), isActive: activeTab === 'OSC' },
            { label: 'FLT/ENV', onClick: () => setActiveTab('FLT/ENV'), isActive: activeTab === 'FLT/ENV' },
            { label: 'LFO', onClick: () => setActiveTab('LFO'), isActive: activeTab === 'LFO' },
            { label: 'MOD', onClick: () => setActiveTab('MOD'), isActive: activeTab === 'MOD' },
            { label: 'PRESETS', onClick: () => setActiveTab('PRESETS'), isActive: activeTab === 'PRESETS' },
        ]);
    }, [activeTab, setSubTabs]);


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
    
    const handleMuteModWheelLock = () => {
        dispatch({ type: ActionType.TOGGLE_MOD_WHEEL_LOCK_MUTE });
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
                    {/* Left Column */}
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
                    {/* Right Column */}
                    <div className="flex flex-col space-y-1">
                        {renderControlSection('FLT ENV (ADS)', <>
                            <Fader 
                                label="A" 
                                value={Math.pow(synth.filterEnv.attack / 4, 1 / 4)} 
                                onChange={v => handleParamChange('filterEnv.attack', Math.max(0.001, Math.pow(v, 4) * 4))} 
                                min={0} 
                                max={1} 
                                step={0.001} 
                                defaultValue={Math.pow(0.01 / 4, 1 / 4)}
                                displayValue={synth.filterEnv.attack} 
                                displayPrecision={3}
                            />
                            <Fader 
                                label="D" 
                                value={Math.pow(synth.filterEnv.decay / 4, 1 / 4)} 
                                onChange={v => handleParamChange('filterEnv.decay', Math.max(0.001, Math.pow(v, 4) * 4))} 
                                min={0} 
                                max={1} 
                                step={0.001} 
                                defaultValue={Math.pow(0.2 / 4, 1 / 4)}
                                displayValue={synth.filterEnv.decay}
                                displayPrecision={3}
                            />
                            <Fader 
                                label="S" 
                                value={synth.filterEnv.sustain} 
                                onChange={v => handleParamChange('filterEnv.sustain', v)} 
                                min={0} 
                                max={1} 
                                step={0.01} 
                                defaultValue={0.5} 
                            />
                        </>)}
                        {renderControlSection('AMP ENV', <>
                            <Fader 
                                label="D" 
                                value={Math.pow(synth.ampEnv.decay / 5, 1 / 4)} 
                                onChange={v => handleParamChange('ampEnv.decay', Math.max(0.001, Math.pow(v, 4) * 5))} 
                                min={0} 
                                max={1} 
                                step={0.001} 
                                defaultValue={Math.pow(0.5 / 5, 1 / 4)} 
                                displayValue={synth.ampEnv.decay}
                                displayPrecision={3}
                            />
                        </>)}
                        {renderControlSection('MASTER', <>
                            <Fader label="Gain" value={synth.masterGain} onChange={v => handleParamChange('masterGain', v)} min={0} max={1.5} step={0.01} defaultValue={1} />
                            <Fader label="Octave" value={synth.masterOctave} onChange={v => handleParamChange('masterOctave', v)} min={-4} max={4} step={1} defaultValue={0} displayPrecision={0} />
                        </>)}
                    </div>
                </div>
            );
            case 'LFO': return (
                <div className="p-1 h-full grid grid-cols-2 gap-1 overflow-y-auto">
                    {renderControlSection('LFO 1',
                        <>
                            <Fader
                                label="Wave"
                                value={LFO_WAVEFORMS.indexOf(synth.lfo1.type)}
                                onChange={v => handleParamChange('lfo1.type', LFO_WAVEFORMS[v])}
                                min={0}
                                max={LFO_WAVEFORMS.length - 1}
                                step={1}
                                defaultValue={0}
                                displayString={synth.lfo1.type}
                            />
                            <div className="flex space-x-1">
                                <button onClick={() => handleParamChange('lfo1.rateMode', 'hz')} className={`flex-grow py-1 text-xs font-bold rounded ${synth.lfo1.rateMode === 'hz' ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>HZ</button>
                                <button onClick={() => handleParamChange('lfo1.rateMode', 'sync')} className={`flex-grow py-1 text-xs font-bold rounded ${synth.lfo1.rateMode === 'sync' ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>SYNC</button>
                            </div>
                            {synth.lfo1.rateMode === 'hz' ? (
                                <Fader label="Rate" value={lfoRateToFaderValue(synth.lfo1.rate)} onChange={v => handleParamChange('lfo1.rate', faderValueToLfoRate(v))} min={0} max={1} step={0.001} defaultValue={lfoRateToFaderValue(5)} displayValue={synth.lfo1.rate} />
                            ) : (
                                <Fader label="Rate" value={synth.lfo1.rate} onChange={v => handleParamChange('lfo1.rate', v)} min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={15} displayString={LFO_SYNC_RATES[synth.lfo1.rate]?.label || ''} />
                            )}
                            <div className="relative">
                                <LfoVisualizer analyser={lfoAnalysers.current.lfo1} color="#ec4899" />
                                {synth.lfo1.rateMode === 'sync' && (
                                     <button
                                        onClick={() => {
                                            const currentIndex = LFO_SYNC_TRIGGERS.indexOf(synth.lfo1.syncTrigger);
                                            const nextIndex = (currentIndex + 1) % LFO_SYNC_TRIGGERS.length;
                                            handleParamChange('lfo1.syncTrigger', LFO_SYNC_TRIGGERS[nextIndex]);
                                        }}
                                        className="absolute inset-0 bg-black/10 hover:bg-black/20 text-white text-xs font-bold rounded flex items-center justify-center"
                                    >
                                        {synth.lfo1.syncTrigger}
                                    </button>
                                )}
                            </div>
                        </>
                    , "flex flex-col space-y-1")}
                    {renderControlSection('LFO 2',
                        <>
                            <Fader
                                label="Wave"
                                value={LFO_WAVEFORMS.indexOf(synth.lfo2.type)}
                                onChange={v => handleParamChange('lfo2.type', LFO_WAVEFORMS[v])}
                                min={0}
                                max={LFO_WAVEFORMS.length - 1}
                                step={1}
                                defaultValue={0}
                                displayString={synth.lfo2.type}
                            />
                            <div className="flex space-x-1">
                                <button onClick={() => handleParamChange('lfo2.rateMode', 'hz')} className={`flex-grow py-1 text-xs font-bold rounded ${synth.lfo2.rateMode === 'hz' ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>HZ</button>
                                <button onClick={() => handleParamChange('lfo2.rateMode', 'sync')} className={`flex-grow py-1 text-xs font-bold rounded ${synth.lfo2.rateMode === 'sync' ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>SYNC</button>
                            </div>
                            {synth.lfo2.rateMode === 'hz' ? (
                                <Fader label="Rate" value={lfoRateToFaderValue(synth.lfo2.rate)} onChange={v => handleParamChange('lfo2.rate', faderValueToLfoRate(v))} min={0} max={1} step={0.001} defaultValue={lfoRateToFaderValue(2)} displayValue={synth.lfo2.rate} />
                            ) : (
                                <Fader label="Rate" value={synth.lfo2.rate} onChange={v => handleParamChange('lfo2.rate', v)} min={0} max={LFO_SYNC_RATES.length - 1} step={1} defaultValue={15} displayString={LFO_SYNC_RATES[synth.lfo2.rate]?.label || ''} />
                            )}
                             <div className="relative">
                                <LfoVisualizer analyser={lfoAnalysers.current.lfo2} color="#8b5cf6" />
                                 {synth.lfo2.rateMode === 'sync' && (
                                     <button
                                        onClick={() => {
                                            const currentIndex = LFO_SYNC_TRIGGERS.indexOf(synth.lfo2.syncTrigger);
                                            const nextIndex = (currentIndex + 1) % LFO_SYNC_TRIGGERS.length;
                                            handleParamChange('lfo2.syncTrigger', LFO_SYNC_TRIGGERS[nextIndex]);
                                        }}
                                        className="absolute inset-0 bg-black/10 hover:bg-black/20 text-white text-xs font-bold rounded flex items-center justify-center"
                                    >
                                        {synth.lfo2.syncTrigger}
                                    </button>
                                )}
                            </div>
                        </>
                    , "flex flex-col space-y-1")}
                </div>
            );
            case 'MOD': {
                const destLabels: { [key: string]: string } = {
                    osc1Pitch: 'Pitch', osc1Wave: 'Wave', osc1FM: 'FM',
                    osc2Pitch: 'Pitch', osc2Wave: 'Wave', osc2FM: 'FM',
                    filterCutoff: 'Cutoff', filterQ: 'Reso'
                };
                return (
                    <div className="p-1 h-full flex flex-col space-y-1">
                         {/* Mod Matrix */}
                        <div className="flex-grow bg-white shadow-md p-1.5 rounded-lg flex">
                            {/* Matrix Body */}
                            <div className="flex-grow flex">
                                 {/* Source Labels Column */}
                                <div className="w-1/6 flex-shrink-0 flex flex-col justify-around items-end pr-2 space-y-1">
                                    {MOD_SOURCES.map(source => (
                                        <div key={source} className="flex-1 flex flex-col items-end justify-center text-rose-500 font-bold text-sm">
                                            {source === 'filterEnv' ? 'Fenv' : source.toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                                 {/* Nodes Grid */}
                                <div className="flex-grow flex flex-col space-y-1">
                                    {/* Header */}
                                    <div className="flex-shrink-0 grid grid-cols-8 gap-1 text-center text-xs font-semibold text-slate-500">
                                        <div className="col-span-3 border-b">OSC 1</div>
                                        <div className="col-span-3 border-b">OSC 2</div>
                                        <div className="col-span-2 border-b">FILTER</div>
                                    </div>
                                    {/* Rows */}
                                    <div className="flex-grow grid grid-rows-3 gap-1">
                                        {MOD_SOURCES.map(source => (
                                            <div key={source} className="grid grid-cols-8 gap-1">
                                                {MOD_DESTINATIONS.map(dest => (
                                                    <ModulationNode 
                                                        key={`${source}-${dest}`}
                                                        label={destLabels[dest] || dest}
                                                        value={synthModMatrix[source]?.[dest] || 0}
                                                        onChange={v => handleMatrixChange(source, dest, v)}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Mod Wheel & Matrix Buttons */}
                            <div className="w-20 flex-shrink-0 flex flex-col items-center ml-2">
                                <h3 className="text-center font-bold text-slate-600 text-xs whitespace-nowrap mb-1">Mod Whl</h3>
                                <div className="flex-grow w-full flex space-x-2">
                                    <div className="flex-grow h-full flex justify-center">
                                        <Fader
                                            hideInfo
                                            value={synth.modWheel}
                                            onChange={v => handleParamChange('modWheel', v)}
                                            min={0} max={1} step={0.01} defaultValue={1}
                                            isVertical={true}
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end space-y-1">
                                        <button onClick={handleMuteModWheelLock} className={`text-xs font-bold px-2 py-1 rounded ${(isModWheelLockMuted ?? false) ? 'bg-yellow-400 text-slate-800' : 'bg-emerald-200 text-emerald-800'}`}>P.L Mute</button>
                                        <button onClick={handleRandomizeMatrixOnly} className="bg-sky-200 text-sky-800 text-xs font-bold px-2 py-1 rounded">Rnd</button>
                                        <button onClick={handleClearMatrix} className="bg-rose-200 text-rose-800 text-xs font-bold px-2 py-1 rounded">Clear</button>
                                        <button onClick={handleMuteMatrix} className={`text-xs font-bold px-2 py-1 rounded ${isModMatrixMuted ? 'bg-slate-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}>{isModMatrixMuted ? 'Mute' : 'Mute'}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
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

    return (
        <div className="flex flex-col h-full">
            {/* Main content area */}
            <div className="flex-grow min-h-0 overflow-y-auto">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default SynthView;
