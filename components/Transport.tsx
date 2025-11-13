import React, { useContext, useState, useRef, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';
import Fader from './Fader';
import { useBpmTap } from '../hooks/useBpmTap';

interface TransportProps {
    startMasterRecording: () => void;
    stopMasterRecording: () => void;
}

type BpmControlMode = 'fader' | 'ratio' | 'numeric';

// Ratios for BPM multiplication, split into two rows for the UI
const RATIOS_ROW1 = [
    { label: '1/4', value: 0.25 },
    { label: '1/3', value: 1 / 3 },
    { label: '1/2', value: 0.5 },
    { label: '2/3', value: 2 / 3 },
    { label: '3/4', value: 0.75 },
];
const RATIOS_ROW2 = [
    { label: '1x', value: 1 },
    { label: 'x1.25', value: 1.25 },
    { label: 'x1.5', value: 1.5 },
    { label: 'x2', value: 2.0 },
];


const Transport: React.FC<TransportProps> = ({ startMasterRecording, stopMasterRecording }) => {
  const { state, dispatch } = useContext(AppContext);
  const { isPlaying, bpm, isMasterRecArmed, isMasterRecording } = state;

  const [bpmMode, setBpmMode] = useState<BpmControlMode>('fader');
  const [baseBpmForRatio, setBaseBpmForRatio] = useState(bpm);
  const [numericBpmInput, setNumericBpmInput] = useState(bpm.toFixed(1));
  const longPressTimeout = useRef<number | null>(null);

  // Update numeric input display if BPM is changed externally (e.g., tap tempo)
  useEffect(() => {
    setNumericBpmInput(bpm.toFixed(1));
  }, [bpm]);

  // Set base BPM when switching to ratio mode
  useEffect(() => {
    if (bpmMode === 'ratio') {
      setBaseBpmForRatio(bpm);
    }
    // Only update the base BPM when the mode is switched to 'ratio'.
    // Tapping a new tempo will correctly update the base via the handleTap callback.
  }, [bpmMode]);

  const handlePlayToggle = () => {
    if(state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    
    if (!isPlaying && isMasterRecArmed) {
        startMasterRecording();
        dispatch({ type: ActionType.TOGGLE_MASTER_REC_ARMED });
    }
    
    if (isPlaying && isMasterRecording) {
        stopMasterRecording();
    }

    dispatch({ type: ActionType.TOGGLE_PLAY });
  };
  
  const handleBpmChange = (newBpm: number) => {
    dispatch({ type: ActionType.SET_BPM, payload: newBpm });
  }

  const { handleTap } = useBpmTap((calculatedBpm) => {
    const roundedBpm = Math.round(calculatedBpm * 10) / 10;
    // When tapping in ratio mode, the new tempo becomes the new base
    if (bpmMode === 'ratio') {
        setBaseBpmForRatio(roundedBpm);
    }
    handleBpmChange(roundedBpm);
  });

  const handleRatioClick = (ratio: number) => {
    const newBpm = baseBpmForRatio * ratio;
    handleBpmChange(Math.round(newBpm * 10) / 10);
  };

  const handleNumericBpmSubmit = () => {
    let newBpm = parseFloat(numericBpmInput);
    if (isNaN(newBpm)) {
        setNumericBpmInput(bpm.toFixed(1));
        return;
    }
    newBpm = Math.max(40, Math.min(240, newBpm));
    handleBpmChange(newBpm);
    setNumericBpmInput(newBpm.toFixed(1));
  };

  const handleTapPress = () => {
    longPressTimeout.current = window.setTimeout(() => {
        setBpmMode(prevMode => {
            const modes: BpmControlMode[] = ['fader', 'ratio', 'numeric'];
            const currentIndex = modes.indexOf(prevMode);
            return modes[(currentIndex + 1) % modes.length];
        });
        longPressTimeout.current = null; // Prevent tap on release
    }, 500); // 500ms for long press
  };

  const handleTapRelease = () => {
      if (longPressTimeout.current) {
          clearTimeout(longPressTimeout.current);
          longPressTimeout.current = null;
          handleTap(); // It's a short press (tap)
      }
  };
  
  const renderBpmControl = () => {
    switch (bpmMode) {
      case 'ratio':
        return (
          <div className="h-full flex flex-col justify-center">
            <div className="space-y-1">
               <div className="flex justify-center space-x-1">
                {RATIOS_ROW1.map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => handleRatioClick(value)}
                    className={`flex-grow py-0.5 px-1 text-[9px] font-bold rounded transition-colors ${bpm.toFixed(1) === (baseBpmForRatio * value).toFixed(1) ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex justify-center space-x-1">
                {RATIOS_ROW2.map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => handleRatioClick(value)}
                    className={`flex-grow py-0.5 px-1 text-[9px] font-bold rounded transition-colors ${bpm.toFixed(1) === (baseBpmForRatio * value).toFixed(1) ? 'bg-pink-400 text-white' : 'bg-emerald-200 hover:bg-emerald-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'numeric':
        return (
          <div className="h-full flex items-center justify-center">
            <form onSubmit={(e) => { e.preventDefault(); handleNumericBpmSubmit(); }}>
              <input
                type="number"
                value={numericBpmInput}
                onChange={(e) => setNumericBpmInput(e.target.value)}
                onBlur={handleNumericBpmSubmit}
                step="0.1"
                min="40"
                max="240"
                className="bg-emerald-100 text-slate-800 text-center font-bold text-lg rounded px-2 py-0.5 w-24 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </form>
          </div>
        );
      case 'fader':
      default:
        return (
           <div className="h-full flex items-center">
             <Fader
                hideInfo
                value={bpm}
                onChange={handleBpmChange}
                min={40}
                max={240}
                step={0.1}
                defaultValue={120}
              />
           </div>
        );
    }
  };

  const getTapButtonBorderStyle = () => {
    switch (bpmMode) {
        case 'ratio': return 'border-pink-400';
        case 'numeric': return 'border-sky-400';
        case 'fader': 
        default:
          return 'border-transparent';
    }
  };


  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={handlePlayToggle}
        className={`w-20 px-4 py-3 font-bold rounded-md transition-colors ${isPlaying ? 'bg-pink-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
      >
        {isPlaying ? 'STOP' : 'PLAY'}
      </button>

      <div className="flex-grow flex items-center h-12 bg-emerald-100 rounded-lg p-2 shadow-inner">
        <div className="flex-grow h-full">
          {renderBpmControl()}
        </div>
      </div>

      <div className="flex flex-col items-center">
        <button
            onMouseDown={handleTapPress}
            onMouseUp={handleTapRelease}
            onTouchStart={handleTapPress}
            onTouchEnd={handleTapRelease}
            onClick={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-20 h-12 rounded-md transition-colors bg-emerald-200 text-slate-700 flex-shrink-0 hover:bg-emerald-300 flex items-center justify-center text-2xl font-bold tracking-tight border-2 ${getTapButtonBorderStyle()}`}
        >
            {bpm.toFixed(1)}
        </button>
        <div className="text-xs text-slate-500 h-4 pt-0.5">
            {bpmMode === 'ratio' && `Base: ${baseBpmForRatio.toFixed(1)}`}
        </div>
      </div>
    </div>
  );
};

export default Transport;