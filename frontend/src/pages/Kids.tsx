// frontend/src/pages/Kids.tsx — STRICT VERSION (forces redirect when not kids)
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileStore } from '../stores/profileStore';
import ContinueWatchingRow from '../components/ContinueWatchingRow';
import Carousel from '../components/Carousel';

const BACKEND_URL = 'https://streamix-production-1cb4.up.railway.app';

const Kids = () => {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const [kidRows, setKidRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Force redirect if not in kids mode
  useEffect(() => {
    if (!activeProfile?.isKids) {
      navigate('/', { replace: true });
      return;
    }

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
  }, [activeProfile, navigate]);

  // Only render if we are in kids mode
  if (!activeProfile?.isKids) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4f46e5] via-[#7c3aed] to-[#db2777] text-white pb-20">
      <div className="px-4 sm:px-6 pt-10">
        <div className="flex items-center gap-4 mb-10">
          <div className="text-6xl drop-shadow-lg">👦</div>
          <div>
            <h1 className="text-5xl font-bold tracking-tighter">Kids Mode</h1>
            <p className="text-xl text-white/90 mt-1">Safe & fun for {activeProfile.name}</p>
          </div>
        </div>

        <div className="mb-12">
          <ContinueWatchingRow />
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="text-6xl animate-bounce mb-6">🎬</div>
            <p className="text-2xl">Loading awesome cartoons and stories for you...</p>
          </div>
        ) : (
          kidRows.map((row, index) => (
            <div key={index} className="mb-12">
              <h2 className="text-3xl font-bold mb-6 px-2">{row.title}</h2>
              {row.items && row.items.length > 0 ? (
                <Carousel title="" movies={row.items} loading={false} />
              ) : (
                <div className="h-64 flex items-center justify-center border border-white/20 rounded-3xl bg-white/10">
                  <p className="text-white/70">More fun content coming soon...</p>
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