// frontend/src/stores/profileStore.ts — FINAL FIXED PIN LOGIC
import { create } from 'zustand';
import api from '../services/api';

const STORAGE_KEY = 'streamix_active_profile';

export interface Profile {
  _id: string;
  name: string;
  avatar: string;
  color: string;
  isKids: boolean;
  pin?: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  loading: boolean;

  fetch: () => Promise<void>;
  create: (data: Partial<Profile>) => Promise<Profile>;
  update: (id: string, data: Partial<Profile>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (p: Profile | null) => Promise<boolean>;
  recordWatch: (
    tmdbId: number,
    title: string,
    type: 'movie' | 'tv',
    genres: number[],
    language: string,
    completed: boolean
  ) => Promise<void>;
}

function readStored(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: readStored(),
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/profiles');
      const profiles: Profile[] = data;

      set((state) => {
        const stored = state.activeProfile;
        const synced = stored ? profiles.find((p) => p._id === stored._id) || null : null;
        const active = synced ?? (profiles.length > 0 ? profiles[0] : null);

        if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
        else localStorage.removeItem(STORAGE_KEY);

        return { profiles, activeProfile: active };
      });
    } catch (err) {
      console.error('[ProfileStore] fetch failed:', err);
    } finally {
      set({ loading: false });
    }
  },

  create: async (data) => {
    const { data: created } = await api.post('/profiles', data);
    set((s) => ({ profiles: [...s.profiles, created] }));
    return created;
  },

  update: async (id, data) => {
    const { data: updated } = await api.put(`/profiles/${id}`, data);
    set((s) => {
      const profiles = s.profiles.map((p) => (p._id === id ? updated : p));
      const active = s.activeProfile?._id === id ? updated : s.activeProfile;
      if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      return { profiles, activeProfile: active };
    });
  },

  remove: async (id) => {
    await api.delete(`/profiles/${id}`);
    set((s) => {
      const profiles = s.profiles.filter((p) => p._id !== id);
      const active = s.activeProfile?._id === id ? null : s.activeProfile;
      if (!active) localStorage.removeItem(STORAGE_KEY);
      return { profiles, activeProfile: active };
    });
  },

  setActive: async (profile) => {
    if (!profile) {
      localStorage.removeItem(STORAGE_KEY);
      set({ activeProfile: null });
      return true;
    }

    if (profile.isKids) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      set({ activeProfile: profile });
      return true;
    }

    // Adult profile
    if (profile.pin) {
      // Ask to ENTER PIN
      const enteredPin = prompt(`Enter 4-digit PIN for "${profile.name}":`);
      if (enteredPin === profile.pin) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        set({ activeProfile: profile });
        return true;
      } else {
        alert('Incorrect PIN!');
        return false;
      }
    } else {
      // First time - ask to SET PIN
      const newPin = prompt(`Set a 4-digit PIN for "${profile.name}" to protect adult content:`);
      if (newPin && /^\d{4}$/.test(newPin)) {
        try {
          // Save PIN on backend
          await api.put(`/profiles/${profile._id}`, { pin: newPin });
          // Update local profile with PIN
          const updatedProfile = { ...profile, pin: newPin };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
          set({ activeProfile: updatedProfile });

          // Refresh the full list so all profiles have the updated pin field
          await get().fetch();
          return true;
        } catch {
          alert('Failed to save PIN');
          return false;
        }
      } else if (newPin !== null) {
        alert('PIN must be exactly 4 digits.');
        return false;
      }
      return false;
    }
  },

  recordWatch: async (tmdbId, title, type, genres, language, completed) => {
    const { activeProfile } = get();
    if (!activeProfile) return;
    try {
      await api.post(`/profiles/${activeProfile._id}/watch`, {
        tmdbId,
        title,
        type,
        genres,
        language,
        completed,
      });
    } catch (err) {
      console.error('recordWatch failed:', err);
    }
  },
}));