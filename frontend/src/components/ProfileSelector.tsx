// frontend/src/components/ProfileSelector.tsx — FORCED SIMPLE PIN LOGIC
import React from 'react';
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
  const { profiles, activeProfile, setActive } = useProfileStore();

  const handleProfileClick = (profile: Profile) => {
    console.log('[PIN Debug] Clicked profile:', profile.name, 'isKids:', profile.isKids, 'hasPin:', !!profile.pin);

    if (profile.isKids) {
      console.log('[PIN Debug] Switching to kids profile - instant');
      setActive(profile);
      return;
    }

    // Adult profile
    if (profile.pin) {
      console.log('[PIN Debug] Adult profile with PIN - asking for PIN');
      const enteredPin = prompt(`Enter 4-digit PIN for "${profile.name}":`);
      if (enteredPin === profile.pin) {
        console.log('[PIN Debug] PIN correct - switching');
        setActive(profile);
      } else {
        alert('Incorrect PIN!');
      }
    } else {
      console.log('[PIN Debug] Adult profile without PIN - asking to set one');
      const newPin = prompt(`Set a 4-digit PIN for "${profile.name}" to protect adult content:`);
      if (newPin && /^\d{4}$/.test(newPin)) {
        fetch(`/api/profiles/${profile._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({ pin: newPin }),
        })
          .then((res) => {
            if (res.ok) {
              console.log('[PIN Debug] PIN saved successfully');
              setActive(profile);
            } else {
              alert('Failed to save PIN');
            }
          })
          .catch(() => alert('Failed to save PIN'));
      } else if (newPin !== null) {
        alert('PIN must be exactly 4 digits.');
      }
    }
  };

  return (
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
            style={{ backgroundColor: profile.color }}
          >
            {profile.avatar}
          </div>
          <p className="font-semibold text-lg text-white">{profile.name}</p>
          {profile.isKids && <p className="text-xs text-green-400 mt-1">👦 Kids Mode</p>}
          {!profile.isKids && profile.pin && <p className="text-xs text-amber-400 mt-1">🔒 Protected</p>}
          {!profile.isKids && !profile.pin && <p className="text-xs text-orange-400 mt-1">Click to set PIN</p>}
        </div>
      ))}
    </div>
  );
};

export default ProfileSelector;