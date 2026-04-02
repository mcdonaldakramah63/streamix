// frontend/src/components/ProfileSelector.tsx
import React, { useState } from 'react';
import { useProfileStore } from '../stores/profileStore';

interface Profile {
  _id: string;
  name: string;
  avatar: string;
  color: string;
  isKids: boolean;
  pin?: string;
}

const ProfileSelector: React.FC = () => {
  const { profiles, activeProfile, switchProfile } = useProfileStore();
  const [showPinModal, setShowPinModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [pinInput, setPinInput] = useState('');

  const handleProfileClick = (profile: Profile) => {
    if (profile.isKids || !profile.pin) {
      switchProfile(profile);
      return;
    }

    // Adult profile with PIN protection
    setSelectedProfile(profile);
    setShowPinModal(true);
    setPinInput('');
  };

  const verifyPin = async () => {
    if (!selectedProfile) return;

    try {
      const res = await fetch(`/api/profiles/${selectedProfile._id}/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ pin: pinInput }),
      });

      if (res.ok) {
        switchProfile(selectedProfile);
        setShowPinModal(false);
      } else {
        alert('Incorrect PIN! Please try again.');
        setPinInput('');
      }
    } catch (error) {
      console.error('PIN verification failed:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  return (
    <>
      <div className="flex gap-6 overflow-x-auto pb-6 px-4">
        {profiles.map((profile: Profile) => (
          <div
            key={profile._id}
            onClick={() => handleProfileClick(profile)}
            className={`cursor-pointer flex-shrink-0 text-center transition-all duration-200 hover:scale-110 ${
              activeProfile?._id === profile._id ? 'scale-110 ring-4 ring-white' : ''
            }`}
          >
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl shadow-2xl mb-3"
              style={{ backgroundColor: profile.color || '#14b8a6' }}
            >
              {profile.avatar || '🎬'}
            </div>
            <p className="font-semibold text-lg text-white">{profile.name}</p>
            {profile.isKids && (
              <p className="text-xs text-green-400 font-medium mt-1">👦 Kids Mode</p>
            )}
          </div>
        ))}
      </div>

      {/* PIN Modal */}
      {showPinModal && selectedProfile && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-zinc-900 text-white p-8 rounded-3xl w-full max-w-sm mx-4">
            <h3 className="text-2xl font-bold text-center mb-6">
              Enter PIN to unlock
            </h3>
            <p className="text-center text-gray-400 mb-6">{selectedProfile.name}</p>

            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center text-5xl tracking-[8px] bg-zinc-800 border border-zinc-700 rounded-2xl py-6 focus:outline-none focus:border-white mb-8"
              autoFocus
              placeholder="••••"
            />

            <div className="flex gap-4">
              <button
                onClick={() => setShowPinModal(false)}
                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={verifyPin}
                className="flex-1 py-4 bg-white text-black hover:bg-gray-200 rounded-2xl font-semibold transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProfileSelector;