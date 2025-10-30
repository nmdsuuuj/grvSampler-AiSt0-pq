
import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';
import Fader from './Fader';

const Transport: React.FC = () => {
  const { state, dispatch } = useContext(AppContext);
  const { isPlaying, bpm } = state;

  const handlePlayToggle = () => {
    if(state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    dispatch({ type: ActionType.TOGGLE_PLAY });
  };
  
  const handleBpmChange = (newBpm: number) => {
    dispatch({ type: ActionType.SET_BPM, payload: newBpm });
  }

  return (
    <div className="flex items-center space-x-4">
      <button
        onClick={handlePlayToggle}
        className={`px-6 py-3 font-bold rounded-md transition-colors ${isPlaying ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-200'}`}
      >
        {isPlaying ? 'STOP' : 'PLAY'}
      </button>
      <div className="flex-grow">
        <Fader 
          label="BPM"
          value={bpm}
          onChange={handleBpmChange}
          min={40}
          max={240}
          step={0.1}
          defaultValue={120}
        />
      </div>
    </div>
  );
};

export default Transport;
