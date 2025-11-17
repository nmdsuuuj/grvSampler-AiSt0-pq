import React, { useState, useContext, useEffect, useCallback } from 'react';
import { AppContext } from '../../context/AppContext';
import { db, Project, StorableSample, SampleKit } from '../../db';
import { ActionType, AppState, Sample } from '../../types';

const audioBufferToStorable = (buffer: AudioBuffer | null): StorableSample['bufferData'] => {
    if (!buffer) return null;
    const channelData: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channelData.push(buffer.getChannelData(i));
    }
    return {
        channelData,
        sampleRate: buffer.sampleRate,
        length: buffer.length,
        numberOfChannels: buffer.numberOfChannels,
    };
};

const storableToAudioBuffer = (storable: StorableSample['bufferData'] | null, audioContext: AudioContext): AudioBuffer | null => {
    if (!storable) return null;
    try {
        const buffer = audioContext.createBuffer(
            storable.numberOfChannels,
            storable.length,
            storable.sampleRate
        );
        for (let i = 0; i < storable.numberOfChannels; i++) {
            buffer.copyToChannel(storable.channelData[i], i);
        }
        return buffer;
    } catch (e) {
        console.error("Error creating AudioBuffer from stored data:", e);
        return null;
    }
};

const ManualModal = ({ onClose }: { onClose: () => void }) => {
    const manualContent = `
Groove Sampler 日本語マニュアル

このドキュメントでは、アプリの基本的な操作とPCキーボードでのショートカットについて説明します。

------------------------------------------------------------------

## PCキーボードショートカット

### グローバルコントロール
(これらのショートカットは、どの画面でも機能します)

キー | 機能                 | 説明
------------------------------------------------------------------
A    | オクターブDOWN       | 演奏用キーボードのオクターブを1つ下げます。
F    | オクターブUP         | 演奏用キーボードのオクターブを1つ上げます。
K    | ルート音DOWN         | 曲のキー（ルート音）を半音下げます。
L    | ルート音UP           | 曲のキー（ルート音）を半音上げます。
/    | スケール切り替え(UP) | スケールのリストを1つ上に移動します。
\\   | スケール切り替え(DOWN)| スケールのリストを1つ下に移動します。


### パッド & バンク操作

キー      | 機能                  | 説明
------------------------------------------------------------------
1 - 8     | パッドトリガー & 選択 | 現在選択されているバンクの対応するパッドの音を鳴らし、選択します。
9, 0, -,^ | バンク切り替え        | それぞれバンクA, B, C, Dに切り替えます。


### ノート演奏 & リアルタイムレコーディング
(PCキーボードの下2段が鍵盤になります)

キー                      | 鍵盤
------------------------------------------------------------------
z, x, c, v, b, n, m, ,    | 白鍵
s, d, g, h, j             | 黒鍵

- スケール連動: 演奏はSEQ画面で設定されたキーとスケールに自動でマッピングされます。
- リアルタイムREC: SEQ画面の'REC'モード中に再生すると、演奏がパターンに記録されます。


### SAMPLE画面 ショートカット
(SAMPLE画面がアクティブな時のみ機能します)

キー | 機能             | 説明
------------------------------------------------------------------
Q    | 録音 ARM / STOP  | サンプルの録音を開始（ARM）、または停止します。
W    | サンプルコピー   | 現在選択されているサンプルをコピーします。
E    | サンプルペースト | コピーしたサンプルを現在のパッドに貼り付けます。
`;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-4 w-11/12 max-w-md" onClick={e => e.stopPropagation()}>
                <pre className="text-xs font-mono bg-emerald-50 p-3 rounded-md max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {manualContent.trim()}
                </pre>
                <button
                    onClick={onClose}
                    className="mt-4 w-full bg-pink-400 hover:bg-pink-500 text-white font-bold py-2 rounded"
                >
                    閉じる
                </button>
            </div>
        </div>
    );
};


const ProjectView: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const [projectName, setProjectName] = useState('New Project');
    const [kitName, setKitName] = useState('New Kit');
    const [projects, setProjects] = useState<Project[]>([]);
    const [kits, setKits] = useState<SampleKit[]>([]);
    const [isManualOpen, setIsManualOpen] = useState(false);

    const refreshData = useCallback(async () => {
        const projs = await db.projects.orderBy('createdAt').reverse().toArray();
        setProjects(projs);
        const sampleKits = await db.sampleKits.orderBy('createdAt').reverse().toArray();
        setKits(sampleKits);
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);
    
    const samplesToStorable = (samples: Sample[]): StorableSample[] => {
        return samples.map(s => ({
            ...s,
            buffer: undefined,
            bufferData: audioBufferToStorable(s.buffer),
        }));
    };

    const handleSaveProject = async () => {
        if (!projectName.trim()) {
            alert('Please enter a project name.');
            return;
        }
        // FIX: Renamed `currentStep` to `currentSteps` in destructuring to match the `AppState` interface and correctly exclude it from the saved project state.
        const { audioContext, isInitialized, isPlaying, isRecording, currentSteps, samples, grooves, ...restOfState } = state;
        const project: Project = {
            name: projectName.trim(),
            createdAt: new Date(),
            state: restOfState,
            samples: samplesToStorable(samples),
        };
        await db.projects.add(project);
        alert(`Project "${project.name}" saved!`);
        refreshData();
    };

    const handleLoadProject = useCallback(async (projectId: number) => {
        if (!state.audioContext) return;
        const project = await db.projects.get(projectId);
        if (!project) return;
    
        const newSamples: Sample[] = project.samples.map(s => ({ ...s, buffer: storableToAudioBuffer(s.bufferData, state.audioContext!) }));
        const stateToLoad: Partial<AppState> = { ...project.state, samples: newSamples };
        dispatch({ type: ActionType.LOAD_PROJECT_STATE, payload: stateToLoad });
        alert(`Project "${project.name}" loaded!`);
    }, [state.audioContext, dispatch]);

    const handleDeleteProject = async (projectId: number) => {
        if (window.confirm('Delete this project?')) {
            await db.projects.delete(projectId);
            refreshData();
        }
    };
    
    const handleSaveKit = async () => {
        if (!kitName.trim()) {
            alert('Please enter a kit name.');
            return;
        }
        const kit: SampleKit = {
            name: kitName.trim(),
            createdAt: new Date(),
            samples: samplesToStorable(state.samples),
        };
        await db.sampleKits.add(kit);
        alert(`Kit "${kit.name}" saved!`);
        refreshData();
    };
    
    const handleLoadKit = useCallback(async (kitId: number) => {
        if (!state.audioContext) return;
        const kit = await db.sampleKits.get(kitId);
        if (!kit) return;
        
        const newSamples: Sample[] = kit.samples.map(s => ({ ...s, buffer: storableToAudioBuffer(s.bufferData, state.audioContext!) }));
        dispatch({ type: ActionType.SET_SAMPLES, payload: newSamples });
        alert(`Kit "${kit.name}" loaded!`);
    }, [state.audioContext, dispatch]);
    
    const handleDeleteKit = async (kitId: number) => {
        if (window.confirm('Delete this kit?')) {
            await db.sampleKits.delete(kitId);
            refreshData();
        }
    };

    return (
        <div className="flex flex-col h-full p-2 space-y-2 overflow-y-auto">
             {isManualOpen && <ManualModal onClose={() => setIsManualOpen(false)} />}
            <div className="flex justify-between items-center flex-shrink-0">
                 <h2 className="text-xl font-bold text-center">Project & Kit Management</h2>
                 <button
                    onClick={() => setIsManualOpen(true)}
                    className="bg-sky-400 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2 rounded"
                >
                    マニュアル
                </button>
            </div>


            {/* Project Management */}
            <div className="bg-white shadow-md p-3 rounded-lg space-y-2">
                <h3 className="font-bold text-slate-700">Project</h3>
                <div className="flex space-x-2">
                    <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-emerald-100 text-slate-800 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-pink-400" placeholder="Project Name" />
                    <button onClick={handleSaveProject} className="bg-pink-400 hover:bg-pink-500 text-white font-bold px-4 py-2 rounded">Save</button>
                </div>
                <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                    {projects?.map(p => (
                        <li key={p.id} className="flex items-center justify-between bg-emerald-50 p-1.5 rounded text-sm">
                            <div><p className="font-semibold">{p.name}</p><p className="text-xs text-slate-500">{p.createdAt.toLocaleDateString()}</p></div>
                            <div className="space-x-1"><button onClick={() => handleLoadProject(p.id!)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs">Load</button><button onClick={() => handleDeleteProject(p.id!)} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-2 py-1 rounded text-xs">Del</button></div>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Sample Kit Management */}
            <div className="bg-white shadow-md p-3 rounded-lg space-y-2">
                <h3 className="font-bold text-slate-700">Sample Kit</h3>
                 <div className="flex space-x-2">
                    <input type="text" value={kitName} onChange={(e) => setKitName(e.target.value)} className="bg-emerald-100 text-slate-800 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-400" placeholder="Kit Name" />
                    <button onClick={handleSaveKit} className="bg-sky-400 hover:bg-sky-500 text-white font-bold px-4 py-2 rounded">Save Kit</button>
                </div>
                <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                     {kits?.map(k => (
                        <li key={k.id} className="flex items-center justify-between bg-emerald-50 p-1.5 rounded text-sm">
                            <div><p className="font-semibold">{k.name}</p><p className="text-xs text-slate-500">{k.createdAt.toLocaleDateString()}</p></div>
                            <div className="space-x-1"><button onClick={() => handleLoadKit(k.id!)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs">Load</button><button onClick={() => handleDeleteKit(k.id!)} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-2 py-1 rounded text-xs">Del</button></div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ProjectView;