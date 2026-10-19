// Everything about turning a phone video into things the server can use,
// done in the browser so the big video file never has to be uploaded: still
// frames (sampled as small JPEGs) and the audio (cut into short 16 kHz mono WAV
// pieces, each small enough for one request).

export interface SampledFrame {
  clip: string;
  t: number; // seconds into the clip
  data: string; // base64 JPEG, no data: prefix
}

export interface AudioPiece {
  blob: Blob;
  offset: number; // seconds into the clip where this piece starts
}

export interface TranscriptSegment {
  start: number;
  text: string;
}

export const AUDIO_PIECE_SECONDS = 120; // 16 kHz mono 16-bit = ~1.9 MB per minute -> ~3.8 MB, under the 4.5 MB request cap
export const MAX_VIDEO_BYTES = 800 * 1024 * 1024;

const SEEK_TIMEOUT_MS = 10000;

export const isAudioFile = (file: File): boolean => file.type.startsWith('audio/') || /\.(m4a|mp3|wav|aac|caf|ogg)$/i.test(file.name);
export const isVideoFile = (file: File): boolean => file.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(file.name);

export const fmtClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// "[0:30] words" lines -- the same shape the draft step reads timestamps from.
export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${fmtClock(s.start)}] ${s.text}`).join('\n');
}

function openVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't read that video. Try Safari or Chrome, or paste a transcript instead."));
    };
    video.onloadedmetadata = () => (video.videoWidth && Number.isFinite(video.duration) ? resolve({ video, url }) : fail());
    video.onerror = fail;
    video.src = url;
  });
}

export async function videoDuration(file: File): Promise<number> {
  const { video, url } = await openVideo(file);
  const d = video.duration;
  URL.revokeObjectURL(url);
  return d;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out reading a frame from the video.')), SEEK_TIMEOUT_MS);
    video.onseeked = () => {
      clearTimeout(timer);
      resolve();
    };
    video.currentTime = t;
  });
}

// A frame every `everySec` seconds, scaled to `width` px wide.
export async function sampleFrames(
  file: File,
  label: string,
  opts: { everySec: number; width?: number; quality?: number }
): Promise<SampledFrame[]> {
  const { video, url } = await openVideo(file);
  try {
    const width = opts.width ?? 576;
    const scale = Math.min(1, width / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read video frames in this browser.');
    const frames: SampledFrame[] = [];
    const last = Math.max(0, video.duration - 0.25);
    for (let t = 0.3; t <= last + 0.001; t += opts.everySec) {
      await seekTo(video, Math.min(t, last));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', opts.quality ?? 0.55).split(',')[1];
      frames.push({ clip: label, t: Math.min(t, last), data });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// The video's audio as a list of short mono 16 kHz WAV pieces. Pieces that are
// pure silence are dropped (nothing to transcribe). Returns [] for a video with
// no usable audio.
export async function extractAudioPieces(file: File, pieceSeconds = AUDIO_PIECE_SECONDS): Promise<AudioPiece[]> {
  const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Couldn't read the sound from that video in this browser.");
  } finally {
    void ctx.close();
  }
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded; // channels are mixed down to mono by the 1-channel destination
  source.connect(offline.destination);
  source.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  const pieces: AudioPiece[] = [];
  const size = pieceSeconds * rate;
  for (let start = 0; start < mono.length; start += size) {
    const slice = mono.subarray(start, Math.min(mono.length, start + size));
    let peak = 0;
    for (let i = 0; i < slice.length; i += 64) peak = Math.max(peak, Math.abs(slice[i]));
    if (peak < 0.002) continue; // silence
    pieces.push({ blob: encodeWav(slice, rate), offset: start / rate });
  }
  return pieces;
}
