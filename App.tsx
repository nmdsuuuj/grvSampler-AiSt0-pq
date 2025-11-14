

import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { AppContext } from './context/AppContext';
import { ActionType, PlaybackParams } from './types';

import Transport from './components/Transport';
import TabButton from './components/TabButton';
import SampleView from './components/views/SampleView';
import SeqView from './components/views/SeqView';
import GrooveView from './components/views/GrooveView';
import MixerView from './components/views/MixerView';
import ProjectView from './components/views/ProjectView';

import { useAudioEngine } from './hooks/useAudioEngine';
import { useSequencer } from './hooks/useSequencer';
import { PADS_PER_BANK } from './constants';
import SCALES from './scales';

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
  
      // Prevent handling if an input field is focused
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) {
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
        return <SampleView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} loadSampleFromBlob={loadSampleFromBlob} />;
      case 'SEQ':
        return <SeqView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} />;
      case 'GROOVE':
        return <GrooveView />;
      case 'MIXER':
          return <MixerView startMasterRecording={startMasterRecording} stopMasterRecording={stopMasterRecording} />;
      case 'PROJECT':
        return <ProjectView />;
      default:
        return <SampleView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} loadSampleFromBlob={loadSampleFromBlob} />;
    }
  };

  return (
    <div className="bg-emerald-50 text-slate-800 flex flex-col h-screen font-sans w-full max-w-md mx-auto">
      {/* Header / Transport */}
      <header className="flex-shrink-0 p-1 bg-emerald-100/50">
        <Transport startMasterRecording={startMasterRecording} stopMasterRecording={stopMasterRecording} />
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