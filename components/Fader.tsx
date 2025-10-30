import React from 'react';

interface FaderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  displayValue?: number;
  displayPrecision?: number;
  isVertical?: boolean;
}

const Fader: React.FC<FaderProps> = ({ label, value, onChange, min, max, step, defaultValue, displayValue, displayPrecision = 2, isVertical = false }) => {
  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  const valueToDisplay = displayValue !== undefined ? displayValue : value;

  const containerClasses = isVertical
    ? 'flex flex-col items-center h-full'
    : 'flex flex-col space-y-1';

  const inputContainerClasses = isVertical
    ? 'flex-grow flex justify-center items-center'
    : '';

  const inputClasses = isVertical ? 'vertical-fader' : 'horizontal-fader';

  return (
    <div className={containerClasses}>
      <label className="text-xs font-medium text-slate-400 flex justify-between w-full">
        <span>{label}</span>
        <span>{valueToDisplay.toFixed(displayPrecision)}</span>
      </label>
      <div className={inputContainerClasses}>
         <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onDoubleClick={handleDoubleClick}
            className={inputClasses}
          />
      </div>
    </div>
  );
};

export default Fader;