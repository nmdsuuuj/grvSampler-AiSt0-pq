
import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType } from '../types';

type BankType = 'sample';

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
    }

    const inactiveClasses = "bg-emerald-200 text-emerald-800";
    let activeClasses = "bg-sky-400 text-white";


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
