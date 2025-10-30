
import React from 'react';

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => {
  const baseClasses = "w-full py-3 text-sm font-bold rounded-lg transition-colors duration-200 focus:outline-none";
  const activeClasses = "bg-sky-600 text-white";
  const inactiveClasses = "bg-slate-700 text-slate-300 hover:bg-slate-600";

  return (
    <button
      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default TabButton;
