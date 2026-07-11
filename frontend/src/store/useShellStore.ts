import { create } from 'zustand';

export type MobileDestination = 'map' | 'activity' | 'messages' | 'me';

interface ShellStore {
  activeDestination: MobileDestination;
  setActiveDestination: (destination: MobileDestination) => void;
}

const useShellStore = create<ShellStore>((set) => ({
  activeDestination: 'map',
  setActiveDestination: (activeDestination) => set({ activeDestination }),
}));

export default useShellStore;
