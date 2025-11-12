import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from './context/AppContext';
import { ActionType } from './types';

import Transport from './components/Transport';
import TabButton from './components/TabButton';
import SampleView from './components/views/SampleView';
import SeqView from './components/views/SeqView';
import GrooveView from './components/views/GrooveView';
import MixerView from './components/views/MixerView';
import ProjectView from './components/views/ProjectView';

import { useAudioEngine } from './hooks/useAudioEngine';
import { useSequencer } from './hooks/useSequencer';

type View = 'SAMPLE' | 'SEQ' | 'GROOVE' | 'MIXER' | 'PROJECT';

const App: React.FC = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeView, setActiveView] = useState<View>('SAMPLE');
  
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
  } = useAudioEngine();
  useSequencer(playSample);

  const renderView = () => {
    switch (activeView) {
      case 'SAMPLE':
        return <SampleView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} loadSampleFromBlob={loadSampleFromBlob} />;
      case 'SEQ':
        return <SeqView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} />;
      case 'GROOVE':
        return <GrooveView />;
      case 'MIXER':
          return <MixerView />;
      case 'PROJECT':
        return <ProjectView loadSampleFromBlob={loadSampleFromBlob} />;
      default:
        return <SampleView playSample={playSample} startRecording={startRecording} stopRecording={stopRecording} loadSampleFromBlob={loadSampleFromBlob} />;
    }
  };

  return (
    <div className="bg-slate-900 text-slate-100 flex flex-col h-screen font-sans w-full max-w-md mx-auto">
      {/* Header / Transport */}
      <header className="flex-shrink-0 p-2 bg-slate-800/50">
        <Transport />
      </header>

      {/* Main Content */}
      <main className="flex-grow min-h-0">
        {state.isInitialized ? renderView() : (
           <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 text-lg">Click anywhere to start the audio engine...</p>
          </div>
        )}
      </main>

      {/* Footer / View Tabs */}
      <footer className="flex-shrink-0 p-1 bg-slate-800/50">
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