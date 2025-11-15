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

const ProjectView: React.FC = () => {
    const { state, dispatch } = useContext(AppContext);
    const [projectName, setProjectName] = useState('New Project');
    const [kitName, setKitName] = useState('New Kit');
    const [projects, setProjects] = useState<Project[]>([]);
    const [kits, setKits] = useState<SampleKit[]>([]);
    const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number; percentage: number } | null>(null);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [editingKitId, setEditingKitId] = useState<number | null>(null);
    const [editProjectName, setEditProjectName] = useState('');
    const [editKitName, setEditKitName] = useState('');
    const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set());
    const [selectedKits, setSelectedKits] = useState<Set<number>>(new Set());
    const [showBulkDelete, setShowBulkDelete] = useState(false);
    const [showDateRangeDelete, setShowDateRangeDelete] = useState(false);
    const [dateRangeDays, setDateRangeDays] = useState<number>(30);
    const [showCleanup, setShowCleanup] = useState(false);
    const [cleanupInfo, setCleanupInfo] = useState<{ unusedSamples: number; duplicateProjects: number; duplicateKits: number } | null>(null);

    const refreshData = useCallback(async () => {
        const projs = await db.projects.orderBy('createdAt').reverse().toArray();
        setProjects(projs);
        const sampleKits = await db.sampleKits.orderBy('createdAt').reverse().toArray();
        setKits(sampleKits);
        
        // Check storage usage
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                const usage = estimate.usage || 0;
                const quota = estimate.quota || 0;
                const percentage = quota > 0 ? (usage / quota) * 100 : 0;
                setStorageInfo({ usage, quota, percentage });
            } catch (error) {
                console.error('Error checking storage:', error);
            }
        }
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
            alert('プロジェクト名を入力してください。');
            return;
        }
        
        try {
            // Exclude transient state that shouldn't be saved
            const { 
                audioContext, 
                isInitialized, 
                isPlaying, 
                isRecording, 
                isArmed,
                currentSteps, 
                samples, 
                grooves,
                midiLearnMode, // Temporary learning state - don't save
                ...restOfState 
            } = state;
            
            // Explicitly ensure MIDI-related state is included
            const project: Project = {
                name: projectName.trim(),
                createdAt: new Date(),
                state: {
                    ...restOfState,
                    // Explicitly include MIDI state to ensure it's saved
                    midiMappings: state.midiMappings,
                    midiMappingTemplates: state.midiMappingTemplates,
                    templateSwitchMappings: state.templateSwitchMappings,
                    bankWideMidiLearn: state.bankWideMidiLearn,
                },
                samples: samplesToStorable(samples),
            };
            
            await db.projects.add(project);
            alert(`プロジェクト "${project.name}" を保存しました！`);
            setProjectName('New Project'); // Reset input
            refreshData();
        } catch (error: any) {
            console.error('Error saving project:', error);
            if (error.name === 'QuotaExceededError') {
                alert('ストレージが満杯です。古いプロジェクトを削除するか、ストレージをクリーンアップしてください。');
            } else {
                alert(`プロジェクトの保存に失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    };

    const handleLoadProject = useCallback(async (projectId: number) => {
        if (!state.audioContext) {
            alert('オーディオコンテキストが初期化されていません。');
            return;
        }
        
        try {
            const project = await db.projects.get(projectId);
            if (!project) {
                alert('プロジェクトが見つかりません。');
                return;
            }
            
            // Clear current samples from memory first to free up space
            const currentSamples = state.samples.map(s => ({ ...s, buffer: null }));
            dispatch({ type: ActionType.SET_SAMPLES, payload: currentSamples });
            
            // Force garbage collection hint (browser may or may not honor this)
            if (window.gc) {
                window.gc();
            }
            
            // Convert stored samples back to AudioBuffers in batches to avoid memory spikes
            const BATCH_SIZE = 8; // Process 8 samples at a time
            const newSamples: Sample[] = [...state.samples];
            
            for (let i = 0; i < project.samples.length; i += BATCH_SIZE) {
                const batch = project.samples.slice(i, i + BATCH_SIZE);
                const batchBuffers = await Promise.all(
                    batch.map(async (s) => {
                        const buffer = storableToAudioBuffer(s.bufferData, state.audioContext!);
                        return { ...s, buffer };
                    })
                );
                
                // Update samples array in place
                batch.forEach((s, idx) => {
                    const sampleIndex = s.id;
                    if (sampleIndex >= 0 && sampleIndex < newSamples.length) {
                        newSamples[sampleIndex] = batchBuffers[idx];
                    }
                });
                
                // Small delay to allow browser to process
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const stateToLoad: Partial<AppState> = { 
                ...project.state, 
                samples: newSamples,
                // Ensure MIDI state is loaded (for backward compatibility with old projects)
                midiMappings: project.state.midiMappings || [],
                midiMappingTemplates: project.state.midiMappingTemplates || [],
                templateSwitchMappings: project.state.templateSwitchMappings || [],
                bankWideMidiLearn: project.state.bankWideMidiLearn || false,
            };
            
            dispatch({ type: ActionType.LOAD_PROJECT_STATE, payload: stateToLoad });
            alert(`プロジェクト "${project.name}" を読み込みました！`);
        } catch (error: any) {
            console.error('Error loading project:', error);
            if (error.name === 'QuotaExceededError') {
                alert('メモリが不足しています。他のアプリを閉じてから再度お試しください。');
            } else {
                alert(`プロジェクトの読み込みに失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    }, [state.audioContext, state.samples, dispatch]);

    const handleDeleteProject = async (projectId: number) => {
        if (!window.confirm('このプロジェクトを削除しますか？')) {
            return;
        }
        
        try {
            await db.projects.delete(projectId);
            refreshData();
        } catch (error: any) {
            console.error('Error deleting project:', error);
            alert(`プロジェクトの削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };
    
    const handleSaveKit = async () => {
        if (!kitName.trim()) {
            alert('キット名を入力してください。');
            return;
        }
        
        try {
            const kit: SampleKit = {
                name: kitName.trim(),
                createdAt: new Date(),
                samples: samplesToStorable(state.samples),
            };
            
            await db.sampleKits.add(kit);
            alert(`キット "${kit.name}" を保存しました！`);
            setKitName('New Kit'); // Reset input
            refreshData();
        } catch (error: any) {
            console.error('Error saving kit:', error);
            if (error.name === 'QuotaExceededError') {
                alert('ストレージが満杯です。古いキットを削除するか、ストレージをクリーンアップしてください。');
            } else {
                alert(`キットの保存に失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    };
    
    const handleLoadKit = useCallback(async (kitId: number) => {
        if (!state.audioContext) {
            alert('オーディオコンテキストが初期化されていません。');
            return;
        }
        
        try {
            const kit = await db.sampleKits.get(kitId);
            if (!kit) {
                alert('キットが見つかりません。');
                return;
            }
            
            // Load kit samples in batches to avoid memory spikes
            const BATCH_SIZE = 8;
            const newSamples = [...state.samples];
            
            for (let i = 0; i < kit.samples.length; i += BATCH_SIZE) {
                const batch = kit.samples.slice(i, i + BATCH_SIZE);
                const batchBuffers = await Promise.all(
                    batch.map(async (s) => {
                        const buffer = storableToAudioBuffer(s.bufferData, state.audioContext!);
                        return { ...s, buffer };
                    })
                );
                
                // Update samples array in place
                batch.forEach((s, idx) => {
                    const sampleIndex = s.id;
                    if (sampleIndex >= 0 && sampleIndex < newSamples.length) {
                        newSamples[sampleIndex] = batchBuffers[idx];
                    }
                });
                
                // Small delay to allow browser to process
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            dispatch({ type: ActionType.SET_SAMPLES, payload: newSamples });
            alert(`キット "${kit.name}" を読み込みました！`);
        } catch (error: any) {
            console.error('Error loading kit:', error);
            if (error.name === 'QuotaExceededError') {
                alert('メモリが不足しています。他のアプリを閉じてから再度お試しください。');
            } else {
                alert(`キットの読み込みに失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    }, [state.audioContext, state.samples, dispatch]);
    
    const handleDeleteKit = async (kitId: number) => {
        if (!window.confirm('このキットを削除しますか？')) {
            return;
        }
        
        try {
            await db.sampleKits.delete(kitId);
            refreshData();
        } catch (error: any) {
            console.error('Error deleting kit:', error);
            alert(`キットの削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    // Export/Import functions
    const handleExportProject = async (projectId: number) => {
        try {
            const project = await db.projects.get(projectId);
            if (!project) {
                alert('プロジェクトが見つかりません。');
                return;
            }
            
            const json = JSON.stringify(project, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error('Error exporting project:', error);
            alert(`プロジェクトのエクスポートに失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleExportKit = async (kitId: number) => {
        try {
            const kit = await db.sampleKits.get(kitId);
            if (!kit) {
                alert('キットが見つかりません。');
                return;
            }
            
            const json = JSON.stringify(kit, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${kit.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error('Error exporting kit:', error);
            alert(`キットのエクスポートに失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedProject = JSON.parse(text) as Project;
            
            // Validate project structure
            if (!importedProject.name || !importedProject.state || !importedProject.samples) {
                alert('無効なプロジェクトファイルです。');
                return;
            }
            
            // Generate new ID and timestamp
            const { id, ...projectWithoutId } = importedProject;
            const project: Project = {
                ...projectWithoutId,
                name: `${importedProject.name} (インポート)`,
                createdAt: new Date(),
            };
            
            await db.projects.add(project);
            alert(`プロジェクト "${project.name}" をインポートしました！`);
            event.target.value = ''; // Reset file input
            refreshData();
        } catch (error: any) {
            console.error('Error importing project:', error);
            if (error.name === 'QuotaExceededError') {
                alert('ストレージが満杯です。古いプロジェクトを削除してください。');
            } else {
                alert(`プロジェクトのインポートに失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    };

    const handleImportKit = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedKit = JSON.parse(text) as SampleKit;
            
            // Validate kit structure
            if (!importedKit.name || !importedKit.samples) {
                alert('無効なキットファイルです。');
                return;
            }
            
            // Generate new ID and timestamp
            const { id, ...kitWithoutId } = importedKit;
            const kit: SampleKit = {
                ...kitWithoutId,
                name: `${importedKit.name} (インポート)`,
                createdAt: new Date(),
            };
            
            await db.sampleKits.add(kit);
            alert(`キット "${kit.name}" をインポートしました！`);
            event.target.value = ''; // Reset file input
            refreshData();
        } catch (error: any) {
            console.error('Error importing kit:', error);
            if (error.name === 'QuotaExceededError') {
                alert('ストレージが満杯です。古いキットを削除してください。');
            } else {
                alert(`キットのインポートに失敗しました: ${error.message || '不明なエラー'}`);
            }
        }
    };

    const handleRenameProject = async (projectId: number, newName: string) => {
        if (!newName.trim()) {
            alert('プロジェクト名を入力してください。');
            return;
        }
        
        try {
            await db.projects.update(projectId, { name: newName.trim() });
            setEditingProjectId(null);
            refreshData();
        } catch (error: any) {
            console.error('Error renaming project:', error);
            alert(`プロジェクト名の変更に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleRenameKit = async (kitId: number, newName: string) => {
        if (!newName.trim()) {
            alert('キット名を入力してください。');
            return;
        }
        
        try {
            await db.sampleKits.update(kitId, { name: newName.trim() });
            setEditingKitId(null);
            refreshData();
        } catch (error: any) {
            console.error('Error renaming kit:', error);
            alert(`キット名の変更に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const startEditingProject = (project: Project) => {
        setEditingProjectId(project.id!);
        setEditProjectName(project.name);
    };

    const startEditingKit = (kit: SampleKit) => {
        setEditingKitId(kit.id!);
        setEditKitName(kit.name);
    };

    const handleToggleProjectSelection = (projectId: number) => {
        const newSelected = new Set(selectedProjects);
        if (newSelected.has(projectId)) {
            newSelected.delete(projectId);
        } else {
            newSelected.add(projectId);
        }
        setSelectedProjects(newSelected);
    };

    const handleToggleKitSelection = (kitId: number) => {
        const newSelected = new Set(selectedKits);
        if (newSelected.has(kitId)) {
            newSelected.delete(kitId);
        } else {
            newSelected.add(kitId);
        }
        setSelectedKits(newSelected);
    };

    const handleBulkDeleteProjects = async () => {
        if (selectedProjects.size === 0) {
            alert('削除するプロジェクトを選択してください。');
            return;
        }
        
        if (!window.confirm(`${selectedProjects.size}個のプロジェクトを削除しますか？`)) {
            return;
        }
        
        try {
            await Promise.all(Array.from(selectedProjects).map(id => db.projects.delete(id)));
            setSelectedProjects(new Set());
            setShowBulkDelete(false);
            refreshData();
            alert(`${selectedProjects.size}個のプロジェクトを削除しました。`);
        } catch (error: any) {
            console.error('Error bulk deleting projects:', error);
            alert(`一括削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleBulkDeleteKits = async () => {
        if (selectedKits.size === 0) {
            alert('削除するキットを選択してください。');
            return;
        }
        
        if (!window.confirm(`${selectedKits.size}個のキットを削除しますか？`)) {
            return;
        }
        
        try {
            await Promise.all(Array.from(selectedKits).map(id => db.sampleKits.delete(id)));
            setSelectedKits(new Set());
            setShowBulkDelete(false);
            refreshData();
            alert(`${selectedKits.size}個のキットを削除しました。`);
        } catch (error: any) {
            console.error('Error bulk deleting kits:', error);
            alert(`一括削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleDeleteProjectsByDateRange = async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays);
        
        const projectsToDelete = projects.filter(p => p.createdAt < cutoffDate);
        
        if (projectsToDelete.length === 0) {
            alert(`${dateRangeDays}日以上前のプロジェクトはありません。`);
            return;
        }
        
        if (!window.confirm(`${dateRangeDays}日以上前のプロジェクト${projectsToDelete.length}個を削除しますか？`)) {
            return;
        }
        
        try {
            await Promise.all(projectsToDelete.map(p => db.projects.delete(p.id!)));
            setShowDateRangeDelete(false);
            refreshData();
            alert(`${projectsToDelete.length}個のプロジェクトを削除しました。`);
        } catch (error: any) {
            console.error('Error deleting projects by date range:', error);
            alert(`削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const handleDeleteKitsByDateRange = async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays);
        
        const kitsToDelete = kits.filter(k => k.createdAt < cutoffDate);
        
        if (kitsToDelete.length === 0) {
            alert(`${dateRangeDays}日以上前のキットはありません。`);
            return;
        }
        
        if (!window.confirm(`${dateRangeDays}日以上前のキット${kitsToDelete.length}個を削除しますか？`)) {
            return;
        }
        
        try {
            await Promise.all(kitsToDelete.map(k => db.sampleKits.delete(k.id!)));
            setShowDateRangeDelete(false);
            refreshData();
            alert(`${kitsToDelete.length}個のキットを削除しました。`);
        } catch (error: any) {
            console.error('Error deleting kits by date range:', error);
            alert(`削除に失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const analyzeCleanup = useCallback(async () => {
        // Find unused samples (samples that are not referenced in any project)
        const allProjects = await db.projects.toArray();
        const usedSampleIds = new Set<number>();
        
        allProjects.forEach(project => {
            project.samples.forEach(sample => {
                usedSampleIds.add(sample.id);
            });
        });
        
        // Count unused samples (samples with IDs not in any project)
        const unusedSamples = state.samples.filter(s => !usedSampleIds.has(s.id) && s.buffer !== null).length;
        
        // Find duplicate projects (same name and similar creation time)
        const projectGroups = new Map<string, Project[]>();
        allProjects.forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!projectGroups.has(key)) {
                projectGroups.set(key, []);
            }
            projectGroups.get(key)!.push(p);
        });
        
        let duplicateProjects = 0;
        projectGroups.forEach(group => {
            if (group.length > 1) {
                duplicateProjects += group.length - 1; // Keep one, count others as duplicates
            }
        });
        
        // Find duplicate kits
        const allKits = await db.sampleKits.toArray();
        const kitGroups = new Map<string, SampleKit[]>();
        allKits.forEach(k => {
            const key = k.name.toLowerCase().trim();
            if (!kitGroups.has(key)) {
                kitGroups.set(key, []);
            }
            kitGroups.get(key)!.push(k);
        });
        
        let duplicateKits = 0;
        kitGroups.forEach(group => {
            if (group.length > 1) {
                duplicateKits += group.length - 1;
            }
        });
        
        setCleanupInfo({
            unusedSamples,
            duplicateProjects,
            duplicateKits,
        });
    }, [state.samples]);

    const handleCleanupUnusedSamples = async () => {
        if (!cleanupInfo || cleanupInfo.unusedSamples === 0) {
            alert('削除できる未使用サンプルはありません。');
            return;
        }
        
        if (!window.confirm(`未使用のサンプル${cleanupInfo.unusedSamples}個を削除しますか？\n（プロジェクトに保存されているサンプルは影響を受けません）`)) {
            return;
        }
        
        // Note: This is a placeholder - actual cleanup would require more complex logic
        // since samples are stored within projects, not separately
        alert('未使用サンプルのクリーンアップ機能は、プロジェクト構造の変更が必要なため、将来のバージョンで実装予定です。');
    };

    const handleCleanupDuplicates = async () => {
        if (!cleanupInfo) return;
        
        const totalDuplicates = cleanupInfo.duplicateProjects + cleanupInfo.duplicateKits;
        if (totalDuplicates === 0) {
            alert('重複データは見つかりませんでした。');
            return;
        }
        
        if (!window.confirm(`重複プロジェクト${cleanupInfo.duplicateProjects}個、重複キット${cleanupInfo.duplicateKits}個を削除しますか？\n（各グループで最も古いものを残します）`)) {
            return;
        }
        
        try {
            // Clean up duplicate projects
            const allProjects = await db.projects.toArray();
            const projectGroups = new Map<string, Project[]>();
            allProjects.forEach(p => {
                const key = p.name.toLowerCase().trim();
                if (!projectGroups.has(key)) {
                    projectGroups.set(key, []);
                }
                projectGroups.get(key)!.push(p);
            });
            
            const projectsToDelete: number[] = [];
            projectGroups.forEach(group => {
                if (group.length > 1) {
                    // Sort by creation date, keep the oldest
                    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                    // Delete all except the first (oldest)
                    for (let i = 1; i < group.length; i++) {
                        projectsToDelete.push(group[i].id!);
                    }
                }
            });
            
            // Clean up duplicate kits
            const allKits = await db.sampleKits.toArray();
            const kitGroups = new Map<string, SampleKit[]>();
            allKits.forEach(k => {
                const key = k.name.toLowerCase().trim();
                if (!kitGroups.has(key)) {
                    kitGroups.set(key, []);
                }
                kitGroups.get(key)!.push(k);
            });
            
            const kitsToDelete: number[] = [];
            kitGroups.forEach(group => {
                if (group.length > 1) {
                    // Sort by creation date, keep the oldest
                    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                    // Delete all except the first (oldest)
                    for (let i = 1; i < group.length; i++) {
                        kitsToDelete.push(group[i].id!);
                    }
                }
            });
            
            await Promise.all([
                ...projectsToDelete.map(id => db.projects.delete(id)),
                ...kitsToDelete.map(id => db.sampleKits.delete(id)),
            ]);
            
            setShowCleanup(false);
            setCleanupInfo(null);
            refreshData();
            alert(`${projectsToDelete.length}個のプロジェクトと${kitsToDelete.length}個のキットを削除しました。`);
        } catch (error: any) {
            console.error('Error cleaning up duplicates:', error);
            alert(`クリーンアップに失敗しました: ${error.message || '不明なエラー'}`);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    return (
        <div className="flex flex-col h-full p-2 space-y-2 overflow-y-auto">
            <h2 className="text-xl font-bold text-center flex-shrink-0">Project & Kit Management</h2>
            
            {/* Storage Usage Info */}
            {storageInfo && (
                <div className={`bg-white shadow-md p-2 rounded-lg text-xs space-y-2 ${
                    storageInfo.percentage > 80 ? 'bg-red-50 border-2 border-red-300' :
                    storageInfo.percentage > 60 ? 'bg-yellow-50 border-2 border-yellow-300' :
                    'bg-slate-50'
                }`}>
                    <div className="flex justify-between items-center">
                        <span className="font-semibold">ストレージ使用量:</span>
                        <span className={storageInfo.percentage > 80 ? 'text-red-600 font-bold' : storageInfo.percentage > 60 ? 'text-yellow-600 font-bold' : 'text-slate-600'}>
                            {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)} ({storageInfo.percentage.toFixed(1)}%)
                        </span>
                    </div>
                    {storageInfo.percentage > 80 && (
                        <div className="text-red-600 text-xs">
                            ⚠️ ストレージがほぼ満杯です。古いデータを削除してください。
                        </div>
                    )}
                    {storageInfo.percentage > 60 && storageInfo.percentage <= 80 && (
                        <div className="text-yellow-600 text-xs">
                            ⚠️ ストレージ使用量が多くなっています。
                        </div>
                    )}
                    <button
                        onClick={() => {
                            setShowCleanup(!showCleanup);
                            if (!showCleanup) {
                                analyzeCleanup();
                            }
                        }}
                        className="w-full bg-purple-400 hover:bg-purple-500 text-white font-bold px-2 py-1 rounded text-xs"
                    >
                        {showCleanup ? 'クリーンアップを閉じる' : 'ストレージクリーンアップ'}
                    </button>
                    {showCleanup && (
                        <div className="bg-purple-50 border border-purple-200 rounded p-2 space-y-2">
                            {cleanupInfo ? (
                                <>
                                    <div className="text-xs space-y-1">
                                        <div>未使用サンプル: {cleanupInfo.unusedSamples}個</div>
                                        <div>重複プロジェクト: {cleanupInfo.duplicateProjects}個</div>
                                        <div>重複キット: {cleanupInfo.duplicateKits}個</div>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={handleCleanupDuplicates}
                                            disabled={cleanupInfo.duplicateProjects === 0 && cleanupInfo.duplicateKits === 0}
                                            className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold px-2 py-1 rounded text-xs"
                                        >
                                            重複を削除
                                        </button>
                                        <button
                                            onClick={analyzeCleanup}
                                            className="bg-slate-400 hover:bg-slate-500 text-white font-bold px-2 py-1 rounded text-xs"
                                        >
                                            再分析
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-xs text-slate-600">分析中...</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Project Management */}
            <div className="bg-white shadow-md p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700">Project</h3>
                    <div className="flex space-x-1">
                        <button
                            onClick={() => {
                                setShowBulkDelete(!showBulkDelete);
                                setSelectedProjects(new Set());
                            }}
                            className={`text-xs px-2 py-1 rounded font-bold ${
                                showBulkDelete ? 'bg-red-500 text-white' : 'bg-slate-300 text-slate-700'
                            }`}
                        >
                            {showBulkDelete ? 'キャンセル' : '一括削除'}
                        </button>
                        <button
                            onClick={() => setShowDateRangeDelete(!showDateRangeDelete)}
                            className={`text-xs px-2 py-1 rounded font-bold ${
                                showDateRangeDelete ? 'bg-orange-500 text-white' : 'bg-slate-300 text-slate-700'
                            }`}
                        >
                            日付範囲削除
                        </button>
                    </div>
                </div>
                
                {showDateRangeDelete && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-2">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold">削除する日数:</span>
                            <input
                                type="number"
                                value={dateRangeDays}
                                onChange={(e) => setDateRangeDays(parseInt(e.target.value) || 30)}
                                min="1"
                                className="w-20 bg-white border border-orange-300 rounded px-2 py-1 text-xs"
                            />
                            <span className="text-xs">日以上前</span>
                        </div>
                        <div className="flex space-x-2">
                            <button
                                onClick={handleDeleteProjectsByDateRange}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-1 rounded text-xs"
                            >
                                プロジェクト削除
                            </button>
                            <button
                                onClick={handleDeleteKitsByDateRange}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-1 rounded text-xs"
                            >
                                キット削除
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="flex space-x-2">
                    <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-emerald-100 text-slate-800 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-pink-400" placeholder="Project Name" />
                    <button onClick={handleSaveProject} className="bg-pink-400 hover:bg-pink-500 text-white font-bold px-4 py-2 rounded">Save</button>
                </div>
                <div className="flex space-x-2">
                    <label className="flex-1 bg-indigo-400 hover:bg-indigo-500 text-white font-bold px-3 py-2 rounded text-center text-sm cursor-pointer">
                        <input type="file" accept=".json" onChange={handleImportProject} className="hidden" />
                        インポート
                    </label>
                    {showBulkDelete && selectedProjects.size > 0 && (
                        <button
                            onClick={handleBulkDeleteProjects}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-2 rounded text-sm"
                        >
                            {selectedProjects.size}個削除
                        </button>
                    )}
                </div>
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {projects?.map(p => (
                        <li key={p.id} className={`flex items-center justify-between p-1.5 rounded text-sm ${
                            showBulkDelete && selectedProjects.has(p.id!) ? 'bg-red-100 border-2 border-red-400' : 'bg-emerald-50'
                        }`}>
                            {showBulkDelete && (
                                <input
                                    type="checkbox"
                                    checked={selectedProjects.has(p.id!)}
                                    onChange={() => handleToggleProjectSelection(p.id!)}
                                    className="mr-2 w-4 h-4"
                                />
                            )}
                            {editingProjectId === p.id ? (
                                <div className="flex-1 flex items-center space-x-1">
                                    <input
                                        type="text"
                                        value={editProjectName}
                                        onChange={(e) => setEditProjectName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleRenameProject(p.id!, editProjectName);
                                            } else if (e.key === 'Escape') {
                                                setEditingProjectId(null);
                                            }
                                        }}
                                        className="flex-1 bg-white border border-emerald-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleRenameProject(p.id!, editProjectName)}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs"
                                        title="保存"
                                    >
                                        ✓
                                    </button>
                                    <button
                                        onClick={() => setEditingProjectId(null)}
                                        className="bg-slate-400 hover:bg-slate-500 text-white font-bold px-2 py-1 rounded text-xs"
                                        title="キャンセル"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate">{p.name}</p>
                                        <p className="text-xs text-slate-500">{p.createdAt.toLocaleDateString('ja-JP')}</p>
                                    </div>
                                    <div className="flex space-x-1 flex-shrink-0">
                                        <button onClick={() => handleLoadProject(p.id!)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs" title="読み込み">Load</button>
                                        <button onClick={() => handleExportProject(p.id!)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-2 py-1 rounded text-xs" title="エクスポート">Exp</button>
                                        <button onClick={() => startEditingProject(p)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-2 py-1 rounded text-xs" title="名前変更">Rename</button>
                                        <button onClick={() => handleDeleteProject(p.id!)} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-2 py-1 rounded text-xs" title="削除">Del</button>
                                    </div>
                                </>
                            )}
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
                <div className="flex space-x-2">
                    <label className="flex-1 bg-indigo-400 hover:bg-indigo-500 text-white font-bold px-3 py-2 rounded text-center text-sm cursor-pointer">
                        <input type="file" accept=".json" onChange={handleImportKit} className="hidden" />
                        インポート
                    </label>
                    {showBulkDelete && selectedKits.size > 0 && (
                        <button
                            onClick={handleBulkDeleteKits}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-2 rounded text-sm"
                        >
                            {selectedKits.size}個削除
                        </button>
                    )}
                </div>
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                     {kits?.map(k => (
                        <li key={k.id} className={`flex items-center justify-between p-1.5 rounded text-sm ${
                            showBulkDelete && selectedKits.has(k.id!) ? 'bg-red-100 border-2 border-red-400' : 'bg-emerald-50'
                        }`}>
                            {showBulkDelete && (
                                <input
                                    type="checkbox"
                                    checked={selectedKits.has(k.id!)}
                                    onChange={() => handleToggleKitSelection(k.id!)}
                                    className="mr-2 w-4 h-4"
                                />
                            )}
                            {editingKitId === k.id ? (
                                <div className="flex-1 flex items-center space-x-1">
                                    <input
                                        type="text"
                                        value={editKitName}
                                        onChange={(e) => setEditKitName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleRenameKit(k.id!, editKitName);
                                            } else if (e.key === 'Escape') {
                                                setEditingKitId(null);
                                            }
                                        }}
                                        className="flex-1 bg-white border border-emerald-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleRenameKit(k.id!, editKitName)}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs"
                                        title="保存"
                                    >
                                        ✓
                                    </button>
                                    <button
                                        onClick={() => setEditingKitId(null)}
                                        className="bg-slate-400 hover:bg-slate-500 text-white font-bold px-2 py-1 rounded text-xs"
                                        title="キャンセル"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate">{k.name}</p>
                                        <p className="text-xs text-slate-500">{k.createdAt.toLocaleDateString('ja-JP')}</p>
                                    </div>
                                    <div className="flex space-x-1 flex-shrink-0">
                                        <button onClick={() => handleLoadKit(k.id!)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded text-xs" title="読み込み">Load</button>
                                        <button onClick={() => handleExportKit(k.id!)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-2 py-1 rounded text-xs" title="エクスポート">Exp</button>
                                        <button onClick={() => startEditingKit(k)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-2 py-1 rounded text-xs" title="名前変更">Rename</button>
                                        <button onClick={() => handleDeleteKit(k.id!)} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-2 py-1 rounded text-xs" title="削除">Del</button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ProjectView;