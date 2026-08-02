import { create } from 'zustand';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmState {
  config: ConfirmConfig | null;
  show: (config: ConfirmConfig) => void;
  hide: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  config: null,
  show: (config) => set({ config }),
  hide: () => set({ config: null }),
}));
