import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { ActionType, MidiMappingTemplate } from '../types';

const MidiTemplateManager: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const [isOpen, setIsOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showTemplateSwitchDialog, setShowTemplateSwitchDialog] = useState<string | null>(null);
    const [isLearningTemplateSwitch, setIsLearningTemplateSwitch] = useState(false);
    const learnTemplateIdRef = useRef<string | null>(null);

    const handleSaveTemplate = () => {
        if (templateName.trim() && state.midiMappings.length > 0) {
            dispatch({ 
                type: ActionType.SAVE_MIDI_MAPPING_TEMPLATE, 
                payload: { name: templateName.trim() } 
            });
            setTemplateName('');
            setShowSaveDialog(false);
        }
    };

    const handleLoadTemplate = (templateId: string) => {
        dispatch({ 
            type: ActionType.LOAD_MIDI_MAPPING_TEMPLATE, 
            payload: { templateId } 
        });
        setIsOpen(false);
    };

    const handleDeleteTemplate = (templateId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('このテンプレートを削除しますか？')) {
            dispatch({ 
                type: ActionType.DELETE_MIDI_MAPPING_TEMPLATE, 
                payload: { templateId } 
            });
        }
    };

    const formatMappingInfo = (mapping: { cc: number; paramIds: string[] }) => {
        return `CC${mapping.cc}: ${mapping.paramIds.length} params`;
    };

    const handleTemplateSwitchLearn = (templateId: string) => {
        setIsLearningTemplateSwitch(true);
        learnTemplateIdRef.current = templateId;
        // Listen for MIDI CC
        const handleMidiMessage = (event: MIDIMessageEvent) => {
            const [status, data1] = event.data;
            if (status >= 176 && status <= 191 && learnTemplateIdRef.current) {
                const cc = data1;
                dispatch({
                    type: ActionType.SET_TEMPLATE_SWITCH_MAPPING,
                    payload: { cc, templateId: learnTemplateIdRef.current },
                });
                setIsLearningTemplateSwitch(false);
                learnTemplateIdRef.current = null;
                setShowTemplateSwitchDialog(null);
                // Remove listener
                if (navigator.requestMIDIAccess) {
                    navigator.requestMIDIAccess().then(midiAccess => {
                        const inputs = midiAccess.inputs.values();
                        for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                            input.value.onmidimessage = null;
                        }
                    });
                }
            }
        };

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(midiAccess => {
                const inputs = midiAccess.inputs.values();
                for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                    input.value.onmidimessage = handleMidiMessage;
                }
                midiAccess.onstatechange = (event: MIDIConnectionEvent) => {
                    if (event.port.type === 'input' && event.port.state === 'connected') {
                        (event.port as MIDIInput).onmidimessage = handleMidiMessage;
                    }
                };
            });
        }
    };

    const getTemplateSwitchCc = (templateId: string) => {
        const mapping = state.templateSwitchMappings.find(m => m.templateId === templateId);
        return mapping?.cc;
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="px-3 py-1.5 text-xs font-bold rounded-md bg-indigo-400 hover:bg-indigo-500 text-white"
                title="MIDIマッピングテンプレート管理"
            >
                MIDI
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl p-4 w-11/12 max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">MIDIマッピングテンプレート</h3>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-slate-500 hover:text-slate-700 text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Bank-wide mode toggle */}
                <div className="mb-4 p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-bold text-sm">BANK単位一括アサイン</div>
                            <div className="text-xs text-slate-600 mt-1">
                                有効時、1パッドのパラメータをアサインすると同じBANKの全8パッドに自動アサインされます
                            </div>
                        </div>
                        <button
                            onClick={() => dispatch({ type: ActionType.TOGGLE_BANK_WIDE_MIDI_LEARN })}
                            className={`px-4 py-2 rounded font-bold text-sm transition-colors ${
                                state.bankWideMidiLearn
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-300 text-slate-700'
                            }`}
                        >
                            {state.bankWideMidiLearn ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* Current mappings info */}
                <div className="mb-4 p-2 bg-slate-100 rounded text-sm">
                    <div className="font-bold mb-1">現在のマッピング:</div>
                    {state.midiMappings.length === 0 ? (
                        <div className="text-slate-500">マッピングがありません</div>
                    ) : (
                        <div className="space-y-1">
                            {state.midiMappings.map((mapping, idx) => (
                                <div key={idx} className="text-xs">
                                    {formatMappingInfo(mapping)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save template */}
                <div className="mb-4">
                    <button
                        onClick={() => setShowSaveDialog(true)}
                        disabled={state.midiMappings.length === 0}
                        className="w-full py-2 bg-emerald-400 hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded transition-colors"
                    >
                        現在のマッピングを保存
                    </button>
                    
                    {showSaveDialog && (
                        <div className="mt-2 p-2 bg-slate-50 rounded border">
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="テンプレート名を入力"
                                className="w-full px-2 py-1 border rounded mb-2"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveTemplate();
                                    } else if (e.key === 'Escape') {
                                        setShowSaveDialog(false);
                                        setTemplateName('');
                                    }
                                }}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSaveTemplate}
                                    disabled={!templateName.trim()}
                                    className="flex-1 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold rounded text-sm"
                                >
                                    保存
                                </button>
                                <button
                                    onClick={() => {
                                        setShowSaveDialog(false);
                                        setTemplateName('');
                                    }}
                                    className="flex-1 py-1 bg-slate-400 hover:bg-slate-500 text-white font-bold rounded text-sm"
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Load templates */}
                <div>
                    <div className="font-bold mb-2">保存済みテンプレート:</div>
                    {state.midiMappingTemplates.length === 0 ? (
                        <div className="text-slate-500 text-sm py-4 text-center">
                            保存されたテンプレートがありません
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {state.midiMappingTemplates.map((template) => {
                                const switchCc = getTemplateSwitchCc(template.id);
                                const isLearning = showTemplateSwitchDialog === template.id && isLearningTemplateSwitch;
                                return (
                                    <div
                                        key={template.id}
                                        className="p-2 border rounded hover:bg-emerald-50 relative group"
                                    >
                                        <div 
                                            className="cursor-pointer"
                                            onClick={() => handleLoadTemplate(template.id)}
                                        >
                                            <div className="font-bold text-sm">{template.name}</div>
                                            <div className="text-xs text-slate-600 mt-1">
                                                {template.mappings.length} マッピング
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {new Date(template.createdAt).toLocaleString('ja-JP')}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => handleLoadTemplate(template.id)}
                                                className="flex-1 py-1 bg-emerald-400 hover:bg-emerald-500 text-white font-bold rounded text-xs"
                                            >
                                                読み込み
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (switchCc !== undefined) {
                                                        dispatch({
                                                            type: ActionType.REMOVE_TEMPLATE_SWITCH_MAPPING,
                                                            payload: { cc: switchCc },
                                                        });
                                                    } else {
                                                        setShowTemplateSwitchDialog(template.id);
                                                        handleTemplateSwitchLearn(template.id);
                                                    }
                                                }}
                                                className={`flex-1 py-1 font-bold rounded text-xs transition-colors ${
                                                    isLearning
                                                        ? 'bg-yellow-400 text-slate-800 animate-pulse'
                                                        : switchCc !== undefined
                                                        ? 'bg-purple-400 hover:bg-purple-500 text-white'
                                                        : 'bg-indigo-400 hover:bg-indigo-500 text-white'
                                                }`}
                                                title={
                                                    isLearning
                                                        ? 'MIDI CCを動かしてください...'
                                                        : switchCc !== undefined
                                                        ? `CC${switchCc}で切り替え (クリックで削除)`
                                                        : 'MIDI CCをアサインしてライブ切り替え'
                                                }
                                            >
                                                {isLearning
                                                    ? '学習中...'
                                                    : switchCc !== undefined
                                                    ? `CC${switchCc}`
                                                    : 'CC設定'}
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteTemplate(template.id, e)}
                                                className="w-8 h-8 bg-red-400 hover:bg-red-500 text-white rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="削除"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MidiTemplateManager;
