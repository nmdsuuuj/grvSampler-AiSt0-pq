import React, { useState, useContext, useEffect, useCallback } from 'react';
import { AppContext } from '../../context/AppContext';
import { db, Project, StorableSample } from '../../db';
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
    const buffer = audioContext.createBuffer(
        storable.numberOfChannels,
        storable.length,
        storable.sampleRate
    );
    for (let i = 0; i < storable.numberOfChannels; i++) {
        buffer.copyToChannel(storable.channelData[i], i);
    }
    return buffer;
};


interface ProjectViewProps {
    loadSampleFromBlob: (blob: Blob, sampleId: number, name?: string) => Promise<void>;
}

const ProjectView: React.FC<ProjectViewProps> = ({ loadSampleFromBlob }) => {
    const { state, dispatch } = useContext(AppContext);
    const [projectName, setProjectName] = useState('New Project');
    const [projects, setProjects] = useState<Project[]>([]);

    const refreshProjects = useCallback(async () => {
        const projs = await db.projects.orderBy('createdAt').reverse().toArray();
        setProjects(projs);
    }, []);

    useEffect(() => {
        refreshProjects();
    }, [refreshProjects]);

    const handleSave = async () => {
        if (!projectName.trim()) {
            alert('Please enter a project name.');
            return;
        }

        const { audioContext, isInitialized, isPlaying, isRecording, currentStep, samples, grooves, ...restOfState } = state;
        
        const storableSamples: StorableSample[] = samples.map(s => ({
            ...s,
            buffer: undefined, // remove non-serializable property
            bufferData: audioBufferToStorable(s.buffer),
        }));

        const project: Project = {
            name: projectName.trim(),
            createdAt: new Date(),
            state: restOfState,
            samples: storableSamples,
        };

        try {
            await db.projects.add(project);
            alert(`Project "${project.name}" saved!`);
            refreshProjects();
        } catch (error) {
            console.error('Failed to save project:', error);
            alert('Error saving project.');
        }
    };

    const handleLoad = useCallback(async (projectId: number) => {
        if (!state.audioContext) {
            alert("Audio engine not initialized. Please interact with the app first.");
            return;
        }
        const project = await db.projects.get(projectId);
        if (!project) return;
    
        const newSamples: Sample[] = project.samples.map(storableSample => ({
            id: storableSample.id,
            name: storableSample.name,
            buffer: storableToAudioBuffer(storableSample.bufferData, state.audioContext!),
            volume: storableSample.volume,
            pitch: storableSample.pitch,
            start: storableSample.start,
            decay: storableSample.decay,
        }));
        
        const stateToLoad: Partial<AppState> = {
            ...project.state,
            samples: newSamples,
        };
        
        dispatch({ type: ActionType.LOAD_PROJECT_STATE, payload: stateToLoad });

        alert(`Project "${project.name}" loaded!`);
    }, [state.audioContext, dispatch]);

    const handleDelete = async (projectId: number) => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            await db.projects.delete(projectId);
            refreshProjects();
        }
    };

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const sampleId = state.activeSampleId;
            loadSampleFromBlob(file, sampleId, file.name.replace(/\.[^/.]+$/, ""));
            alert(`Importing ${file.name} to active sample pad. Switch to Sample view to see it.`);
            event.target.value = ''; // Reset input to allow re-uploading the same file
        }
    };

    return (
        <div className="flex flex-col h-full p-2 space-y-4">
            <h2 className="text-xl font-bold text-center flex-shrink-0">Project Management</h2>

            <div className="bg-slate-800 p-4 rounded-lg space-y-3">
                <h3 className="font-bold">Save Current Project</h3>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className="bg-slate-700 text-white rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="Project Name"
                    />
                    <button onClick={handleSave} className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-4 py-2 rounded">
                        Save
                    </button>
                </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-lg space-y-3 flex-grow flex flex-col min-h-0">
                <h3 className="font-bold">Load Project</h3>
                <ul className="space-y-2 overflow-y-auto pr-2">
                    {projects?.map(p => (
                        <li key={p.id} className="flex items-center justify-between bg-slate-700 p-2 rounded">
                            <div>
                                <p className="font-semibold">{p.name}</p>
                                <p className="text-xs text-slate-400">{p.createdAt.toLocaleString()}</p>
                            </div>
                            <div className="space-x-2">
                                <button onClick={() => handleLoad(p.id!)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded text-sm">Load</button>
                                <button onClick={() => handleDelete(p.id!)} className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1 rounded text-sm">Del</button>
                            </div>
                        </li>
                    ))}
                    {projects?.length === 0 && <p className="text-slate-400 text-center py-4">No saved projects.</p>}
                </ul>
            </div>

            <div className="bg-slate-800 p-4 rounded-lg space-y-3">
                <h3 className="font-bold">Import Audio</h3>
                <p className="text-sm text-slate-400">Import an audio file to the currently selected sample pad.</p>
                <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileImport}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
                />
            </div>
        </div>
    );
};

export default ProjectView;
