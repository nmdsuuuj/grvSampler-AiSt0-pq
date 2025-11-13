import React, { useContext, useState, useRef } from 'react';
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
    loadSampleFromBlob: (blob: Blob, sampleId: number, name?: string) => Promise<void>;
}

// Helper function to encode AudioBuffer to a WAV Blob
const encodeWav = (audioBuffer: AudioBuffer): Blob => {
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };
    const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    const channels: Float32Array[] = [];
    for (let i = 0; i < numOfChan; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([view], { type: 'audio/wav' });
};


const SampleView: React.FC<SampleViewProps> = ({ playSample, startRecording, stopRecording, loadSampleFromBlob }) => {
    const { state, dispatch } = useContext(AppContext);
    const { activeSampleId, samples, activeSampleBank, isRecording, audioContext, isArmed, recordingThreshold, sampleClipboard } = state;
    const activeSample = samples[activeSampleId];
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSamplingMode, setIsSamplingMode] = useState(true);

    const handleParamChange = (param: 'pitch' | 'start' | 'volume' | 'decay' | 'lpFreq' | 'hpFreq', value: number) => {
        dispatch({
            type: ActionType.UPDATE_SAMPLE_PARAM,
            payload: { sampleId: activeSampleId, param, value },
        });
    };

    const handleSamplePadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: id });
        if (samples[id]?.buffer) {
            audioContext?.resume().then(() => playSample(id, 0));
        }
    };

    const handleRecordClick = () => {
        if (isRecording || isArmed) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleExport = () => {
        if (!activeSample.buffer) {
            alert("No audio content to export.");
            return;
        }
        const wavBlob = encodeWav(activeSample.buffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeSample.name || 'sample'}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleFileImportClick = () => fileInputRef.current?.click();

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            loadSampleFromBlob(file, activeSampleId, file.name.replace(/\.[^/.]+$/, ""));
            if (event.target) event.target.value = '';
        }
    };
    
    const handleThresholdChange = (uiValue: number) => {
        // Use a 4th power curve for more precision at lower values
        const actualValue = Math.pow(uiValue, 4);
        dispatch({ type: ActionType.SET_RECORDING_THRESHOLD, payload: actualValue });
    };

    const MIN_FREQ = 20, MAX_FREQ = 20000;
    const linearToLog = (v: number) => MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, v);
    const logToLinear = (v: number) => (v <= MIN_FREQ) ? 0 : (v >= MAX_FREQ) ? 1 : Math.log(v / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);

    if (!activeSample) return <div className="p-4 text-center">Select a sample</div>;

    const buttonLabel = isRecording ? 'STOP' : isArmed ? 'ARMED' : 'ARM';
    
    let armButtonClasses = 'bg-rose-300 hover:bg-rose-400 text-rose-800'; // Default
    if (isArmed) {
        armButtonClasses = 'bg-yellow-400 text-slate-800 animate-pulse'; // Armed (waiting)
    }
    if (isRecording) {
        armButtonClasses = 'bg-red-500 text-white animate-pulse'; // Recording
    }

    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;
    const activeSampleLabel = `${String.fromCharCode(65 + activeSampleBank)}${(activeSampleId % PADS_PER_BANK) + 1}`;

    return (
        <div className="flex flex-col h-full p-1 space-y-1">
            <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />

            <div className="flex items-center justify-between space-x-2 flex-shrink-0 bg-white shadow p-1 rounded-lg">
                <div className="flex items-center space-x-2">
                    <div className="bg-emerald-100 rounded-md px-3 py-2 flex-shrink-0">
                        <span className="font-bold text-lg text-slate-700">{activeSampleLabel}</span>
                        {!activeSample.buffer && <span className="text-xs text-slate-400 font-medium ml-2">(EMPTY)</span>}
                    </div>
                    <BankSelector type="sample" />
                </div>
                <button 
                    onClick={() => setIsSamplingMode(!isSamplingMode)}
                    className={`px-3 py-2 text-xs font-bold rounded-md transition-colors ${isSamplingMode ? 'bg-sky-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
                >
                    {isSamplingMode ? 'SAMPLING' : 'PARAMS'}
                </button>
            </div>
            
            <div className="grid grid-cols-8 gap-1 flex-shrink-0">
                {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
                    const sampleId = sampleBankOffset + i;
                    return <Pad key={sampleId} id={sampleId} label={`${String.fromCharCode(65 + activeSampleBank)}${i + 1}`} onClick={handleSamplePadClick} isActive={activeSampleId === sampleId} hasContent={!!samples[sampleId].buffer} isArmed={isArmed && activeSampleId === sampleId} isRecording={isRecording && activeSampleId === sampleId} padType="sample" />;
                })}
            </div>

            <div className="bg-white shadow-md p-2 rounded-lg flex flex-col justify-around flex-grow">
                {isSamplingMode ? (
                    <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-1 text-center">
                            <button onClick={handleRecordClick} className={`py-2 text-sm font-bold rounded transition-colors ${armButtonClasses}`}>{buttonLabel}</button>
                            <button onClick={() => dispatch({ type: ActionType.COPY_SAMPLE })} className="bg-emerald-200 hover:bg-emerald-300 text-slate-800 font-bold py-2 rounded text-xs">Copy</button>
                            <button onClick={() => dispatch({ type: ActionType.PASTE_SAMPLE })} disabled={!sampleClipboard} className="bg-emerald-200 hover:bg-emerald-300 text-slate-800 font-bold py-2 rounded text-xs disabled:bg-emerald-100 disabled:text-emerald-400 disabled:cursor-not-allowed">Paste</button>
                            <button onClick={handleFileImportClick} className="bg-emerald-400 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs">Imprt</button>
                            <button onClick={handleExport} className="bg-emerald-400 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs">Exprt</button>
                        </div>
                        <div>
                            <Fader label="Threshold" value={Math.pow(recordingThreshold, 1/4)} displayValue={recordingThreshold} onChange={handleThresholdChange} min={0} max={1} step={0.01} defaultValue={Math.pow(0.02, 1/4)} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Fader label="LP" value={logToLinear(activeSample.lpFreq)} onChange={(v) => handleParamChange('lpFreq', linearToLog(v))} min={0} max={1} step={0.001} defaultValue={1} displayValue={activeSample.lpFreq} displayPrecision={0} />
                        <Fader label="HP" value={logToLinear(activeSample.hpFreq)} onChange={(v) => handleParamChange('hpFreq', linearToLog(v))} min={0} max={1} step={0.001} defaultValue={0} displayValue={activeSample.hpFreq} displayPrecision={0} />
                    </div>
                )}
                
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <Fader label="Pitch" value={activeSample.pitch} onChange={(val) => handleParamChange('pitch', val)} min={-24} max={24} step={0.01} defaultValue={0} />
                    <Fader label="Start" value={activeSample.start} onChange={(val) => handleParamChange('start', val)} min={0} max={1} step={0.001} defaultValue={0} />
                    <Fader label="Decay" value={activeSample.decay} onChange={(val) => handleParamChange('decay', val)} min={0.01} max={1} step={0.001} defaultValue={1} />
                    <Fader label="Vol" value={activeSample.volume} onChange={(val) => handleParamChange('volume', val)} min={0} max={1} step={0.01} defaultValue={1} />
                </div>
            </div>
        </div>
    );
};

export default SampleView;