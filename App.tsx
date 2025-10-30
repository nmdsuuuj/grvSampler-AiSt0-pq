import React, { useState, useContext } from 'react';
import SeqView from './components/views/SeqView';
import SampleView from './components/views/SampleView';
import GrooveView from './components/views/GrooveView';
import Transport from './components/Transport';
import TabButton from './components/TabButton';
import { AppContext } from './context/AppContext';
import { ActionType } from './types';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useSequencer } from './hooks/useSequencer';

type View = 'SEQ' | 'SAMPLE' | 'GROOVE';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('SEQ');
  const { dispatch } = useContext(AppContext);
  const [isInitialized, setIsInitialized] = useState(false);

  // Lift hooks to the top level to prevent them from unmounting on view change.
  const { playSample, startRecording, stopRecording } = useAudioEngine();
  useSequencer(playSample);


  const initializeAudio = async () => {
    if (isInitialized) return;
    try {
      // User gesture is required to start AudioContext and request permissions.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      dispatch({ type: ActionType.INITIALIZE_AUDIO_ENGINE });
      setIsInitialized(true);
    } catch (error) {
      console.error("Microphone access denied.", error);
      alert("Microphone access is required for this application to function.");
    }
  };

  const renderView = () => {
    const viewProps = { playSample, startRecording, stopRecording };
    switch (activeView) {
      case 'SEQ':
        return <SeqView {...viewProps} />;
      case 'SAMPLE':
        return <SampleView {...viewProps} />;
      case 'GROOVE':
        return <GrooveView />;
      default:
        return <SeqView {...viewProps} />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col font-sans select-none overflow-hidden max-w-lg mx-auto bg-slate-900">
      {!isInitialized && (
         <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4">
            <h1 className="text-3xl font-bold text-white mb-4">Groove Sampler</h1>
            <p className="text-slate-300 mb-6 text-center">Tap to start and allow microphone access for recording.</p>
            <button
                onClick={initializeAudio}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-4 px-8 rounded-lg text-xl shadow-lg"
            >
                Start
            </button>
        </div>
      )}
      <header className="bg-slate-950 p-2 flex-shrink-0 border-b-2 border-slate-700">
        <Transport />
        <div className="grid grid-cols-3 gap-2 mt-2">
          <TabButton label="SEQ" isActive={activeView === 'SEQ'} onClick={() => setActiveView('SEQ')} />
          <TabButton label="SAMPLE" isActive={activeView === 'SAMPLE'} onClick={() => setActiveView('SAMPLE')} />
          <TabButton label="GROOVE" isActive={activeView === 'GROOVE'} onClick={() => setActiveView('GROOVE')} />
        </div>
      </header>
      
      <main className="flex-grow p-1 flex flex-col min-h-0">
        {renderView()}
      </main>
      
      <footer className="bg-slate-800 p-2 flex-shrink-0">
        <h1 className="text-xl font-bold text-center">Groove Sampler</h1>
      </footer>
    </div>
  );
};

export default App;