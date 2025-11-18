import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, SynthPreset } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { OSC_WAVEFORMS, LFO_WAVEFORMS, FILTER_TYPES, WAVESHAPER_TYPES, MOD_SOURCES, MOD_DESTINATIONS } from '../../constants';

interface SynthViewProps {
    playSynthNote: (detune: number, time?: number) => void;
}

type SynthTab = 'OSC' | 'FLT/ENV' | 'LFO/MOD' | 'PRESETS';
type PresetMode = 'LOAD' | 'SAVE';

const SynthView: React.FC<SynthViewProps> = ({ playSynthNote }) => {
    const { state, dispatch } = useContext(AppContext);
    const { synth, synthModMatrix, synthPresets } = state;

    const [activeTab, setActiveTab] = useState<SynthTab>('OSC');
    const [presetBank, setPresetBank] = useState(0);
    const [selectedPresetSlot, setSelectedPresetSlot] = useState<number | null>(null);
    const [presetMode, setPresetMode] = useState<PresetMode>('LOAD');

    // Clear selection when switching to LOAD mode for a cleaner UX
    useEffect(() => {
        if (presetMode === 'LOAD') {
            setSelectedPresetSlot(null);
        }
    }, [presetMode]);

    const handleParamChange = (paramPath: string, value: string | number | boolean) => {
        dispatch({ type: ActionType.UPDATE_SYNTH_PARAM, payload: { path: paramPath, value } });
    };

    const handleMatrixToggle = (source: string, dest: string) => {
        const currentVal = synthModMatrix[source]?.[dest] ?? false;
        dispatch({ type: ActionType.SET_SYNTH_MOD_MATRIX, payload: { source, dest, value: !currentVal } });
    };
    
    const handleRandomizeAll = () => {
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_PARAMS });
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_MOD_MATRIX });
    };
    
    const handleRandomizeMatrixOnly = () => {
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_MOD_MATRIX });
    };

    const handleSavePreset = () => {
        if (selectedPresetSlot === null) return;
        const currentPreset = synthPresets[selectedPresetSlot];
        const name = prompt("Enter preset name:", currentPreset?.name || `Preset ${selectedPresetSlot + 1}`);
        if (name) {
            dispatch({
                type: ActionType.SAVE_SYNTH_PRESET_AT_INDEX,
                payload: { index: selectedPresetSlot, name, synth, matrix: synthModMatrix }
            });
            alert(`Saved preset "${name}" to slot ${selectedPresetSlot + 1}.`);
        }
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
            // Toggle selection for save/clear operations
            setSelectedPresetSlot(prev => (prev === presetIndex ? null : presetIndex));
        }
    };

    const renderControlSection = (title: string, children: React.ReactNode, className: string = "") => (
        <div className={`bg-white shadow-md p-1.5 rounded-lg ${className}`}>
            <h3 className="text-center font-bold text-slate-600 mb-1 text-xs">{title}</h3>
            <div className="space-y-1">{children}</div>
        </div>
    );
    
    const MIN_FREQ = 20, MAX_FREQ = 20000;
    const linearToLog = (v: number) => MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, v);
    const logToLinear = (v: number) => (v <= MIN_FREQ) ? 0 : (v >= MAX_FREQ) ? 1 : Math.log(v / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);

    const renderTabContent = () => {
        switch(activeTab) {
            case 'OSC': return (
                <div className="p-1 h-full grid grid-cols-2 gap-1 overflow-hidden">
                    {renderControlSection('OSC 1', <>
                        <select value={synth.osc1.type} onChange={e => handleParamChange('osc1.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs">
                            {OSC_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Oct" value={synth.osc1.octave} onChange={v => handleParamChange('osc1.octave', v)} min={-2} max={2} step={1} defaultValue={0} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc1.detune} onChange={v => handleParamChange('osc1.detune', v)} min={-100} max={100} step={1} defaultValue={0} displayPrecision={0} />
                        <select value={synth.osc1.waveshapeType} onChange={e => handleParamChange('osc1.waveshapeType', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs text-center">
                            {WAVESHAPER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="WS Amt" value={synth.osc1.waveshapeAmount} onChange={v => handleParamChange('osc1.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                        <button onClick={() => handleParamChange('osc1.sync', !synth.osc1.sync)} className={`w-full py-1 text-xs font-bold rounded ${synth.osc1.sync ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>Sync</button>
                    </>)}
                    {renderControlSection('OSC 2', <>
                        <select value={synth.osc2.type} onChange={e => handleParamChange('osc2.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs">
                            {OSC_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Oct" value={synth.osc2.octave} onChange={v => handleParamChange('osc2.octave', v)} min={-2} max={2} step={1} defaultValue={-1} displayPrecision={0} />
                        <Fader label="Tune" value={synth.osc2.detune} onChange={v => handleParamChange('osc2.detune', v)} min={-1200} max={1200} step={1} defaultValue={7} displayPrecision={0} />
                        <select value={synth.osc2.waveshapeType} onChange={e => handleParamChange('osc2.waveshapeType', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs text-center">
                            {WAVESHAPER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="WS Amt" value={synth.osc2.waveshapeAmount} onChange={v => handleParamChange('osc2.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} />
                    </>)}
                </div>
            );
            case 'FLT/ENV': return (
                <div className="p-1 h-full grid grid-cols-2 gap-1 overflow-hidden">
                    <div className="flex flex-col space-y-1">
                        {renderControlSection('FLT', <>
                            <select value={synth.filter.type} onChange={e => handleParamChange('filter.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs">
                                {FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <Fader label="Cutoff" value={logToLinear(synth.filter.cutoff)} onChange={v => handleParamChange('filter.cutoff', linearToLog(v))} min={0} max={1} step={0.001} defaultValue={1} displayValue={synth.filter.cutoff} displayPrecision={0} />
                            <Fader label="Res" value={synth.filter.resonance} onChange={v => handleParamChange('filter.resonance', v)} min={0} max={30} step={0.1} defaultValue={1} />
                            <Fader label="Env Amt" value={synth.filter.envAmount} onChange={v => handleParamChange('filter.envAmount', v)} min={-7000} max={7000} step={10} defaultValue={0} displayPrecision={0}/>
                        </>)}
                        {renderControlSection('MIX', <>
                            <Fader label="Osc Mix" value={synth.oscMix} onChange={v => handleParamChange('oscMix', v)} min={0} max={1} step={0.01} defaultValue={0.5} />
                            <Fader label="FM 1>2" value={synth.osc1.fmDepth} onChange={v => handleParamChange('osc1.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} displayPrecision={0} />
                            <Fader label="FM 2>1" value={synth.osc2.fmDepth} onChange={v => handleParamChange('osc2.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} displayPrecision={0} />
                        </>)}
                    </div>
                    <div className="flex flex-col space-y-1">
                        {renderControlSection('AMP ENV (ADSR)', <>
                            <div className="grid grid-cols-2 gap-1">
                                <Fader label="A" value={synth.ampEnv.attack} onChange={v => handleParamChange('ampEnv.attack', v)} min={0.001} max={2} step={0.001} defaultValue={0.01} />
                                <Fader label="D" value={synth.ampEnv.decay} onChange={v => handleParamChange('ampEnv.decay', v)} min={0.001} max={5} step={0.001} defaultValue={0.5} />
                                <Fader label="S" value={synth.ampEnv.sustain} onChange={v => handleParamChange('ampEnv.sustain', v)} min={0} max={1} step={0.01} defaultValue={0.8} />
                                <Fader label="R" value={synth.ampEnv.release} onChange={v => handleParamChange('ampEnv.release', v)} min={0.001} max={5} step={0.001} defaultValue={0.3} />
                            </div>
                        </>)}
                         {renderControlSection('FLT ENV (ADSR)', <>
                            <div className="grid grid-cols-2 gap-1">
                                <Fader label="A" value={synth.filterEnv.attack} onChange={v => handleParamChange('filterEnv.attack', v)} min={0.001} max={2} step={0.001} defaultValue={0.01} />
                                <Fader label="D" value={synth.filterEnv.decay} onChange={v => handleParamChange('filterEnv.decay', v)} min={0.001} max={2} step={0.001} defaultValue={0.2} />
                                <Fader label="S" value={synth.filterEnv.sustain} onChange={v => handleParamChange('filterEnv.sustain', v)} min={0} max={1} step={0.01} defaultValue={0.5} />
                                <Fader label="R" value={synth.filterEnv.release} onChange={v => handleParamChange('filterEnv.release', v)} min={0.001} max={5} step={0.001} defaultValue={0.3} />
                            </div>
                        </>)}
                    </div>
                </div>
            );
            case 'LFO/MOD': return (
                <div className="p-1 h-full flex flex-col space-y-1">
                    <div className="flex justify-center gap-1">
                         {renderControlSection('LFO 1', <>
                            <select value={synth.lfo1.type} onChange={e => handleParamChange('lfo1.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs">
                                {LFO_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <Fader label="Rate" value={synth.lfo1.rate} onChange={v => handleParamChange('lfo1.rate', v)} min={0.1} max={30} step={0.1} defaultValue={5} />
                        </>, "w-2/5")}
                        {renderControlSection('LFO 2', <>
                            <select value={synth.lfo2.type} onChange={e => handleParamChange('lfo2.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-xs">
                                {LFO_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <Fader label="Rate" value={synth.lfo2.rate} onChange={v => handleParamChange('lfo2.rate', v)} min={0.1} max={30} step={0.1} defaultValue={5} />
                        </>, "w-2/5")}
                    </div>
                    {renderControlSection('MOD MATRIX', 
                        <div className="overflow-x-auto">
                            <table className="text-[9px] text-center border-collapse">
                                <thead>
                                    <tr>
                                        <th className="p-1 border border-emerald-200 align-middle">
                                            <button
                                                onClick={handleRandomizeMatrixOnly}
                                                className="w-full bg-sky-200 text-sky-800 rounded p-1 text-[10px] font-bold hover:bg-sky-300 transition-colors"
                                            >
                                                Rnd
                                            </button>
                                        </th>
                                        {MOD_DESTINATIONS.map(d => <th key={d} className="p-0.5 border border-emerald-200 transform -rotate-45 h-12 w-5 font-normal">{d}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {MOD_SOURCES.map(s => (
                                        <tr key={s}>
                                            <td className="p-1 font-bold border border-emerald-200">{s}</td>
                                            {MOD_DESTINATIONS.map(d => (
                                                <td key={d} className="p-0.5 border border-emerald-200">
                                                    <button onClick={() => handleMatrixToggle(s, d)} className={`w-4 h-4 rounded-sm ${synthModMatrix[s]?.[d] ? 'bg-pink-400' : 'bg-emerald-100'}`}></button>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    , "flex-grow")}
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
                                <div className="flex space-x-1 items-center justify-end">
                                    <button onClick={handleRandomizeAll} className="bg-rose-400 text-white font-bold px-2 py-0.5 rounded text-xs">RndAll</button>
                                    <button onClick={handleSavePreset} disabled={selectedPresetSlot === null} className="bg-sky-500 text-white font-bold px-2 py-0.5 rounded text-xs disabled:bg-slate-300">Save</button>
                                    <button onClick={handleClearPreset} disabled={selectedPresetSlot === null || !synthPresets[selectedPresetSlot]} className="bg-rose-500 text-white font-bold px-2 py-0.5 rounded text-xs disabled:bg-slate-300">Clear</button>
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