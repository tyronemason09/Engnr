import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);
const execAsync = promisify(exec);

export async function analyzeAudio(filePath) {
  const metrics = {
    duration: 0,
    sampleRate: 0,
    channels: 0,
    bitRate: 0,
    peakLevel: 0,
    rmsLevel: 0,
    dynamicRange: 0,
    loudness: null,
    silenceRatio: 0,
    issues: []
  };

  try {
    const probeData = await getProbeData(filePath);
    const audioStream = probeData.streams?.find(s => s.codec_type === "audio");
    
    if (!audioStream) {
      throw new Error("No audio stream found in file");
    }

    metrics.duration = parseFloat(probeData.format?.duration) || 0;
    metrics.sampleRate = parseInt(audioStream.sample_rate) || 44100;
    metrics.channels = audioStream.channels || 2;
    metrics.bitRate = parseInt(probeData.format?.bit_rate) || 0;
    metrics.codec = audioStream.codec_name || "unknown";

    const volumeStats = await getVolumeStats(filePath);
    metrics.peakLevel = volumeStats.max_volume;
    metrics.rmsLevel = volumeStats.mean_volume;
    metrics.dynamicRange = Math.abs(volumeStats.max_volume - volumeStats.mean_volume);

    const silenceData = await detectSilence(filePath, metrics.duration);
    metrics.silenceRatio = silenceData.ratio;

    analyzeIssues(metrics);

    return metrics;
  } catch (err) {
    console.error("Audio analysis error:", err);
    metrics.issues.push(`Analysis error: ${err.message}`);
    return metrics;
  }
}

async function getProbeData(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function getVolumeStats(filePath) {
  try {
    const cmd = `${ffmpegPath} -i "${filePath}" -af "volumedetect" -f null - 2>&1`;
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const output = stdout + stderr;

    const maxMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);

    return {
      max_volume: maxMatch ? parseFloat(maxMatch[1]) : 0,
      mean_volume: meanMatch ? parseFloat(meanMatch[1]) : -20
    };
  } catch (err) {
    console.error("Volume detection error:", err);
    return { max_volume: 0, mean_volume: -20 };
  }
}

async function detectSilence(filePath, duration) {
  try {
    const cmd = `${ffmpegPath} -i "${filePath}" -af "silencedetect=noise=-50dB:d=0.5" -f null - 2>&1`;
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const output = stdout + stderr;

    const silenceEnds = output.match(/silence_end:\s*([\d.]+)/g) || [];
    const silenceStarts = output.match(/silence_start:\s*([\d.]+)/g) || [];

    let totalSilence = 0;
    const starts = silenceStarts.map(s => parseFloat(s.split(":")[1]));
    const ends = silenceEnds.map(e => parseFloat(e.split(":")[1]));

    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      totalSilence += ends[i] - starts[i];
    }

    return {
      ratio: duration > 0 ? (totalSilence / duration) * 100 : 0
    };
  } catch (err) {
    return { ratio: 0 };
  }
}

function analyzeIssues(metrics) {
  if (metrics.peakLevel > -0.5) {
    metrics.issues.push("Clipping detected - peaks are too hot");
  } else if (metrics.peakLevel > -3) {
    metrics.issues.push("Peaks are close to clipping - consider reducing gain");
  }

  if (metrics.rmsLevel < -30) {
    metrics.issues.push("Very quiet recording - may need gain or normalization");
  } else if (metrics.rmsLevel > -10) {
    metrics.issues.push("Recording is quite loud - watch for compression artifacts");
  }

  if (metrics.dynamicRange < 6) {
    metrics.issues.push("Low dynamic range - may sound over-compressed");
  } else if (metrics.dynamicRange > 25) {
    metrics.issues.push("High dynamic range - may need compression for consistency");
  }

  if (metrics.silenceRatio > 30) {
    metrics.issues.push("Significant silence detected - consider trimming");
  }
}

export function formatMetricsForAI(metrics) {
  return `
AUDIO FILE ANALYSIS RESULTS:
============================
Duration: ${metrics.duration.toFixed(2)} seconds
Sample Rate: ${metrics.sampleRate} Hz
Channels: ${metrics.channels === 1 ? "Mono" : metrics.channels === 2 ? "Stereo" : metrics.channels + " channels"}
Codec: ${metrics.codec}

LEVELS:
- Peak Level: ${metrics.peakLevel.toFixed(1)} dB
- RMS Level: ${metrics.rmsLevel.toFixed(1)} dB  
- Dynamic Range: ${metrics.dynamicRange.toFixed(1)} dB
- Silence Ratio: ${metrics.silenceRatio.toFixed(1)}%

${metrics.issues.length > 0 ? `DETECTED ISSUES:\n${metrics.issues.map(i => "- " + i).join("\n")}` : "No major issues detected."}
`;
}
