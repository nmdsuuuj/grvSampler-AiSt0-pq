

import React, { useContext, useState } from 'react';
import { AppContext } from '../../context/AppContext';
// FIX: Import correct types from types.ts
import { ActionType, Synth, ModMatrix, SynthPreset } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';

interface SynthViewProps {
    playSynthNote: (detune: number, time?: number) => void;
}

const OSC_WAVEFORMS: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const LFO_WAVEFORMS: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf'];

const MOD_SOURCES = ['lfo1', 'lfo2', 'filterEnv'];
const MOD_DESTINATIONS = ['osc1Pitch', 'osc2Pitch', 'osc1FM', 'osc2FM', 'osc1Wave', 'osc2Wave', 'filterCutoff', 'filterQ'];


const SynthView: React.FC<SynthViewProps> = ({ playSynthNote }) => {
    const { state, dispatch } = useContext(AppContext);
    const { synth, synthModMatrix, synthPresets, synthModPatches } = state;

    const [presetBank, setPresetBank] = useState(0);
    const [modPatchBank, setModPatchBank] = useState(0);

    // FIX: Allow boolean values for parameters like oscillator sync.
    const handleParamChange = (paramPath: string, value: string | number | boolean) => {
        // FIX: Use correct action type from enum.
        dispatch({ type: ActionType.UPDATE_SYNTH_PARAM, payload: { path: paramPath, value } });
    };

    const handleMatrixToggle = (source: string, dest: string) => {
        const currentVal = synthModMatrix[source]?.[dest] ?? false;
        // FIX: Use correct action type from enum.
        dispatch({ type: ActionType.SET_SYNTH_MOD_MATRIX, payload: { source, dest, value: !currentVal } });
    };

    const handleRandomizeMatrix = () => {
        // FIX: Use correct action type from enum.
        dispatch({ type: ActionType.RANDOMIZE_SYNTH_MOD_MATRIX });
    };

    const handleSaveModPatch = () => {
        const name = prompt('Enter a name for the mod patch:', 'New Patch');
        if (name) {
            // FIX: Use correct action type from enum.
            dispatch({ type: ActionType.SAVE_SYNTH_MOD_PATCH, payload: { name, matrix: synthModMatrix } });
            alert('Modulation patch saved!');
        }
    };
    
    const handleSavePreset = () => {
        const name = prompt('Enter a name for the preset:', 'New Preset');
        if (name) {
            // FIX: Use correct action type from enum.
            dispatch({ type: ActionType.SAVE_SYNTH_PRESET, payload: { name, synth, matrix: synthModMatrix } });
            alert('Synth preset saved!');
        }
    };
    
    const handleLoadPreset = (preset: SynthPreset) => {
        // FIX: Use correct action type from enum.
        dispatch({ type: ActionType.LOAD_SYNTH_PRESET, payload: preset });
    };

    const renderControlSection = (title: string, children: React.ReactNode) => (
        <div className="bg-white shadow-md p-2 rounded-lg">
            <h3 className="text-center font-bold text-slate-600 mb-1">{title}</h3>
            {children}
        </div>
    );
    
    const MIN_FREQ = 20, MAX_FREQ = 20000;
    const linearToLog = (v: number) => MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, v);
    const logToLinear = (v: number) => (v <= MIN_FREQ) ? 0 : (v >= MAX_FREQ) ? 1 : Math.log(v / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);

    return (
        <div className="p-1 space-y-1 h-full overflow-y-auto">
            {/* Oscillators */}
            <div className="grid grid-cols-2 gap-1">
                {renderControlSection('Oscillator 1', (
                    <div className="space-y-1">
                        <select value={synth.osc1.type} onChange={e => handleParamChange('osc1.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-sm">
                            {OSC_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Detune" value={synth.osc1.detune} onChange={v => handleParamChange('osc1.detune', v)} min={-1200} max={1200} step={1} defaultValue={0} size="thin" displayPrecision={0} />
                        <Fader label="FM Depth" value={synth.osc1.fmDepth} onChange={v => handleParamChange('osc1.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} size="thin" displayPrecision={0} />
                        <Fader label="Waveshape" value={synth.osc1.waveshapeAmount} onChange={v => handleParamChange('osc1.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} size="thin" />
                        <button onClick={() => handleParamChange('osc1.sync', !synth.osc1.sync)} className={`w-full py-1 text-sm font-bold rounded ${synth.osc1.sync ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>Hard Sync</button>
                    </div>
                ))}
                {renderControlSection('Oscillator 2', (
                     <div className="space-y-1">
                        <select value={synth.osc2.type} onChange={e => handleParamChange('osc2.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-sm">
                            {OSC_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Detune" value={synth.osc2.detune} onChange={v => handleParamChange('osc2.detune', v)} min={-1200} max={1200} step={1} defaultValue={0} size="thin" displayPrecision={0} />
                        <Fader label="FM Depth" value={synth.osc2.fmDepth} onChange={v => handleParamChange('osc2.fmDepth', v)} min={0} max={5000} step={1} defaultValue={0} size="thin" displayPrecision={0} />
                        <Fader label="Waveshape" value={synth.osc2.waveshapeAmount} onChange={v => handleParamChange('osc2.waveshapeAmount', v)} min={0} max={1} step={0.01} defaultValue={0} size="thin" />
                    </div>
                ))}
            </div>

            {/* Filter & Envelopes */}
            <div className="grid grid-cols-2 gap-1">
                {renderControlSection('Filter', (
                    <div className="space-y-1">
                         <select value={synth.filter.type} onChange={e => handleParamChange('filter.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-sm">
                            {FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <Fader label="Cutoff" value={logToLinear(synth.filter.cutoff)} onChange={v => handleParamChange('filter.cutoff', linearToLog(v))} min={0} max={1} step={0.001} defaultValue={1} displayValue={synth.filter.cutoff} displayPrecision={0} size="thin" />
                        <Fader label="Resonance" value={synth.filter.resonance} onChange={v => handleParamChange('filter.resonance', v)} min={0} max={30} step={0.1} defaultValue={1} size="thin" />
                        <Fader label="Env Amt" value={synth.filter.envAmount} onChange={v => handleParamChange('filter.envAmount', v)} min={-5000} max={5000} step={10} defaultValue={0} size="thin" displayPrecision={0}/>
                    </div>
                ))}
                 {renderControlSection('Envelopes', (
                    <div className="space-y-1">
                        <Fader label="Filt ATK" value={synth.filterEnv.attack} onChange={v => handleParamChange('filterEnv.attack', v)} min={0.001} max={2} step={0.001} defaultValue={0.01} size="thin" />
                        <Fader label="Filt DCY" value={synth.filterEnv.decay} onChange={v => handleParamChange('filterEnv.decay', v)} min={0.001} max={2} step={0.001} defaultValue={0.2} size="thin" />
                        <Fader label="Filt SUS" value={synth.filterEnv.sustain} onChange={v => handleParamChange('filterEnv.sustain', v)} min={0} max={1} step={0.01} defaultValue={0.5} size="thin" />
                        <Fader label="Filt REL" value={synth.filterEnv.release} onChange={v => handleParamChange('filterEnv.release', v)} min={0.001} max={5} step={0.001} defaultValue={0.3} size="thin" />
                        <Fader label="Amp DCY" value={synth.ampEnv.decay} onChange={v => handleParamChange('ampEnv.decay', v)} min={0.001} max={5} step={0.001} defaultValue={0.5} size="thin" />
                    </div>
                ))}
            </div>
            
            {/* LFOs */}
            <div className="grid grid-cols-2 gap-1">
                {renderControlSection('LFO 1', (
                    <div className="space-y-1">
                        <select value={synth.lfo1.type} onChange={e => handleParamChange('lfo1.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-sm">
                            {LFO_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Rate" value={synth.lfo1.rate} onChange={v => handleParamChange('lfo1.rate', v)} min={0.1} max={30} step={0.1} defaultValue={5} size="thin" />
                    </div>
                ))}
                {renderControlSection('LFO 2', (
                    <div className="space-y-1">
                        <select value={synth.lfo2.type} onChange={e => handleParamChange('lfo2.type', e.target.value)} className="w-full bg-emerald-100 p-1 rounded text-sm">
                            {LFO_WAVEFORMS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <Fader label="Rate" value={synth.lfo2.rate} onChange={v => handleParamChange('lfo2.rate', v)} min={0.1} max={30} step={0.1} defaultValue={5} size="thin" />
                    </div>
                ))}
            </div>
            
             {/* Mod Matrix */}
            {renderControlSection('Modulation Matrix', (
                <div className="overflow-x-auto">
                    <table className="text-xs text-center border-collapse">
                        <thead>
                            <tr>
                                <th className="p-1 border border-emerald-200">Src/Dst</th>
                                {MOD_DESTINATIONS.map(d => <th key={d} className="p-1 border border-emerald-200 transform -rotate-45 h-16 w-8">{d}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {MOD_SOURCES.map(s => (
                                <tr key={s}>
                                    <td className="p-1 font-bold border border-emerald-200">{s}</td>
                                    {MOD_DESTINATIONS.map(d => (
                                        <td key={d} className="p-1 border border-emerald-200">
                                            <button onClick={() => handleMatrixToggle(s, d)} className={`w-6 h-6 rounded ${synthModMatrix[s]?.[d] ? 'bg-pink-400' : 'bg-emerald-100'}`}></button>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     <div className="flex gap-1 mt-2">
                        <button onClick={handleRandomizeMatrix} className="flex-1 bg-sky-400 text-white font-bold py-1 rounded text-sm">Random</button>
                        <button onClick={handleSaveModPatch} className="flex-1 bg-amber-400 text-white font-bold py-1 rounded text-sm">Save Patch</button>
                    </div>
                </div>
            ))}
            
            {/* Presets */}
            {renderControlSection('Presets', (
                <div className="space-y-2">
                     <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                            {[0,1,2,3].map(i => (
                                <button key={i} onClick={() => setPresetBank(i)} className={`px-3 py-1 text-xs font-bold rounded ${presetBank === i ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>B{i+1}</button>
                            ))}
                        </div>
                        <button onClick={handleSavePreset} className="bg-sky-500 text-white font-bold px-4 py-1 rounded text-sm">Save Preset</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: 16 }).map((_, i) => {
                            const presetIndex = presetBank * 16 + i;
                            const preset = synthPresets[presetIndex];
                            return (
                                <Pad
                                    key={i}
                                    id={presetIndex}
                                    label={`P${i+1}`}
                                    onClick={() => preset && handleLoadPreset(preset)}
                                    hasContent={!!preset}
                                    padType="pattern"
                                />
                            );
                        })}
                    </div>
                </div>
            ))}

             {/* Global */}
            {renderControlSection('Global', (
                 <Fader label="Gate Time" value={synth.globalGateTime} onChange={v => handleParamChange('globalGateTime', v)} min={0.01} max={4} step={0.01} defaultValue={0.5} />
            ))}
            
        </div>
    );
};

export default SynthView;