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
import SynthView from './components/views/SynthView';
import GlobalKeyboard from './components/GlobalKeyboard';

import { useAudioEngine } from './hooks/useAudioEngine';
import { useSequencer } from './hooks/useSequencer';
import { PADS_PER_BANK } from './constants';
import SCALES from './scales';

type View = 'SAMPLE' | 'SEQ' | 'GROOVE' | 'MIXER' | 'PROJECT' | 'SYNTH';

const App: React.FC = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeView, setActiveView] = useState<View>('SAMPLE');
  
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeViewRef = useRef(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);


  useEffect(() => {
    const initAudio = () => {
      if (!state.isInitialized) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContext.resume().then(() => {
          dispatch({ type: ActionType.INITIALIZE_AUDIO, payload: audioContext });
        });
      }
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
    playSynthNote,
    scheduleLfoRetrigger,
    loadSampleFromBlob, 
    startRecording, 
    stopRecording,
    startMasterRecording,
    stopMasterRecording,
  } = useAudioEngine();
  useSequencer(playSample, playSynthNote, scheduleLfoRetrigger);

  const handlePCKeyboardInput = useCallback((event: KeyboardEvent) => {
      if (event.repeat) return;
  
      const { state: appState, dispatch: appDispatch } = { state: stateRef.current, dispatch };
      const currentActiveView = activeViewRef.current;

      const { 
          activeSampleBank, activeKey, activeScale, keyboardOctave, seqMode, 
          isPlaying, currentSteps, activePatternIds, activeSampleId,
          isRecording, isArmed, samples, keyboardSource
      } = appState;
  
      const targetElement = event.target as HTMLElement;
      if (targetElement.tagName === 'INPUT') {
        const inputEl = targetElement as HTMLInputElement;
        if (inputEl.type === 'text' || inputEl.type === 'number') return;
      }
      if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'SELECT') return;

      const key = event.key;
  
      if (currentActiveView === 'SAMPLE') {
          switch (key.toLowerCase()) {
              case 'q':
                  if (isRecording || isArmed) stopRecording(); else startRecording();
                  return;
              case 'w':
                  appDispatch({ type: ActionType.COPY_SAMPLE });
                  return;
              case 'e':
                  appDispatch({ type: ActionType.PASTE_SAMPLE });
                  return;
          }
      }

      switch (key.toLowerCase()) {
          case 'a':
              appDispatch({ type: ActionType.SET_KEYBOARD_OCTAVE, payload: Math.max(0, keyboardOctave - 1) });
              return;
          case 'f':
              appDispatch({ type: ActionType.SET_KEYBOARD_OCTAVE, payload: Math.min(8, keyboardOctave + 1) });
              return;
          case 'k':
              appDispatch({ type: ActionType.SET_KEY, payload: (activeKey - 1 + 12) % 12 });
              return;
          case 'l':
              appDispatch({ type: ActionType.SET_KEY, payload: (activeKey + 1) % 12 });
              return;
      }
      
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
  
      const bankMap: { [key: string]: number } = { '9': 0, '0': 1, '-': 2, '^': 3 };
      if (bankMap[key] !== undefined) {
          appDispatch({ type: ActionType.SET_ACTIVE_SAMPLE_BANK, payload: bankMap[key] });
          return;
      }
  
      const padNumber = parseInt(key, 10);
      if (!isNaN(padNumber) && padNumber >= 1 && padNumber <= PADS_PER_BANK) {
          const sampleIdToTrigger = activeSampleBank * PADS_PER_BANK + (padNumber - 1);
          appDispatch({ type: ActionType.SET_ACTIVE_SAMPLE, payload: sampleIdToTrigger });

          if (activeSampleBank === 3) {
            appDispatch({ type: ActionType.SET_KEYBOARD_SOURCE, payload: 'SYNTH' });
            playSynthNote(1200, 0); 
          } else {
            appDispatch({ type: ActionType.SET_KEYBOARD_SOURCE, payload: 'SAMPLE' });
            if (samples[sampleIdToTrigger]?.buffer) {
                 playSample(sampleIdToTrigger, 0);
            }
          }
          return;
      }
  
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
            
            if(keyboardSource === 'SYNTH') {
              playSynthNote(detuneWithKeyAndOctave, 0);
            } else {
              const playbackParams: Partial<PlaybackParams> = { detune: detuneWithKeyAndOctave };
              playSample(activeSampleId, 0, playbackParams);
            }
    
            if (seqMode === 'REC' && isPlaying) {
                const isSynth = keyboardSource === 'SYNTH';
                if (isSynth && activeSampleBank === 3) {
                    const currentStep = currentSteps[3];
                    const activePatternId = activePatternIds[3];
                    if (currentStep >= 0) {
                        appDispatch({
                            type: ActionType.RECORD_STEP,
                            payload: { patternId: activePatternId, sampleId: activeSampleId, step: currentStep, detune: detuneWithKeyAndOctave }
                        });
                    }
                } else if (!isSynth && activeSampleBank !== 3) {
                     const currentStep = currentSteps[activeSampleBank];
                     const activePatternId = activePatternIds[activeSampleBank];
                     if (currentStep >= 0) {
                        appDispatch({
                            type: ActionType.RECORD_STEP,
                            payload: { patternId: activePatternId, sampleId: activeSampleId, step: currentStep, detune: detuneWithKeyAndOctave }
                        });
                    }
                }
            }
        }
      }
  }, [dispatch, playSample, playSynthNote, startRecording, stopRecording]);
  
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
      case 'SEQ':
        return <SeqView playSample={playSample} playSynthNote={playSynthNote} />;
      case 'GROOVE':
        return <GrooveView />;
      case 'MIXER':
          return <MixerView startMasterRecording={startMasterRecording} stopMasterRecording={stopMasterRecording} />;
      case 'PROJECT':
        return <ProjectView />;
      case 'SYNTH':
        return <SynthView playSynthNote={playSynthNote} />;
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
      <header className="flex-shrink-0 p-0.5 bg-emerald-100/50">
        <div className="grid grid-cols-6 gap-1">
          <TabButton label="SAMPLE" isActive={activeView === 'SAMPLE'} onClick={() => setActiveView('SAMPLE')} />
          <TabButton label="SEQ" isActive={activeView === 'SEQ'} onClick={() => setActiveView('SEQ')} />
          <TabButton label="SYNTH" isActive={activeView === 'SYNTH'} onClick={() => setActiveView('SYNTH')} />
          <TabButton label="GROOVE" isActive={activeView === 'GROOVE'} onClick={() => setActiveView('GROOVE')} />
          <TabButton label="MIXER" isActive={activeView === 'MIXER'} onClick={() => setActiveView('MIXER')} />
          <TabButton label="PROJECT" isActive={activeView === 'PROJECT'} onClick={() => setActiveView('PROJECT')} />
        </div>
      </header>
      
      <section className="flex-shrink-0 p-1 bg-emerald-100/50">
        <Transport 
          startMasterRecording={startMasterRecording} 
          stopMasterRecording={stopMasterRecording}
        />
      </section>

      <main className="flex-grow min-h-0 overflow-y-auto">
        {state.isInitialized ? renderView() : (
           <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-lg">Click anywhere to start the audio engine...</p>
          </div>
        )}
      </main>

      <footer className="flex-shrink-0">
        <GlobalKeyboard playSample={playSample} playSynthNote={playSynthNote} />
      </footer>
    </div>
  );
};

export default App;