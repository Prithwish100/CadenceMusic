import React, { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface TrackArtworkProps {
  src: string;
  alt: string;
  className?: string;
  isPlaying?: boolean;
}

export const TrackArtwork: React.FC<TrackArtworkProps> = ({
  src,
  alt,
  className = 'w-12 h-12 rounded-lg',
  isPlaying = false,
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={`relative overflow-hidden bg-[#18181E] border border-white/[0.07] shrink-0 select-none ${className}`}
    >
      {!hasError && src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1C1817] via-[#121216] to-[#E25822]/25 p-2 text-center">
          <Disc3 className="w-1/2 h-1/2 text-[#E25822] opacity-85" />
        </div>
      )}

      {isPlaying && (
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <div className="flex items-end gap-0.5 h-4">
            <span className="w-1 bg-[#E25822] rounded-full h-3 animate-[bounce_0.8s_infinite]" />
            <span className="w-1 bg-[#E25822] rounded-full h-4 animate-[bounce_0.6s_infinite]" />
            <span className="w-1 bg-[#E25822] rounded-full h-2.5 animate-[bounce_0.9s_infinite]" />
          </div>
        </div>
      )}
    </div>
  );
};
