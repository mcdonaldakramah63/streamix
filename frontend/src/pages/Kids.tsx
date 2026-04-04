// frontend/src/pages/Kids.tsx — CLEAN PROFESSIONAL KIDS MODE
import React, { useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import ContinueWatchingRow from '../components/ContinueWatchingRow';
import Carousel from '../components/Carousel';

const BACKEND_URL = 'https://streamix-production-1cb4.up.railway.app';

const Kids = () => {
  const { activeProfile } = useProfileStore();
  const [kidRows, setKidRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile?.isKids) return;

    const loadKidsContent = async () => {
      try {
        const userStr = localStorage.getItem('streamix_user');
        let token = null;
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            token = user?.token;
          } catch {}
        }

        if (!token) {
          setKidRows([
            { title: "Popular for Kids", items: [] },
            { title: "Cartoons & Animation", items: [] },
          ]);
          setLoading(false);
          return;
        }

        const res = await fetch(`${BACKEND_URL}/api/profiles/${activeProfile._id}/kids-content`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        setKidRows(data.rows || []);
      } catch (err) {
        console.error('Kids content error:', err);
        setKidRows([
          { title: "Popular for Kids", items: [] },
          { title: "Cartoons & Animation", items: [] },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadKidsContent();
  }, [activeProfile]);

  if (!activeProfile?.isKids) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 text-white pb-20">
      <div className="px-4 sm:px-6 pt-12">
        {/* Clean Header */}
        <div className="flex items-center gap-5 mb-12">
          <div className="text-7xl drop-shadow-2xl">👦</div>
          <div>
            <h1 className="text-6xl font-bold tracking-tighter">Kids Mode</h1>
            <p className="text-2xl text-white/90 mt-2">Safe, fun, and age-appropriate</p>
          </div>
        </div>

        {/* Continue Watching */}
        <div className="mb-16">
          <ContinueWatchingRow />
        </div>

        {loading ? (
          <div className="text-center py-24">
            <div className="text-7xl animate-bounce mb-8">🎥</div>
            <p className="text-3xl font-medium">Loading fun content for you...</p>
          </div>
        ) : (
          kidRows.map((row, index) => (
            <div key={index} className="mb-16">
              <h2 className="text-4xl font-bold mb-8 px-2 tracking-tight">{row.title}</h2>
              {row.items && row.items.length > 0 ? (
                <Carousel 
                  title="" 
                  movies={row.items} 
                  loading={false}
                />
              ) : (
                <div className="h-72 flex items-center justify-center border border-white/20 rounded-3xl bg-white/5">
                  <p className="text-white/70 text-xl">More exciting content coming soon...</p>
                </div>
              )}
            </div>
          ))
        )}

        {kidRows.length === 0 && !loading && (
          <div className="text-center py-32">
            <div className="text-8xl mb-8">🎬✨</div>
            <h2 className="text-4xl font-semibold mb-4">We're preparing the best for you!</h2>
            <p className="text-xl text-white/70 max-w-md mx-auto">
              Fun cartoons, stories, and learning videos are loading just for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Kids;