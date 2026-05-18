import { create } from 'zustand';
import type { Database } from '@/lib/database.types';

type Job = Database['public']['Tables']['jobs']['Row'];
type Package = Database['public']['Tables']['packages']['Row'];

interface JobStore {
  activeJob: Job | null;
  packages: Package[];
  customerName: string | null;
  setActiveJob: (job: Job | null) => void;
  setPackages: (pkgs: Package[]) => void;
  setCustomerName: (name: string | null) => void;
  clear: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  activeJob: null,
  packages: [],
  customerName: null,
  setActiveJob: (activeJob) => set({ activeJob }),
  setPackages: (packages) => set({ packages }),
  setCustomerName: (customerName) => set({ customerName }),
  clear: () => set({ activeJob: null, packages: [], customerName: null }),
}));
