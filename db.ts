import Dexie, { Table } from 'dexie';
import { AppState, Sample } from './types';

// We need to serialize AudioBuffer since it's not cloneable for IndexedDB.
// We'll store the raw channel data and sample rate.
export interface StorableSample {
    id: number;
    name: string;
    bufferData: {
        channelData: Float32Array[];
        sampleRate: number;
        length: number;
        numberOfChannels: number;
    } | null;
    volume: number;
    pitch: number;
    start: number;
    decay: number;
    lpFreq: number;
    hpFreq: number;
}

export interface Project {
  id?: number;
  name: string;
  createdAt: Date;
  state: Omit<AppState, 'audioContext' | 'isInitialized' | 'isPlaying' | 'isRecording' | 'currentStep' | 'samples' | 'grooves'>;
  samples: StorableSample[];
}

class ProjectDB extends Dexie {
  projects!: Table<Project>;

  constructor() {
    super('GrooveSamplerDB');
    // FIX: Explicitly cast 'this' to Dexie to resolve a potential
    // TypeScript type inference issue with the extended class.
    (this as Dexie).version(1).stores({
      projects: '++id, name, createdAt',
    });
  }
}

export const db = new ProjectDB();