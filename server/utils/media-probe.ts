/**
 * Media probe — thin wrapper around ffprobe + ffmpeg for uploaded
 * podcasts and video teasers.
 *
 * Why subprocess and not a JS library: the only reliable codec/duration
 * answer comes from ffprobe, and adding fluent-ffmpeg (or similar) buys
 * us nothing the shell can't. We expect ffmpeg/ffprobe on PATH — the
 * Dockerfile installs them in production, and macOS dev already has
 * them via Homebrew.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export interface ProbeResult {
  format: string;           // ffprobe's format_name, e.g. 'mp3' or 'mov,mp4,m4a,3gp,3g2,mj2'
  durationS: number;        // seconds, float; 0 if probe couldn't determine
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  bitRate?: number;
}

/**
 * Probe a media file and return its format, duration, and stream summary.
 * Throws if ffprobe is missing or the file is not recognised.
 */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-print_format', 'json',
    filePath,
  ], { timeout: 15_000 });

  const probed = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string; bit_rate?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };

  const format = probed.format?.format_name ?? '';
  const durationS = probed.format?.duration ? parseFloat(probed.format.duration) : 0;
  const bitRate = probed.format?.bit_rate ? parseInt(probed.format.bit_rate, 10) : undefined;

  const videoStream = (probed.streams ?? []).find(s => s.codec_type === 'video');
  const audioStream = (probed.streams ?? []).find(s => s.codec_type === 'audio');

  return {
    format,
    durationS,
    hasVideo: !!videoStream,
    hasAudio: !!audioStream,
    width: videoStream?.width,
    height: videoStream?.height,
    bitRate,
  };
}

/**
 * Extract a JPEG poster frame at 1 second into the video, written to
 * `outPath`. Resolves with the output path on success. If ffmpeg fails
 * (corrupt file, missing seek frame), throws — caller decides whether
 * to swallow.
 */
export async function extractVideoThumbnail(inPath: string, outPath: string): Promise<string> {
  await exec('ffmpeg', [
    '-y',
    '-ss', '1',
    '-i', inPath,
    '-vframes', '1',
    '-q:v', '4',
    outPath,
  ], { timeout: 15_000 });
  return outPath;
}
