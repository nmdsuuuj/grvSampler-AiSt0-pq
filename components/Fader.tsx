import React from 'react';

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
}

const Fader: React.FC<FaderProps> = ({ label, value, onChange, min, max, step, defaultValue, displayValue, displayPrecision = 2, isVertical = false, hideInfo = false }) => {
  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  const valueToDisplay = displayValue !== undefined ? displayValue : value;

  const containerClasses = isVertical ? 'h-full w-auto' : 'w-full h-auto py-1';
  const inputContainerClasses = isVertical ? 'relative h-full w-8' : 'relative h-8 w-full';
  
  const labelContainerClasses = `absolute inset-0 flex items-center pointer-events-none text-white font-bold text-xs drop-shadow-sm select-none`;
  const horizontalLabelClasses = 'justify-between px-3';
  const verticalLabelClasses = 'flex-col justify-between items-center py-2';

  return (
    <div className={containerClasses} onDoubleClick={handleDoubleClick}>
      <div className={inputContainerClasses}>
         <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={isVertical ? 'vertical-fader' : 'horizontal-fader'}
          />
          {!hideInfo && (
            <div className={`${labelContainerClasses} ${isVertical ? verticalLabelClasses : horizontalLabelClasses}`}>
                {label && <span>{label}</span>}
                <span>{valueToDisplay.toFixed(displayPrecision)}</span>
            </div>
          )}
      </div>
    </div>
  );
};

export default Fader;