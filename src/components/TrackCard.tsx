"use client";

import { useState } from "react";
import type { FeedTrack } from "./Feed";

/* eslint-disable @next/next/no-img-element -- artwork comes from arbitrary
   catalog CDNs; plain <img> avoids configuring remotePatterns for each. */

export function TrackCard({
  track,
  index,
  active,
  playing,
  muted,
  eager,
  onTogglePlay,
  onToggleMute,
}: {
  track: FeedTrack;
  index: number;
  active: boolean;
  playing: boolean;
  muted: boolean;
  eager: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}) {
  const [liked, setLiked] = useState(track.liked);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "like" : "unlike" }),
    }).catch(() => {});
  };

  return (
    <section data-index={index} className="relative h-dvh snap-start overflow-hidden">
      {/* blurred backdrop */}
      {track.artworkUrl ? (
        <img
          src={track.artworkUrl}
          alt=""
          aria-hidden
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-3xl"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-black to-fuchsia-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/75" />

      {/* main artwork — tapping it opens the track on Spotify */}
      <div className="absolute inset-0 flex items-center justify-center px-6 pb-28 pt-14">
        <a
          href={track.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full max-w-[78vmin]"
        >
          {track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={`${track.artist} – ${track.title} cover art`}
              loading={eager ? "eager" : "lazy"}
              className={`aspect-square w-full rounded-2xl object-cover shadow-2xl shadow-black/60 transition-transform duration-500 ${
                active && playing ? "scale-100" : "scale-95"
              }`}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-white/10 text-7xl">
              🎵
            </div>
          )}
        </a>
      </div>

      {/* bottom info */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold leading-tight">{track.title}</h2>
          <p className="truncate text-lg text-white/85">{track.artist}</p>
          {(track.sourceName || track.context) && (
            <p className="mt-2 line-clamp-2 text-xs text-white/55">
              {track.sourceName}
              {track.context ? ` · ${track.context}` : ""}
              {track.discoveredAt ? ` · ${track.discoveredAt}` : ""}
            </p>
          )}
          {!track.previewUrl && (
            <p className="mt-1 text-xs text-amber-300/80">No preview — tap cover for Spotify</p>
          )}
        </div>

        {/* action rail */}
        <div className="flex shrink-0 flex-col items-center gap-5 pb-1">
          <button onClick={toggleLike} aria-label="Like" className="text-3xl drop-shadow">
            <svg
              viewBox="0 0 24 24"
              className={`h-8 w-8 ${liked ? "fill-rose-500 stroke-rose-500" : "fill-none stroke-white"}`}
              strokeWidth="2"
            >
              <path d="M12 21s-7.5-4.7-10-9.3C.6 8.1 2.6 4.5 6.2 4.5c2 0 3.6 1.1 4.4 2.7l1.4 2.6 1.4-2.6c.8-1.6 2.4-2.7 4.4-2.7 3.6 0 5.6 3.6 4.2 7.2C19.5 16.3 12 21 12 21z" />
            </svg>
          </button>

          {track.previewUrl && (
            <button
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="text-white"
            >
              {active && playing ? (
                <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}

          <button onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? (
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
                <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v2.2l2.5 2.5V12zM19 12c0 .9-.2 1.8-.5 2.6l1.5 1.5A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.1v2.1c1.4-.3 2.6-.9 3.7-1.8l2 2L21 19.7 4.3 3zM12 4 9.9 6.1 12 8.2V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
              </svg>
            )}
          </button>

          {/* Spotify */}
          <a
            href={track.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in Spotify"
            className="text-[#1DB954]"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current">
              <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.4-2.1-10.6-1.2a.75.75 0 1 1-.3-1.4c4.5-1 8.4-.6 11.6 1.4.35.2.46.65.25 1zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.2-2-8.2-2.6-12-1.4a.94.94 0 1 1-.55-1.8c4.4-1.3 9.8-.7 13.5 1.6.44.27.58.86.3 1.3zm.13-3.4C15.3 8.3 9 8.1 5.4 9.2a1.12 1.12 0 1 1-.65-2.2c4.2-1.3 11.2-1 15.6 1.6a1.12 1.12 0 0 1-1.15 1.9z" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
