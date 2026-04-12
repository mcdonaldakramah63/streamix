// frontend/src/pages/Kids.tsx — REFINED PROFESSIONAL KIDS HOMEPAGE
import React, { useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import ContinueWatchingRow from '../components/ContinueWatchingRow';
import Carousel from '../components/Carousel';
import ProfileSelector from '../components/ProfileSelector';

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

  if (!activeProfile?.isKids) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#c7d2fe] via-[#e0f2fe] to-[#ecfdf5] text-slate-900">
      {/* Refined Navbar */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-4xl">👦</div>
            <div>
              <div className="font-bold text-2xl tracking-tight">Kids Mode</div>
              <div className="text-xs text-emerald-600 font-medium">Safe & Age-Appropriate</div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="px-5 py-2 bg-emerald-100 text-emerald-700 rounded-3xl text-sm font-medium flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              Kids Safe Mode • ON
            </div>
            <ProfileSelector />
          </div>
        </div>
      </nav>

      <div className="px-6 pt-10 max-w-7xl mx-auto">
        {/* Hero Banner */}
        <div className="relative h-[440px] rounded-3xl overflow-hidden mb-16 shadow-2xl">
          <img 
            src="https://image.tmdb.org/t/p/original/tq3h43fZy0H80vzf47MAY7R9Mxo.jpg" 
            alt="The Wild Robot"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-12 left-12 right-12">
            <div className="uppercase text-emerald-300 text-sm font-bold mb-2">NEW & POPULAR</div>
            <h1 className="text-6xl font-bold text-white leading-none mb-4">The Wild Robot</h1>
            <p className="text-white/90 max-w-md text-lg">A brave robot discovers friendship in the wild. Perfect for ages 5–12.</p>
            <button className="mt-8 bg-white text-slate-900 px-8 py-4 rounded-2xl font-semibold flex items-center gap-3 text-lg hover:bg-slate-100 transition">
              ▶ Play Now
            </button>
          </div>
        </div>

        {/* Continue Watching */}
        <div className="mb-16">
          <ContinueWatchingRow />
        </div>

        {/* Content Rows */}
        {loading ? (
          <div className="text-center py-24">
            <div className="text-7xl animate-bounce mb-8">🎬</div>
            <p className="text-3xl font-medium text-slate-700">Loading fun content for you...</p>
          </div>
        ) : (
          kidRows.map((row, index) => (
            <div key={index} className="mb-16">
              <h2 className="text-4xl font-bold text-slate-800 mb-8 px-1">{row.title}</h2>
              {row.items && row.items.length > 0 ? (
                <Carousel title="" movies={row.items} loading={false} />
              ) : (
                <div className="h-72 flex items-center justify-center border border-slate-200 rounded-3xl bg-white">
                  <p className="text-slate-500 text-xl">More exciting content coming soon...</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Kids;