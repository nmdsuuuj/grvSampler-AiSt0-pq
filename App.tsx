

import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { AppContext } from './context/AppContext';
import { Action, ActionType, PlaybackParams } from './types';

import Transport from './components/Transport';
import TabButton from './components/TabButton';
import SampleView from './components/views/SampleView';
import SeqView from './components/views/SeqView';
import GrooveView from './components/views/GrooveView';
import MixerView from './components/views/MixerView';
import ProjectView from './components/views/ProjectView';
import MidiTemplateManager from './components/MidiTemplateManager';

import { useAudioEngine } from './hooks/useAudioEngine';
import { useSequencer } from './hooks/useSequencer';
import { useMidi } from './hooks/useMidi';
import { PADS_PER_BANK } from './constants';
import SCALES from './scales';
import { MidiMapping } from './types';

type View = 'SAMPLE' | 'SEQ' | 'GROOVE' | 'MIXER' | 'PROJECT';

const App: React.FC = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeView, setActiveView] = useState<View>('SAMPLE');
  
  // Use a ref to hold the latest state to avoid stale closures in callbacks.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeViewRef = useRef(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);


  // Initialize Audio Context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!state.isInitialized) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContext.resume().then(() => {
          dispatch({ type: ActionType.INITIALIZE_AUDIO, payload: audioContext });
        });
      }
      // Remove the listener after it's been used once.
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };

    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);

    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
  }, [state.isInitialized, dispatch]);

  const { 
    playSample, 
    loadSampleFromBlob, 
    startRecording, 
    stopRecording,
    startMasterRecording,
    stopMasterRecording,
  } = useAudioEngine();
  useSequencer(playSample);

  // MIDI Learn and Control handling
  const handleMidiMessage = useCallback((cc: number, value: number) => {
    const { state: appState, dispatch: appDispatch } = { state: stateRef.current, dispatch };
    
    // Normalize MIDI value (0-127) to 0-1
    const normalizedValue = value / 127;

    // Helper function to get min/max for a parameter
    const getParamMinMax = (paramId: string): { min: number; max: number } => {
      let min = 0;
      let max = 1;
      
      if (paramId.startsWith('sample.')) {
        const [, sampleIdStr, param] = paramId.split('.');
        const sampleId = parseInt(sampleIdStr, 10);
        const sample = appState.samples[sampleId];
        if (sample) {
          switch (param) {
            case 'volume':
            case 'start':
            case 'decay':
              min = 0; max = 1;
              break;
            case 'pitch':
              min = -24; max = 24;
              break;
            case 'lpFreq':
            case 'hpFreq':
              min = 20; max = 20000;
              break;
          }
        }
      } else if (paramId.startsWith('bank.')) {
        const [, bankIdStr, param] = paramId.split('.');
        if (param === 'volume') {
          min = 0; max = 1;
        } else if (param === 'pan') {
          min = -1; max = 1;
        }
      } else if (paramId === 'master.volume') {
        min = 0; max = 1.5;
      } else if (paramId.startsWith('compressor.')) {
        const param = paramId.split('.')[1] as keyof typeof appState.masterCompressorParams;
        switch (param) {
          case 'threshold':
            min = -100; max = 0;
            break;
          case 'ratio':
            min = 1; max = 20;
            break;
          case 'knee':
            min = 0; max = 40;
            break;
          case 'attack':
          case 'release':
            min = 0; max = 1;
            break;
        }
      }
      return { min, max };
    };

    // If in MIDI learn mode, create a mapping
    if (appState.midiLearnMode) {
      const paramId = appState.midiLearnMode;
      const { min, max } = getParamMinMax(paramId);
      
      // Check if this CC already has a mapping
      const existingMapping = appState.midiMappings.find(m => m.cc === cc);
      
      if (existingMapping) {
        // Add to existing CC mapping
        appDispatch({ 
          type: ActionType.ADD_MIDI_MAPPING_TO_CC, 
          payload: { cc, paramId } 
        });
      } else {
        // Create new mapping
        const mapping: MidiMapping = {
          cc,
          paramIds: [paramId],
          min,
          max,
        };
        appDispatch({ type: ActionType.ADD_MIDI_MAPPING, payload: mapping });
      }
      return;
    }

    // Otherwise, apply mappings if they exist
    const mapping = appState.midiMappings.find(m => m.cc === cc);
    if (mapping) {
      // Apply to all parameters mapped to this CC
      mapping.paramIds.forEach(paramId => {
        const { min, max } = getParamMinMax(paramId);
        const paramValue = min + (normalizedValue * (max - min));
        
        if (paramId.startsWith('sample.')) {
          const [, sampleIdStr, param] = paramId.split('.');
          const sampleId = parseInt(sampleIdStr, 10);
          const paramName = param as 'volume' | 'pitch' | 'start' | 'decay' | 'lpFreq' | 'hpFreq';
          
          // Handle log scale for frequencies
          if (paramName === 'lpFreq' || paramName === 'hpFreq') {
            const MIN_FREQ = 20, MAX_FREQ = 20000;
            const linearValue = normalizedValue;
            const logValue = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, linearValue);
            appDispatch({
              type: ActionType.UPDATE_SAMPLE_PARAM,
              payload: { sampleId, param: paramName, value: logValue },
            });
          } else {
            appDispatch({
              type: ActionType.UPDATE_SAMPLE_PARAM,
              payload: { sampleId, param: paramName, value: paramValue },
            });
          }
        } else if (paramId.startsWith('bank.')) {
          const [, bankIdStr, param] = paramId.split('.');
          const bankIndex = parseInt(bankIdStr, 10);
          if (param === 'volume') {
            appDispatch({ type: ActionType.SET_BANK_VOLUME, payload: { bankIndex, volume: paramValue } });
          } else if (param === 'pan') {
            appDispatch({ type: ActionType.SET_BANK_PAN, payload: { bankIndex, pan: paramValue } });
          }
        } else if (paramId === 'master.volume') {
          appDispatch({ type: ActionType.SET_MASTER_VOLUME, payload: paramValue });
        } else if (paramId.startsWith('compressor.')) {
          const param = paramId.split('.')[1] as keyof typeof appState.masterCompressorParams;
          appDispatch({
            type: ActionType.UPDATE_MASTER_COMPRESSOR_PARAM,
            payload: { param, value: paramValue },
          });
        }
      });
    }
  }, [dispatch]);

  useMidi(handleMidiMessage);

  // --- PC Keyboard Controls ---
  const handlePCKeyboardInput = useCallback((event: KeyboardEvent) => {
      // Prevent rapid-fire triggering when a key is held down.
      if (event.repeat) {
          return;
      }
  
      const { state: appState, dispatch: appDispatch } = { state: stateRef.current, dispatch };
      const currentActiveView = activeViewRef.current;

      const { 
          activeSampleBank, activeKey, activeScale, keyboardOctave, seqMode, 
          isPlaying, currentSteps, activePatternIds, activeSampleId,
          isRecording, isArmed, samples
      } = appState;
  
      // Prevent handling if a text-based input field is focused, but allow faders.
      const targetElement = event.target as HTMLElement;
      if (targetElement.tagName === 'INPUT') {
        const inputEl = targetElement as HTMLInputElement;
        // Block only for text-like inputs, not for range sliders (faders).
        if (inputEl.type === 'text' || inputEl.type === 'number') {
            return;
        }
      }
      if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'SELECT') {
          return;
      }


      // Use event.key directly, toLowerCase() can cause issues with keys like '/'
      const key = event.key;
  
      // --- View-specific shortcuts (Sampling) ---
      if (currentActiveView === 'SAMPLE') {
          switch (key.toLowerCase()) {
              case 'q':
                  if (isRecording || isArmed) {
                      stopRecording();
                  } else {
                      startRecording();
                  }
                  return; // Consume event
              case 'w':
                  appDispatch({ type: ActionType.COPY_SAMPLE });
                  return;
              case 'e':
                  appDispatch({ type: ActionType.PASTE_SAMPLE });
                  return;
          }
      }

      // --- Global Controls ---
      switch (key.toLowerCase()) {
          // Octave controls
          case 'a':
              appDispatch({ type: ActionType.SET_KEYBOARD_OCTAVE, payload: Math.max(0, keyboardOctave - 1) });
              return;
          case 'f':
              appDispatch({ type: ActionType.SET_KEYBOARD_OCTAVE, payload: Math.min(8, keyboardOctave + 1) });
              return;
          // Key controls
          case 'k':
              appDispatch({ type: ActionType.SET_KEY, payload: (activeKey - 1 + 12) % 12 });
              return;
          case 'l':
              appDispatch({ type: ActionType.SET_KEY, payload: (activeKey + 1) % 12 });
              return;
      }
      
      // Scale controls (don't convert to lower case)
      switch (key) {
        case '/':
            const currentIndexDown = SCALES.findIndex(s => s.name === activeScale);
            const prevIndex = (currentIndexDown - 1 + SCALES.length) % SCALES.length;
            appDispatch({ type: ActionType.SET_SCALE, payload: SCALES[prevIndex].name });
            return;
        case '\\':
            const currentIndexUp = SCALES.findIndex(s => s.name === activeScale);
            const nextIndex = (currentIndexUp + 1) % SCALES.length;
            appDispatch({ type: ActionType.SET_SCALE, payload: SCALES[nextIndex].name });
            return;
      }
  
      // --- Bank Selection ---
      const bankMap: { [key: string]: number } = { '9': 0, '0': 1, '-': 2, '^': 3 };
      if (bankMap[key] !== undefined) {
          appDispatch({ type: ActionType.SET_ACTIVE_SAMPLE_BANK, payload: bankMap[key] });
          return;
      }
  
      // --- Pad Triggering / Selection ---
      const padNumber = parseInt(key, 10);
      if (padNumber >= 1 && padNumber <= PADS_PER_BANK) {
          const sampleIdToTrigger = activeSampleBank * PADS_PER_BANK + (padNumber - 1);
          
          appDispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: sampleIdToTrigger });

          if (samples[sampleIdToTrigger]?.buffer) {
               playSample(sampleIdToTrigger, 0);
          }
          return;
      }
  
      // --- Note Playing (Physical Keyboard Model) ---
      const keyMap: { [key: string]: number } = {
        'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4, 'v': 5, 'g': 6,
        'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11, ',': 12,
      };

      const chromaticIndex = keyMap[key.toLowerCase()];
      if (chromaticIndex !== undefined) {
        const scale = SCALES.find(s => s.name === activeScale);
        let noteInCents: number;

        if (!scale || scale.name === 'Chromatic' || scale.name === 'Thru' || scale.intervals.length === 0) {
            noteInCents = chromaticIndex * 100;
        } else {
            const scaleOctaveNotes = [0];
            let currentCents = 0;
            for (const interval of scale.intervals) {
                currentCents += interval;
                scaleOctaveNotes.push(currentCents);
            }
            const octaveSpan = scaleOctaveNotes.pop() || 1200;
            const numNotesInScale = scaleOctaveNotes.length;

            const finalKeyboardNotes = [];
            for (let i = 0; i < 13; i++) {
                const octave = Math.floor(i / numNotesInScale);
                const noteIndexInScale = i % numNotesInScale;
                const note = scaleOctaveNotes[noteIndexInScale] + (octave * octaveSpan);
                finalKeyboardNotes.push(note);
            }
            noteInCents = finalKeyboardNotes[chromaticIndex];
        }

        if (noteInCents !== undefined) {
            const detuneWithKeyAndOctave = noteInCents + (activeKey * 100) + ((keyboardOctave - 4) * 1200);
            const playbackParams: Partial<PlaybackParams> = { detune: detuneWithKeyAndOctave };
            playSample(activeSampleId, 0, playbackParams);
    
            if (seqMode === 'REC' && isPlaying) {
                const currentStep = currentSteps[activeSampleBank];
                const activePatternId = activePatternIds[activeSampleBank];
                if (currentStep >= 0) {
                    appDispatch({
                        type: ActionType.RECORD_STEP,
                        payload: {
                            patternId: activePatternId,
                            sampleId: activeSampleId,
                            step: currentStep,
                            detune: detuneWithKeyAndOctave,
                        }
                    });
                }
            }
        }
      }
  }, [dispatch, playSample, startRecording, stopRecording]);
  
  useEffect(() => {
      window.addEventListener('keydown', handlePCKeyboardInput);
      return () => {
          window.removeEventListener('keydown', handlePCKeyboardInput);
      };
  }, [handlePCKeyboardInput]);

  const renderView = () => {
    switch (activeView) {
      case 'SAMPLE':
        return <SampleView 
            // Pass state as props
            activeSampleId={state.activeSampleId}
            samples={state.samples}
            activeSampleBank={state.activeSampleBank}
            isRecording={state.isRecording}
            audioContext={state.audioContext}
            isArmed={state.isArmed}
            recordingThreshold={state.recordingThreshold}
            sampleClipboard={state.sampleClipboard}
            // Pass callbacks
            playSample={playSample} 
            startRecording={startRecording} 
            stopRecording={stopRecording} 
            loadSampleFromBlob={loadSampleFromBlob}
            dispatch={dispatch}
        />;
      case 'SEQ':
        return <SeqView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} />;
      case 'GROOVE':
        return <GrooveView />;
      case 'MIXER':
          return <MixerView startMasterRecording={startMasterRecording} stopMasterRecording={stopMasterRecording} />;
      case 'PROJECT':
        return <ProjectView />;
      default:
        return <SampleView 
            activeSampleId={state.activeSampleId}
            samples={state.samples}
            activeSampleBank={state.activeSampleBank}
            isRecording={state.isRecording}
            audioContext={state.audioContext}
            isArmed={state.isArmed}
            recordingThreshold={state.recordingThreshold}
            sampleClipboard={state.sampleClipboard}
            playSample={playSample} 
            startRecording={startRecording} 
            stopRecording={stopRecording} 
            loadSampleFromBlob={loadSampleFromBlob}
            dispatch={dispatch}
        />;
    }
  };
  
  return (
    <div className="bg-emerald-50 text-slate-800 flex flex-col h-screen font-sans w-full max-w-md mx-auto relative">
      {/* MIDI Template Manager */}
      <MidiTemplateManager />
      
      {/* Header / Transport */}
      <header className="flex-shrink-0 p-1 bg-emerald-100/50">
        <div className="flex justify-between items-center">
          <Transport 
            startMasterRecording={startMasterRecording} 
            stopMasterRecording={stopMasterRecording}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow min-h-0">
        {state.isInitialized ? renderView() : (
           <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-lg">Click anywhere to start the audio engine...</p>
          </div>
        )}
      </main>

      {/* Footer / View Tabs */}
      <footer className="flex-shrink-0 p-1 bg-emerald-100/50">
        <div className="grid grid-cols-5 gap-1">
          <TabButton label="SAMPLE" isActive={activeView === 'SAMPLE'} onClick={() => setActiveView('SAMPLE')} />
          <TabButton label="SEQ" isActive={activeView === 'SEQ'} onClick={() => setActiveView('SEQ')} />
          <TabButton label="GROOVE" isActive={activeView === 'GROOVE'} onClick={() => setActiveView('GROOVE')} />
          <TabButton label="MIXER" isActive={activeView === 'MIXER'} onClick={() => setActiveView('MIXER')} />
          <TabButton label="PROJECT" isActive={activeView === 'PROJECT'} onClick={() => setActiveView('PROJECT')} />
        </div>
      </footer>
    </div>
  );
};

export default App;
