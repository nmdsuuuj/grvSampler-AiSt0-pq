import React, { useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType } from '../../types';
import Fader from '../Fader';
import Pad from '../Pad';
import { GROOVE_PATTERNS, PADS_PER_BANK } from '../../constants';
import BankSelector from '../BankSelector';

const GrooveView: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const { grooveDepth, activeGrooveId, activeGrooveBank } = state;

    // --- Non-linear fader logic ---
    const uiValue = Math.cbrt(grooveDepth / 8);
    const handleGrooveDepthChange = (newUiValue: number) => {
        const newStateValue = 8 * Math.pow(newUiValue, 3);
        dispatch({ type: ActionType.SET_GROOVE_DEPTH, payload: newStateValue });
    };
    // --- End non-linear fader logic ---

    const handleGroovePadClick = (id: number) => {
        dispatch({ type: ActionType.SET_ACTIVE_GROOVE, payload: id });
    };

    const grooveBankOffset = activeGrooveBank * PADS_PER_BANK;
    const activeGroove = GROOVE_PATTERNS[activeGrooveId];

    return (
        <div className="flex flex-col h-full p-2">
            <h2 className="text-xl font-bold text-center flex-shrink-0">Groove</h2>

            <div className="flex-grow grid grid-cols-2 gap-4 mt-2">
                {/* Left Column: Fader */}
                <div className="bg-slate-800 p-4 rounded-lg flex flex-col justify-between">
                     <div className="text-center flex-shrink-0">
                        <p className="text-sm text-slate-400">Current</p>
                        <p className="font-bold text-lg text-amber-400 truncate" title={activeGroove?.name || 'None'}>
                            {activeGroove?.name || 'None'}
                        </p>
                    </div>
                    <div className="flex-grow">
                        <Fader
                            label="Depth (%)"
                            value={uiValue}
                            displayValue={grooveDepth * 100}
                            displayPrecision={0}
                            onChange={handleGrooveDepthChange}
                            min={-1}
                            max={1}
                            step={0.001}
                            defaultValue={0}
                            isVertical={true}
                        />
                    </div>
                    <div className="text-xs text-slate-500 text-center pt-2 flex-shrink-0">
                        <p>Adjusts timing & feel.</p>
                        <p>Dbl-tap fader to reset.</p>
                    </div>
                </div>

                {/* Right Column: Pads */}
                <div className="flex flex-col space-y-2">
                    <h3 className="text-base font-semibold text-center">Patterns</h3>
                    <BankSelector type="groove" />
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
                            const grooveId = grooveBankOffset + i;
                            return (
                                <Pad
                                    key={grooveId}
                                    id={grooveId}
                                    label={`G${grooveId + 1}`}
                                    onClick={handleGroovePadClick}
                                    isActive={activeGrooveId === grooveId}
                                    hasContent={true}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GrooveView;