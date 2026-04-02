// frontend/src/components/KidsMode/KidsHomepage.tsx
import React, { useEffect, useState } from 'react';
import { useProfileStore } from '../../store/profileStore';
import VideoRow from '../VideoRow/VideoRow'; // adjust path to your existing VideoRow component

interface KidRow {
  title: string;
  items: any[];
}

const KidsHomepage: React.FC = () => {
  const { currentProfile } = useProfileStore();
  const [kidContent, setKidContent] = useState<{ rows: KidRow[] }>({ rows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProfile?.isKids) return;

    const fetchKidContent = async () => {
      try {
        const res = await fetch(`/api/profiles/${currentProfile._id}/kids-content`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        const data = await res.json();
        setKidContent(data);
      } catch (error) {
        console.error('Failed to load kids content:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchKidContent();
  }, [currentProfile]);

  if (!currentProfile?.isKids) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 text-white">
      <div className="px-6 pt-10 pb-20">
        <div className="flex items-center gap-4 mb-10">
          <span className="text-6xl">👦</span>
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Kids Mode</h1>
            <p className="text-xl text-white/90 mt-1">Safe & fun content for {currentProfile.name}</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="text-6xl animate-bounce mb-6">🎬</div>
            <p className="text-2xl">Loading awesome cartoons and stories...</p>
          </div>
        ) : (
          kidContent.rows.map((row, index) => (
            <VideoRow
              key={index}
              title={row.title}
              items={row.items}
              isKidsMode={true}
              largeThumbnails={true}   // make posters bigger and more colorful for kids
            />
          ))
        )}

        {/* Fallback if no content yet */}
        {!loading && kidContent.rows.length === 0 && (
          <div className="text-center py-32">
            <div className="text-8xl mb-8">🎥✨</div>
            <p className="text-3xl font-medium">We're preparing fun content just for you!</p>
            <p className="text-xl text-white/70 mt-4">Check back soon or try another profile</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KidsHomepage;