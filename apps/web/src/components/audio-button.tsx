'use client';

import { useRef, useState } from 'react';

/** Plays one lesson recording (FR-302). Shows a short message if the browser cannot play it. */
export function AudioButton({
  src,
  label,
  failed,
}: {
  src: string;
  label: string;
  failed: string;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function play() {
    setError(false);
    const audio = (ref.current ??= new Audio(src));
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setPlaying(false);
      setError(true);
    };
    try {
      audio.currentTime = 0;
      setPlaying(true);
      await audio.play();
    } catch {
      setPlaying(false);
      setError(true);
    }
  }

  return (
    <span className="audio">
      <button
        type="button"
        className="audio-button"
        onClick={play}
        aria-label={label}
        aria-pressed={playing}
      >
        <span aria-hidden="true">🔊</span>
      </button>
      {error ? (
        <span role="status" className="error">
          {failed}
        </span>
      ) : null}
    </span>
  );
}
