// App-wide state: the content being practised and the on-device model's status.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api, Material } from './api';
import { getSetting, setSetting } from './db';
import * as llm from './llm';

type ModelState = { installed: boolean; progress: number | null; error: string | null };

type Ctx = {
  ready: boolean;
  material: Material | null;
  setMaterial: (m: Material | null) => Promise<void>;
  model: ModelState;
  downloadModel: () => Promise<void>;
  cancelDownload: () => void;
  deleteModel: () => Promise<void>;
};

const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [material, setMaterialState] = useState<Material | null>(null);
  const [model, setModel] = useState<ModelState>({ installed: false, progress: null, error: null });

  useEffect(() => {
    (async () => {
      const [{ installed }, mid] = await Promise.all([llm.modelStatus(), getSetting('material')]);
      setModel((s) => ({ ...s, installed }));
      if (installed) llm.warmUp();
      if (mid) setMaterialState(await api.material(Number(mid)).catch(() => null));
      setReady(true);
    })();
    // free the model's memory when the app goes to the background; it reloads on next use
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') void llm.release(); });
    return () => sub.remove();
  }, []);

  const downloadModel = useCallback(async () => {
    setModel({ installed: false, progress: 0, error: null });
    try {
      await llm.downloadModel((p) => setModel((s) => ({ ...s, progress: p })));
      setModel({ installed: true, progress: null, error: null });
      llm.warmUp();
    } catch (e) {
      setModel({ installed: false, progress: null, error: e instanceof Error ? e.message : 'Téléchargement interrompu.' });
    }
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready, material, model, downloadModel,
    cancelDownload: () => { void llm.cancelDownload(); },
    deleteModel: async () => { await llm.deleteModel(); setModel({ installed: false, progress: null, error: null }); },
    setMaterial: async (m) => { setMaterialState(m); await setSetting('material', m ? String(m.id) : null); },
  }), [ready, material, model, downloadModel]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const v = useContext(C);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
