
import React, { useContext, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { GROOVE_PATTERNS, GROOVES_PER_BANK, TOTAL_BANKS } from '../../constants';

const GrooveView: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const { grooveDepths, activeGrooveIds, activePatternIds, activeSampleBank } = state;
    
    // This view now needs its own bank selector to choose which bank to ASSIGN a groove to.
    const [targetBank, setTargetBank] = useState(activeSampleBank); 
    const [groovePage, setGroovePage] = useState(0);

    const handleGrooveDepthChange = (bankIndex: number, newUiValue: number) => {
        // Use a cubic curve for more intuitive control over smaller values
        const newStateValue = 8 * Math.pow(newUiValue, 3);
        dispatch({ type: ActionType.SET_GROOVE_DEPTH, payload: { bankIndex, value: newStateValue } });
    };

    const handleGroovePadClick = (id: number) => {
        // Apply the selected groove to the currently targeted bank
        dispatch({ type: ActionType.SET_ACTIVE_GROOVE, payload: { bankIndex: targetBank, grooveId: id } });
    };

    const grooveBankOffset = groovePage * GROOVES_PER_BANK;
    
    // Display the active pattern for context
    const activePatternId = activePatternIds[activeSampleBank];
    const activeGrooveForTargetBank = GROOVE_PATTERNS[activeGrooveIds[targetBank]];

    return (
        <div className="flex flex-col h-full p-2 space-y-2">
            <div className="flex-shrink-0 text-center">
                <h2 className="text-xl font-bold">Groove</h2>
                 <p className="text-sm text-slate-500">
                    Editing Groove for Pattern <span className="font-bold text-pink-500">P{activePatternId + 1}</span>
                </p>
            </div>
            
            <div className="flex-grow grid grid-cols-2 gap-2">
                {/* Left Column: Pads & Selector */}
                <div className="bg-white shadow-md p-2 rounded-lg flex flex-col space-y-2">
                    <div className="text-center">
                        <h3 className="text-base font-semibold">Assign Pattern To:</h3>
                        <div className="flex justify-center space-x-1 mt-1">
                            {[0, 1, 2, 3].map(bankIndex => (
                                <button
                                    key={bankIndex}
                                    onClick={() => setTargetBank(bankIndex)}
                                    className={`px-3 py-1 text-xs font-bold rounded transition-colors ${targetBank === bankIndex ? 'bg-sky-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
                                >
                                    {String.fromCharCode(65 + bankIndex)}
                                </button>
                            ))}
                        </div>
                         <p className="text-xs text-slate-500 mt-1">
                            Bank <span className="font-bold text-sky-500">{String.fromCharCode(65 + targetBank)}</span> uses: <span className="font-bold text-pink-500 truncate">{activeGrooveForTargetBank?.name || 'None'}</span>
                        </p>
                    </div>

                    <div className="flex justify-center space-x-1">
                        {[0, 1, 2, 3].map(pageIndex => (
                            <button
                                key={pageIndex}
                                onClick={() => setGroovePage(pageIndex)}
                                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${groovePage === pageIndex ? 'bg-pink-400 text-white' : 'bg-emerald-200 text-emerald-800'}`}
                            >
                                {pageIndex + 1}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: GROOVES_PER_BANK }).map((_, i) => {
                            const grooveId = grooveBankOffset + i;
                            return (
                                <Pad
                                    key={grooveId}
                                    id={grooveId}
                                    label={`G${grooveId + 1}`}
                                    onClick={handleGroovePadClick}
                                    isActive={activeGrooveIds[targetBank] === grooveId}
                                    hasContent={true}
                                    padType="groove"
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: Faders */}
                <div className="bg-white shadow-md p-2 rounded-lg flex justify-around">
                    {Array.from({ length: TOTAL_BANKS }).map((_, i) => {
                        const depth = grooveDepths[i];
                        // The UI fader uses a cubic root scale for better feel, while the state stores the actual value.
                        const uiValue = Math.cbrt(depth / 8); 
                        return (
                            <div key={i} className="h-full flex flex-col items-center">
                                <Fader
                                    label={`Depth ${String.fromCharCode(65 + i)}`}
                                    value={uiValue}
                                    displayValue={depth * 100}
                                    displayPrecision={0}
                                    onChange={(val) => handleGrooveDepthChange(i, val)}
                                    min={-1}
                                    max={1}
                                    step={0.001}
                                    defaultValue={0}
                                    isVertical={true}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default GrooveView;
