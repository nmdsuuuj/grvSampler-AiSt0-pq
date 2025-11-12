
import React from 'react';
import { PAD_SIZE } from '../constants';

interface PadProps {
  id: number;
  label: string;
  onClick: (id: number) => void;
  isActive?: boolean;
  isPlaying?: boolean;
  isRecording?: boolean;
  isArmed?: boolean;
  hasContent?: boolean;
}

const Pad: React.FC<PadProps> = ({
  id,
  label,
  onClick,
  isActive = false,
  isPlaying = false,
  isRecording = false,
  isArmed = false,
  hasContent = false,
}) => {
  const baseClasses = `${PAD_SIZE} flex items-center justify-center rounded-md text-xs font-bold transition-all duration-100 focus:outline-none border-2`;
  
  let colorClasses = 'bg-slate-700 border-slate-600 text-slate-300';
  if (hasContent) colorClasses = 'bg-sky-800 border-sky-700 text-sky-200';
  if (isActive) colorClasses = 'bg-amber-500 border-amber-400 text-slate-900 ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900';
  if (isArmed) colorClasses = 'bg-yellow-500 border-yellow-400 text-slate-900 animate-pulse';
  if (isPlaying) colorClasses = 'bg-lime-400 border-lime-300 text-slate-900 scale-105';
  if (isRecording) colorClasses = 'bg-rose-500 border-rose-400 text-white scale-105 animate-pulse';


  return (
    <button
      className={`${baseClasses} ${colorClasses}`}
      onClick={() => onClick(id)}
    >
      {label}
    </button>
  );
};

export default Pad;