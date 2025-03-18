import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

export interface Account {
  account: string;
  id: number;
  nickname: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  loading: boolean;
  data: any;
  setData: (data: any) => void;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  wps: WpsApplication | null;
  setWps: (wps: WpsApplication | null) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        data: null,
        user: null,
        token: null,
        loading: false,
        wps: null,
        setUser: (user) => set({ user }),
        setToken: (token) => set({ token }),
        setLoading: (loading) => set({ loading }),
        setData: (data) => set({ data }),
        setWps: (wps) => set({ wps }),
      }),
      {
        name: 'app-storage',
      },
    ),
  ),
);