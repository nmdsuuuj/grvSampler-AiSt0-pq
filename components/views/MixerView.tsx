import React, { useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { ActionType } from '../../types';
import Fader from '../Fader';
import { TOTAL_BANKS } from '../../constants';

const MixerView: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const { bankVolumes } = state;

    const handleVolumeChange = (bankIndex: number, volume: number) => {
        dispatch({ type: ActionType.SET_BANK_VOLUME, payload: { bankIndex, volume } });
    };

    return (
        <div className="flex flex-col h-full p-2">
            <h2 className="text-xl font-bold text-center flex-shrink-0 mb-4">Mixer</h2>
            <div className="flex-grow grid grid-cols-4 gap-4 bg-slate-800 p-4 rounded-lg">
                {Array.from({ length: TOTAL_BANKS }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <div className="h-full">
                             <Fader
                                label={`Bank ${String.fromCharCode(65 + i)}`}
                                value={bankVolumes[i]}
                                onChange={(val) => handleVolumeChange(i, val)}
                                min={0}
                                max={1}
                                step={0.01}
                                defaultValue={1}
                                isVertical={true}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MixerView;
