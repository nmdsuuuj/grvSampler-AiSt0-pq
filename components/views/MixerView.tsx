import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType, MasterCompressorParams } from '../../types';
import Fader from '../Fader';
import { TOTAL_BANKS } from '../../constants';
import CpuMeter from '../CpuMeter';
import Pad from '../Pad';

interface MixerViewProps {
    startMasterRecording: () => void;
    stopMasterRecording: () => void;
}

const MixerView: React.FC<MixerViewProps> = ({ startMasterRecording, stopMasterRecording }) => {
    const { state, dispatch } = useContext(AppContext);
    const { 
        bankVolumes, bankPans, bankMutes, bankSolos, 
        masterVolume, isMasterRecording, isMasterRecArmed, 
        isInitialized, isPlaying,
        masterCompressorOn, masterCompressorParams,
        compressorSnapshots
    } = state;

    const [viewMode, setViewMode] = useState<'mixer' | 'fx'>('mixer');

    // State for compressor snapshots
    const [snapshotMode, setSnapshotMode] = useState<'LOAD' | 'SAVE'>('LOAD');
    const [snapshotPage, setSnapshotPage] = useState(0);
    const [selectedSnapshotSlot, setSelectedSnapshotSlot] = useState<number | null>(null);
    const [snapshotNameInput, setSnapshotNameInput] = useState('');

     useEffect(() => {
        if (snapshotMode === 'LOAD') {
            setSelectedSnapshotSlot(null);
        }
    }, [snapshotMode]);

    useEffect(() => {
        if (snapshotMode === 'SAVE' && selectedSnapshotSlot !== null) {
            const existingSnapshot = compressorSnapshots[selectedSnapshotSlot];
            setSnapshotNameInput(existingSnapshot?.name || `Snap ${selectedSnapshotSlot + 1}`);
        } else {
            setSnapshotNameInput('');
        }
    }, [selectedSnapshotSlot, snapshotMode, compressorSnapshots]);

    const handleVolumeChange = (bankIndex: number, volume: number) => {
        dispatch({ type: ActionType.SET_BANK_VOLUME, payload: { bankIndex, volume } });
    };
    
    const handlePanChange = (bankIndex: number, pan: number) => {
        dispatch({ type: ActionType.SET_BANK_PAN, payload: { bankIndex, pan } });
    };

    const handleMuteToggle = (bankIndex: number) => {
        dispatch({ type: ActionType.TOGGLE_BANK_MUTE, payload: { bankIndex } });
    };

    const handleSoloToggle = (bankIndex: number) => {
        dispatch({ type: ActionType.TOGGLE_BANK_SOLO, payload: { bankIndex } });
    };

    const handleMasterVolumeChange = (volume: number) => {
        dispatch({ type: ActionType.SET_MASTER_VOLUME, payload: volume });
    };
    
    const handleRecordToggle = () => {
        if (isMasterRecording) {
            stopMasterRecording();
        } else if (!isPlaying) { // Can only arm/disarm when sequencer is stopped
            dispatch({ type: ActionType.TOGGLE_MASTER_REC_ARMED });
        }
    };
    
    const handleCompressorToggle = () => {
        dispatch({ type: ActionType.TOGGLE_MASTER_COMPRESSOR });
    };

    const handleCompressorParamChange = (param: keyof MasterCompressorParams, value: number) => {
        dispatch({ type: ActionType.UPDATE_MASTER_COMPRESSOR_PARAM, payload: { param, value } });
    };

    const handleSnapshotPadClick = (snapshotIndex: number) => {
        if (snapshotMode === 'LOAD') {
            const snapshot = compressorSnapshots[snapshotIndex];
            if (snapshot) {
                dispatch({ type: ActionType.LOAD_COMPRESSOR_SNAPSHOT, payload: snapshot });
            }
        } else { // SAVE mode
            setSelectedSnapshotSlot(prev => (prev === snapshotIndex ? null : snapshotIndex));
        }
    };
    
    const handleSaveSnapshot = () => {
        if (selectedSnapshotSlot === null || !snapshotNameInput.trim()) return;
        const name = snapshotNameInput.trim();
        dispatch({
            type: ActionType.SAVE_COMPRESSOR_SNAPSHOT,
            payload: { index: selectedSnapshotSlot, name, params: masterCompressorParams }
        });
        alert(`Saved snapshot "${name}" to slot ${selectedSnapshotSlot + 1}.`);
        setSelectedSnapshotSlot(null);
    };

    const handleClearSnapshot = () => {
        if (selectedSnapshotSlot === null) return;
        const snapshotToClear = compressorSnapshots[selectedSnapshotSlot];
        if (snapshotToClear && window.confirm(`Are you sure you want to clear snapshot "${snapshotToClear.name}"?`)) {
            dispatch({ type: ActionType.CLEAR_COMPRESSOR_SNAPSHOT, payload: { index: selectedSnapshotSlot } });
        }
    };

    const renderMixer = () => (
        <div className="flex flex-grow gap-4">
            {/* Bank Channels */}
            <div className="grid grid-cols-4 gap-4 flex-grow">
                {Array.from({ length: TOTAL_BANKS }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center space-y-4">
                        <div className="w-full">
                            <Fader
                                label="Pan"
                                value={bankPans[i]}
                                onChange={(val) => handlePanChange(i, val)}
                                min={-1}
                                max={1}
                                step={0.01}
                                defaultValue={0}
                            />
                        </div>
                        <div className="flex w-full justify-around">
                            <button
                                onClick={() => handleMuteToggle(i)}
                                className={`w-8 h-8 rounded-md font-bold text-xs transition-colors ${bankMutes[i] ? 'bg-rose-500 text-white' : 'bg-slate-300 text-slate-600'}`}
                            >
                                M
                            </button>
                            <button
                                onClick={() => handleSoloToggle(i)}
                                className={`w-8 h-8 rounded-md font-bold text-xs transition-colors ${bankSolos[i] ? 'bg-yellow-400 text-slate-800' : 'bg-slate-300 text-slate-600'}`}
                            >
                                S
                            </button>
                        </div>
                        <div className="h-full w-full flex-grow">
                            <Fader
                                label={`Bank ${String.fromCharCode(65 + i)}`}
                                value={bankVolumes[i]}
                                onChange={(val) => handleVolumeChange(i, val)}
                                min={0}
                                max={1}
                                step={0.01}
                                defaultValue={1}
                                isVertical={true}
                            />
                        </div>
                    </div>
                ))}
            </div>
            {/* Master Channel */}
            <div className="w-1/4 flex flex-col items-center space-y-4 border-l-2 border-emerald-100 pl-4">
                <div className="flex flex-col items-center space-y-2">
                    <h3 className="font-bold text-slate-600">Master</h3>
                     <CpuMeter />
                    <button
                        onClick={handleRecordToggle}
                        disabled={!isInitialized || (isPlaying && !isMasterRecording)}
                        className={`w-12 h-12 rounded-full font-bold text-xs transition-colors flex items-center justify-center
                            ${isMasterRecording ? 'bg-rose-500 text-white animate-pulse' : isMasterRecArmed ? 'bg-yellow-400 text-slate-800' : 'bg-slate-300 text-slate-600'}
                            ${(!isInitialized || (isPlaying && !isMasterRecording)) && 'cursor-not-allowed bg-slate-200'}`}
                    >
                        {isMasterRecording ? 'STOP' : isMasterRecArmed ? 'ARMED' : 'REC'}
                    </button>
                </div>
                <div className="h-full w-full flex-grow">
                    <Fader
                        label="Vol"
                        value={masterVolume}
                        onChange={handleMasterVolumeChange}
                        min={0}
                        max={1.5} // Allow some boost
                        step={0.01}
                        defaultValue={1}
                        isVertical={true}
                    />
                </div>
            </div>
        </div>
    );
    
    const renderFx = () => (
        <div className="w-full flex flex-col items-center space-y-3 p-2 overflow-y-auto">
            <button
                onClick={handleCompressorToggle}
                className={`w-24 py-3 rounded font-bold text-white transition-colors ${masterCompressorOn ? 'bg-pink-500' : 'bg-slate-400'}`}
            >
                {masterCompressorOn ? 'ON' : 'OFF'}
            </button>
            <div className="w-full max-w-sm space-y-2">
                <Fader label="Thresh" value={masterCompressorParams.threshold} onChange={v => handleCompressorParamChange('threshold', v)} min={-100} max={0} step={1} defaultValue={-24} displayPrecision={0} />
                <Fader label="Ratio" value={masterCompressorParams.ratio} onChange={v => handleCompressorParamChange('ratio', v)} min={1} max={20} step={0.1} defaultValue={12} displayPrecision={1} />
                <Fader label="Knee" value={masterCompressorParams.knee} onChange={v => handleCompressorParamChange('knee', v)} min={0} max={40} step={1} defaultValue={30} displayPrecision={0} />
                <Fader label="Attack" value={masterCompressorParams.attack} onChange={v => handleCompressorParamChange('attack', v)} min={0} max={1} step={0.001} defaultValue={0.003} displayPrecision={3} />
                <Fader label="Release" value={masterCompressorParams.release} onChange={v => handleCompressorParamChange('release', v)} min={0.01} max={1} step={0.001} defaultValue={0.25} displayPrecision={3} />
            </div>

            <div className="w-full max-w-sm space-y-2 border-t-2 border-emerald-100 pt-3 mt-3">
                <h3 className="text-center font-bold text-slate-600">Compressor Snapshots</h3>
                <div className="flex justify-between items-center">
                    <div className="flex space-x-1 flex-wrap">
                        {[0,1,2,3].map(i => (
                            <button key={i} onClick={() => setSnapshotPage(i)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${snapshotPage === i ? 'bg-pink-400 text-white' : 'bg-emerald-200'}`}>P{i+1}</button>
                        ))}
                    </div>
                    <div className="flex p-0.5 bg-emerald-200 rounded-lg">
                        <button onClick={() => setSnapshotMode('LOAD')} className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${snapshotMode === 'LOAD' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>Load</button>
                        <button onClick={() => setSnapshotMode('SAVE')} className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${snapshotMode === 'SAVE' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}>Save</button>
                    </div>
                </div>

                 {snapshotMode === 'SAVE' && (
                    <div className="flex items-center space-x-1">
                        {selectedSnapshotSlot !== null ? (
                            <div className="flex-grow flex items-center space-x-1">
                                <input 
                                    type="text" 
                                    value={snapshotNameInput}
                                    onChange={(e) => setSnapshotNameInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveSnapshot()}
                                    className="w-full bg-emerald-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                                    placeholder="Snapshot Name"
                                />
                                <button onClick={handleSaveSnapshot} className="bg-sky-500 text-white font-bold px-2 py-1 rounded text-xs">Save</button>
                                <button onClick={handleClearSnapshot} disabled={!compressorSnapshots[selectedSnapshotSlot]} className="bg-rose-500 text-white font-bold px-2 py-1 rounded text-xs disabled:bg-slate-300">Clear</button>
                            </div>
                        ) : (
                             <p className="text-xs text-slate-500 text-center py-1 w-full">Select a slot to save or clear</p>
                        )}
                    </div>
                )}
                
                <div className="grid grid-cols-8 gap-1.5">
                    {Array.from({ length: 16 }).map((_, i) => {
                        const snapshotIndex = snapshotPage * 16 + i;
                        const snapshot = compressorSnapshots[snapshotIndex];
                        const isActive = snapshotMode === 'SAVE' && selectedSnapshotSlot === snapshotIndex;
                        return (
                            <Pad
                                key={i}
                                id={snapshotIndex}
                                label={snapshot?.name.substring(0, 4) || ``}
                                onClick={() => handleSnapshotPadClick(snapshotIndex)}
                                isActive={isActive}
                                hasContent={!!snapshot}
                                padType="pattern"
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full p-2">
            <div className="flex justify-between items-center flex-shrink-0 mb-4 px-2">
                 <h2 className="text-xl font-bold">
                    {viewMode === 'mixer' ? 'Channel Mixer' : 'Master FX'}
                </h2>
                <div className="flex space-x-1 p-1 bg-emerald-200 rounded-lg">
                    <button 
                        onClick={() => setViewMode('mixer')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'mixer' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}
                    >
                        Mixer
                    </button>
                    <button 
                        onClick={() => setViewMode('fx')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'fx' ? 'bg-white text-slate-800 shadow' : 'bg-transparent text-slate-600'}`}
                    >
                        FX
                    </button>
                </div>
            </div>
            <div className="flex-grow flex bg-white shadow-md p-2 rounded-lg overflow-hidden">
                {viewMode === 'mixer' ? renderMixer() : renderFx()}
            </div>
        </div>
    );
};

export default MixerView;