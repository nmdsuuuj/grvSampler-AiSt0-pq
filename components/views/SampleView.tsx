import React, { useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { PADS_PER_BANK } from '../../constants';
import BankSelector from '../BankSelector';

interface SampleViewProps {
    playSample: (id: number, time: number) => void;
    startRecording: () => void;
    stopRecording: () => void;
}

const SampleView: React.FC<SampleViewProps> = ({ playSample, startRecording, stopRecording }) => {
    const { state, dispatch } = useContext(AppContext);
    const { activeSampleId, samples, activeSampleBank, isRecording } = state;

    const activeSample = samples[activeSampleId];

    if (!activeSample) {
        return <div className="text-center p-4">Select a sample</div>;
    }

    const updateParam = (param: 'pitch' | 'start' | 'volume' | 'decay', value: number) => {
        dispatch({
            type: ActionType.UPDATE_SAMPLE_PARAM,
            payload: { sampleId: activeSampleId, param, value },
        });
    };
    
    const handleSamplePadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: id });
        if (samples[id].buffer) {
            playSample(id, 0);
        }
    };

    const handleRecordClick = () => {
        if(isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;

    return (
        <div className="flex flex-col h-full p-2 space-y-4">
            <div className="flex justify-between items-center flex-shrink-0">
                <h2 className="text-lg font-bold">SMPL {String.fromCharCode(65 + activeSampleBank)}{activeSampleId % PADS_PER_BANK + 1}</h2>
                <button onClick={handleRecordClick} className={`px-4 py-2 text-sm font-bold rounded ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-600'}`}>
                    {isRecording ? 'STOP' : 'REC'}
                </button>
            </div>
            
            {/* Top Section: Pads */}
            <div className="flex flex-col space-y-2 flex-shrink-0">
                <BankSelector type="sample"/>
                <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
                        const sampleId = sampleBankOffset + i;
                        const sample = samples[sampleId];
                        return (
                            <Pad
                                key={sampleId}
                                id={sampleId}
                                label={`${String.fromCharCode(65 + activeSampleBank)}${i + 1}`}
                                onClick={handleSamplePadClick}
                                isActive={activeSampleId === sampleId}
                                hasContent={!!sample.buffer}
                                isArmed={isRecording && activeSampleId === sampleId}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Bottom Section: Faders */}
            {activeSample.buffer ? (
                 <div className="space-y-4 bg-slate-800 p-4 rounded-lg flex flex-col justify-center flex-grow">
                    <Fader
                        label="Pitch"
                        value={activeSample.pitch}
                        onChange={(val) => updateParam('pitch', val)}
                        min={-24}
                        max={24}
                        step={0.01}
                        defaultValue={0}
                    />
                    <Fader
                        label="Start"
                        value={activeSample.start}
                        onChange={(val) => updateParam('start', val)}
                        min={0}
                        max={1}
                        step={0.001}
                        defaultValue={0}
                    />
                     <Fader
                        label="Decay"
                        value={activeSample.decay}
                        onChange={(val) => updateParam('decay', val)}
                        min={0.01}
                        max={1}
                        step={0.001}
                        defaultValue={1}
                    />
                    <Fader
                        label="Vol"
                        value={activeSample.volume}
                        onChange={(val) => updateParam('volume', val)}
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={1}
                    />
                </div>
            ) : (
                <div className="text-center text-slate-400 bg-slate-800 p-8 rounded-lg flex flex-col items-center justify-center flex-grow">
                    <p className="font-semibold">Empty Pad</p>
                    <p className="text-sm mt-2">Arm REC to record.</p>
                </div>
            )}
        </div>
    );
};

export default SampleView;