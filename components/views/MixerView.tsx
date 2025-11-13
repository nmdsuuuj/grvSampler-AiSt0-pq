import React, { useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType } from '../../types';
import Fader from '../Fader';
import { TOTAL_BANKS } from '../../constants';

interface MixerViewProps {
    startMasterRecording: () => void;
    stopMasterRecording: () => void;
}

const MixerView: React.FC<MixerViewProps> = ({ startMasterRecording, stopMasterRecording }) => {
    const { state, dispatch } = useContext(AppContext);
    const { bankVolumes, bankPans, bankMutes, bankSolos, masterVolume, isMasterRecording, isMasterRecArmed, isInitialized, isPlaying } = state;

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

    return (
        <div className="flex flex-col h-full p-2">
            <h2 className="text-xl font-bold text-center flex-shrink-0 mb-4">Mixer</h2>
            <div className="flex-grow flex bg-white shadow-md p-4 rounded-lg gap-4">
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
                                    className={`w-10 h-10 rounded-md font-bold text-sm transition-colors ${bankMutes[i] ? 'bg-rose-500 text-white' : 'bg-slate-300 text-slate-600'}`}
                                >
                                    M
                                </button>
                                <button
                                    onClick={() => handleSoloToggle(i)}
                                    className={`w-10 h-10 rounded-md font-bold text-sm transition-colors ${bankSolos[i] ? 'bg-yellow-400 text-slate-800' : 'bg-slate-300 text-slate-600'}`}
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
                <div className="w-1/5 flex flex-col items-center space-y-4 border-l-2 border-emerald-100 pl-4">
                    <div className="flex flex-col items-center space-y-2">
                        <h3 className="font-bold text-slate-600">Master</h3>
                        <button
                            onClick={handleRecordToggle}
                            disabled={!isInitialized || (isPlaying && !isMasterRecording)}
                            className={`w-14 h-14 rounded-full font-bold text-sm transition-colors flex items-center justify-center
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
        </div>
    );
};

export default MixerView;