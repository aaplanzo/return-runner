import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];

interface AuthState {
  session: Session | null;
  profile: UserRow | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserRow | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ session: null, profile: null }),
}));
