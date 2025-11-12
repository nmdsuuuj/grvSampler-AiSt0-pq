import React, { useContext, useState, useEffect, useRef } from 'react';
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
    const channels: Float32Array[] = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x4556157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    // write interleaved data
    for (i = 0; i < numOfChan; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++; // next source sample
    }

    return new Blob([view], { type: 'audio/wav' });
};


const SampleView: React.FC<SampleViewProps> = ({ playSample, startRecording, stopRecording, loadSampleFromBlob }) => {
    const { state, dispatch } = useContext(AppContext);
    const { activeSampleId, samples, activeSampleBank, isRecording, audioContext, isArmed, recordingThreshold, sampleClipboard } = state;
    const activeSample = samples[activeSampleId];
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [localName, setLocalName] = useState(activeSample?.name || '');

    useEffect(() => {
        setLocalName(activeSample?.name || '');
    }, [activeSample]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalName(e.target.value);
    };

    const handleNameBlur = () => {
        dispatch({
            type: ActionType.UPDATE_SAMPLE_NAME,
            payload: { sampleId: activeSampleId, name: localName },
        });
    };
    
    const handleThresholdChange = (uiValue: number) => {
        const actualValue = Math.pow(uiValue, 3);
        dispatch({ type: ActionType.SET_RECORDING_THRESHOLD, payload: actualValue });
    };
    const thresholdUiValue = Math.cbrt(recordingThreshold);
    const defaultThreshold = 0.1;

    if (!activeSample) {
        return <div className="text-center p-4">Select a sample</div>;
    }

    const handleParamChange = (param: 'pitch' | 'start' | 'volume' | 'decay', value: number) => {
        dispatch({
            type: ActionType.UPDATE_SAMPLE_PARAM,
            payload: { sampleId: activeSampleId, param, value },
        });
    };
    
    const handleSamplePadClick = (id: number) => {
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
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `${activeSample.name || 'sample'}.wav`;
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    };

    const handleFileImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            loadSampleFromBlob(file, activeSampleId, file.name.replace(/\.[^/.]+$/, ""));
             if (event.target) {
                event.target.value = '';
            }
        }
    };

    let buttonLabel = 'ARM';
    let buttonClasses = 'bg-slate-600';
    if (isArmed) {
        buttonLabel = 'ARMED';
        buttonClasses = 'bg-yellow-500 text-black animate-pulse';
    }
    if (isRecording) {
        buttonLabel = 'STOP';
        buttonClasses = 'bg-rose-500 text-white animate-pulse';
    }

    const sampleBankOffset = activeSampleBank * PADS_PER_BANK;

    return (
        <div className="flex flex-col h-full p-2 space-y-4">
            <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
            <div className="flex-shrink-0 space-y-2">
                <div className="flex justify-between items-center space-x-2">
                    <input
                        type="text"
                        value={localName}
                        onChange={handleNameChange}
                        onBlur={handleNameBlur}
                        className="bg-transparent text-lg font-bold w-full focus:outline-none focus:bg-slate-800 rounded px-2 py-1"
                    />
                     {!activeSample.buffer && (
                        <span className="text-sm text-slate-500 font-medium flex-shrink-0 pr-2">(EMPTY)</span>
                    )}
                    <button onClick={handleRecordClick} className={`px-4 py-3 text-sm font-bold rounded transition-colors ${buttonClasses} flex-shrink-0 w-24 text-center`}>
                        {buttonLabel}
                    </button>
                </div>
                 <div className="w-full">
                     <Fader 
                        label="Threshold"
                        value={thresholdUiValue}
                        displayValue={recordingThreshold}
                        onChange={handleThresholdChange}
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={Math.cbrt(defaultThreshold)}
                     />
                 </div>
            </div>
            
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
                                isArmed={isArmed && activeSampleId === sampleId}
                                isRecording={isRecording && activeSampleId === sampleId}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4 bg-slate-800 p-4 rounded-lg flex flex-col justify-center flex-grow">
                <div className="flex space-x-2 items-center flex-wrap gap-y-2">
                    <h3 className="text-lg font-bold text-slate-300">Parameters</h3>
                     <button onClick={() => dispatch({ type: ActionType.COPY_SAMPLE })} className="bg-slate-600 hover:bg-slate-500 text-white font-bold px-3 py-1.5 rounded text-xs">
                        Copy
                    </button>
                     <button 
                        onClick={() => dispatch({ type: ActionType.PASTE_SAMPLE })} 
                        className="bg-slate-600 hover:bg-slate-500 text-white font-bold px-3 py-1.5 rounded text-xs disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
                        disabled={!sampleClipboard}
                     >
                        Paste
                    </button>
                    <button onClick={handleFileImportClick} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded text-xs">
                       Import
                    </button>
                    <button onClick={handleExport} className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-3 py-1.5 rounded text-xs">
                        Export WAV
                    </button>
                </div>
                <Fader label="Pitch" value={activeSample.pitch} onChange={(val) => handleParamChange('pitch', val)} min={-24} max={24} step={0.01} defaultValue={0} />
                <Fader label="Start" value={activeSample.start} onChange={(val) => handleParamChange('start', val)} min={0} max={1} step={0.001} defaultValue={0} />
                <Fader label="Decay" value={activeSample.decay} onChange={(val) => handleParamChange('decay', val)} min={0.01} max={1} step={0.001} defaultValue={1} />
                <Fader label="Vol" value={activeSample.volume} onChange={(val) => handleParamChange('volume', val)} min={0} max={1} step={0.01} defaultValue={1} />
            </div>
        </div>
    );
};

export default SampleView;