
import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';

type BankType = 'sample' | 'groove';

interface BankSelectorProps {
    type: BankType;
}

const BankSelector: React.FC<BankSelectorProps> = ({ type }) => {
    const { state, dispatch } = useContext(AppContext);
    
    let activeBank: number;
    let actionType: ActionType;

    switch (type) {
        case 'sample':
            activeBank = state.activeSampleBank;
            actionType = ActionType.SET_ACTIVE_SAMPLE_BANK;
            break;
        case 'groove':
            activeBank = state.activeGrooveBank;
            actionType = ActionType.SET_ACTIVE_GROOVE_BANK;
            break;
    }

    const inactiveClasses = "bg-emerald-200 text-emerald-800";
    let activeClasses = "bg-pink-400 text-white"; // Default for groove/pattern
    if (type === 'sample') {
        activeClasses = "bg-sky-400 text-white";
    }

    return (
        <div className="flex justify-center space-x-1">
            {[0, 1, 2, 3].map(bankIndex => (
                <button
                    key={bankIndex}
                    onClick={() => dispatch({ type: actionType, payload: bankIndex })}
                    className={`px-3 py-1 text-xs font-bold rounded transition-colors ${activeBank === bankIndex ? activeClasses : inactiveClasses}`}
                >
                    {String.fromCharCode(65 + bankIndex)}
                </button>
            ))}
        </div>
    );
};

export default BankSelector;