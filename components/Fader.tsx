

import React, { useState, useEffect, useRef, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, MidiParamId } from '../types';

interface FaderProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  displayValue?: number;
  displayPrecision?: number;
  isVertical?: boolean;
  hideInfo?: boolean;
  size?: 'normal' | 'thin';
  hideValue?: boolean;
  midiParamId?: MidiParamId; // Optional MIDI parameter ID for MIDI learn
}

const Fader: React.FC<FaderProps> = ({ 
  label, value, onChange, min, max, step, defaultValue, 
  displayValue, displayPrecision = 2, isVertical = false, 
  hideInfo = false, size = 'normal', hideValue = false,
  midiParamId
}) => {
  const { state, dispatch } = useContext(AppContext);
  const isLearning = midiParamId !== undefined && state.midiLearnMode === midiParamId;
  const mappedCc = midiParamId ? state.midiMappings.find(m => m.paramId === midiParamId)?.cc : undefined;
  const [internalValue, setInternalValue] = useState(value);
  const frameId = useRef<number | null>(null);
  const tapTimeout = useRef<number | null>(null);
  const lastTap = useRef<number>(0);
  
  // Sync internal state if the external value prop changes (e.g., from loading a project)
  useEffect(() => {
    if (Math.abs(value - internalValue) > 1e-6) {
      setInternalValue(value);
    }
  }, [value, internalValue]);

  const handleReset = () => {
    setInternalValue(defaultValue);
    onChange(defaultValue);
  };

  // Combined handler for both mobile double-tap and desktop double-click
  const handleDoubleClick = (event: React.MouseEvent) => {
    // This handles the desktop case.
    event.preventDefault();
    handleReset();
  };
  
  const handleTouchStart = (event: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // ms
    
    if (tapTimeout.current) {
        // This indicates a second tap within the delay period.
        clearTimeout(tapTimeout.current);
        tapTimeout.current = null;
        lastTap.current = 0;
        handleReset();
        event.preventDefault(); // Prevent zoom or other default browser actions.
    } else {
        // This is the first tap.
        lastTap.current = now;
        tapTimeout.current = window.setTimeout(() => {
            // If the timeout completes, it was just a single tap.
            tapTimeout.current = null;
        }, DOUBLE_TAP_DELAY);
    }
  };


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setInternalValue(newValue); // Update visual state immediately for smoothness

    if (frameId.current) {
        cancelAnimationFrame(frameId.current);
    }

    frameId.current = requestAnimationFrame(() => {
        onChange(newValue);
    });
  };

  const handleMidiLearnClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (midiParamId) {
      if (isLearning) {
        dispatch({ type: ActionType.STOP_MIDI_LEARN });
      } else {
        dispatch({ type: ActionType.START_MIDI_LEARN, payload: midiParamId });
      }
    }
  };

  const handleRemoveMapping = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mappedCc !== undefined) {
      dispatch({ type: ActionType.REMOVE_MIDI_MAPPING, payload: { cc: mappedCc } });
    }
  };

  const valueToDisplay = displayValue !== undefined ? displayValue : internalValue;

  const containerClasses = isVertical ? 'h-full w-auto' : 'w-full h-auto py-1';
  const inputContainerClasses = isVertical 
    ? 'relative h-full w-10' 
    : `relative h-${size === 'normal' ? '10' : '5'} w-full`;
  
  const labelContainerClasses = `absolute inset-0 flex items-center pointer-events-none text-white font-bold text-xs drop-shadow-sm select-none`;
  const horizontalLabelClasses = `justify-between px-${size === 'normal' ? '4' : '2'}`; // Adjust padding
  const verticalLabelClasses = 'flex-col justify-between items-center py-3'; // Increased padding

  return (
    <div className={containerClasses}>
      <div className={inputContainerClasses}>
         <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={internalValue}
            onChange={handleChange}
            onDoubleClick={handleDoubleClick} // For desktop
            onTouchStart={handleTouchStart} // For mobile
            className={`${isVertical ? 'vertical-fader' : 'horizontal-fader'} ${size === 'thin' ? 'thin-horizontal-fader' : ''} ${isLearning ? 'ring-2 ring-yellow-400 ring-opacity-75' : ''}`}
          />
          {!hideInfo && (
            <div className={`${labelContainerClasses} ${isVertical ? verticalLabelClasses : horizontalLabelClasses}`}>
                {label && <span>{label}</span>}
                {!hideValue && <span>{valueToDisplay.toFixed(displayPrecision)}</span>}
            </div>
          )}
          {midiParamId && (
            <div className={`absolute ${isVertical ? 'top-0 right-0' : 'top-0 right-0'} flex flex-col gap-0.5`}>
              <button
                onClick={handleMidiLearnClick}
                className={`w-4 h-4 text-xs font-bold rounded transition-colors ${
                  isLearning 
                    ? 'bg-yellow-400 text-slate-800 animate-pulse' 
                    : mappedCc !== undefined 
                    ? 'bg-blue-400 text-white' 
                    : 'bg-slate-400 text-white hover:bg-slate-500'
                }`}
                title={isLearning ? 'Learning... Move a MIDI control' : mappedCc !== undefined ? `Mapped to CC${mappedCc}` : 'Click to learn MIDI'}
              >
                M
              </button>
              {mappedCc !== undefined && !isLearning && (
                <button
                  onClick={handleRemoveMapping}
                  className="w-4 h-4 text-xs font-bold rounded bg-red-400 text-white hover:bg-red-500"
                  title={`Remove CC${mappedCc} mapping`}
                >
                  ×
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default React.memo(Fader);