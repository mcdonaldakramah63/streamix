// frontend/src/pages/Kids.tsx
import React, { useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import ContinueWatchingRow from '../components/ContinueWatchingRow';
import Carousel from '../components/Carousel';        // you already use this in Home.tsx

const Kids = () => {
  const { activeProfile } = useProfileStore();
  const [kidRows, setKidRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile?.isKids) return;

    const loadKidsContent = async () => {
      try {
        const res = await fetch(`/api/profiles/${activeProfile._id}/kids-content`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setKidRows(data.rows || []);
        }
      } catch (err) {
        console.error('Failed to load kids content:', err);
        // Fallback rows so page doesn't look broken
        setKidRows([
          { title: "Popular for Kids", items: [] },
          { title: "Cartoons & Fun", items: [] },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadKidsContent();
  }, [activeProfile]);

  // Safety: redirect if not kids profile
  if (!activeProfile?.isKids) {
    return <div className="text-center py-20 text-white">Redirecting to home...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4f46e5] via-[#7c3aed] to-[#db2777] text-white pb-20">
      <div className="px-4 sm:px-6 pt-10">
        {/* Kid Mode Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="text-6xl drop-shadow-lg">👦</div>
          <div>
            <h1 className="text-5xl font-bold tracking-tighter">Kids Mode</h1>
            <p className="text-xl text-white/90 mt-1">Safe & fun for {activeProfile.name}</p>
          </div>
        </div>

        {/* Continue Watching - already works with your store */}
        <div className="mb-12">
          <ContinueWatchingRow isKidsMode={true} />
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="text-6xl animate-bounce mb-6">🎬</div>
            <p className="text-2xl">Loading awesome cartoons and stories for you...</p>
          </div>
        ) : (
          <>
            {kidRows.map((row, index) => (
              <div key={index} className="mb-10">
                <h2 className="text-2xl font-bold mb-4 px-1">{row.title}</h2>
                {row.items && row.items.length > 0 ? (
                  <Carousel 
                    title="" 
                    movies={row.items} 
                    loading={false}
                  />
                ) : (
                  <div className="h-52 flex items-center justify-center border border-white/20 rounded-3xl bg-white/5">
                    <p className="text-white/60">More fun content coming soon...</p>
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {kidRows.length === 0 && (
              <div className="text-center py-32">
                <div className="text-8xl mb-6">🎥✨</div>
                <h2 className="text-3xl font-semibold mb-3">We're preparing awesome content!</h2>
                <p className="text-white/70 max-w-md mx-auto">
                  Lots of cartoons, stories, and learning videos are coming soon just for you.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Kids;