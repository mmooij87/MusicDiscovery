"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrackCard } from "./TrackCard";

export interface FeedTrack {
  id: number;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  spotifyUrl: string;
  liked: boolean;
  seen: boolean;
  sourceName: string | null;
  context: string | null;
  discoveredAt: string | null;
}

/**
 * TikTok-style vertical feed: one full-screen card per track, snap scrolling,
 * and a single shared <audio> element that always plays the card in view.
 *
 * Browsers block audio until the user interacts once, so the feed starts
 * behind a "tap to start" overlay; after that tap, every scroll auto-plays.
 */
export function Feed({ tracks }: { tracks: FeedTrack[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const seenSent = useRef(new Set<number>());

  // one audio element for the whole feed
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const playTrack = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const track = tracks[index];
      if (!audio || !track) return;
      if (track.previewUrl) {
        if (!audio.src.endsWith(track.previewUrl)) audio.src = track.previewUrl;
        audio.muted = muted;
        audio.play().catch(() => setPlaying(false));
      } else {
        audio.pause();
        audio.removeAttribute("src");
      }
    },
    [tracks, muted],
  );

  // watch which card fills the viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setActiveIndex(index);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    container.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tracks]);

  // react to the active card changing
  useEffect(() => {
    const track = tracks[activeIndex];
    if (!track) return;
    if (started) playTrack(activeIndex);
    if (!seenSent.current.has(track.id)) {
      seenSent.current.add(track.id);
      fetch(`/api/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seen" }),
      }).catch(() => {});
    }
  }, [activeIndex, started, tracks, playTrack]);

  const start = () => {
    setStarted(true);
    playTrack(activeIndex);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const toggleMute = () => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  };

  if (tracks.length === 0) return <EmptyState />;

  return (
    <div className="relative h-dvh">
      <div ref={containerRef} className="feed-scroll h-dvh snap-y snap-mandatory overflow-y-scroll">
        {tracks.map((track, i) => (
          <TrackCard
            key={track.id}
            track={track}
            index={i}
            active={i === activeIndex}
            playing={playing && i === activeIndex}
            muted={muted}
            onTogglePlay={togglePlay}
            onToggleMute={toggleMute}
            // only the active card and its neighbours load artwork eagerly
            eager={Math.abs(i - activeIndex) <= 1}
          />
        ))}
      </div>

      {!started && (
        <button
          onClick={start}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-black">
            <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="text-lg font-medium">Tap to start listening</span>
          <span className="text-sm text-white/60">{tracks.length} tracks in your feed</span>
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="text-5xl">🎧</span>
      <h1 className="text-xl font-semibold">No tracks yet</h1>
      <p className="max-w-sm text-sm text-white/60">
        Run a scan to fill your feed: <code className="rounded bg-white/10 px-1.5 py-0.5">npm run scan</code>{" "}
        locally, or wait for the daily cron job.
      </p>
    </div>
  );
}
