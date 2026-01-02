import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import path from 'path';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const processedDir = './processed';
if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir, { recursive: true });
}

export async function processAudio(inputPath, processingOptions = {}) {
  const {
    normalize = false,
    targetLoudness = -14,
    compression = false,
    compThreshold = -20,
    compRatio = 4,
    compAttack = 10,
    compRelease = 200,
    eq = null,
    deEss = false,
    deEssFreq = 6000,
    limiter = false,
    limiterThreshold = -1,
    noiseReduction = false,
    noiseAmount = 0.21,
    highpass = null,
    lowpass = null,
    stereoWidth = null,
  } = processingOptions;

  const timestamp = Date.now();
  const inputBasename = path.basename(inputPath, path.extname(inputPath));
  const outputFilename = `${inputBasename}_processed_${timestamp}.wav`;
  const outputPath = path.join(processedDir, outputFilename);

  const filters = [];

  if (highpass) {
    filters.push(`highpass=f=${highpass}`);
  }

  if (lowpass) {
    filters.push(`lowpass=f=${lowpass}`);
  }

  if (noiseReduction) {
    filters.push(`afftdn=nf=${noiseAmount}`);
  }

  if (eq && Array.isArray(eq) && eq.length > 0) {
    const eqParts = eq.map(band => {
      return `equalizer=f=${band.freq}:width_type=o:width=${band.width || 1}:g=${band.gain}`;
    });
    filters.push(...eqParts);
  }

  if (deEss) {
    filters.push(`highshelf=f=${deEssFreq}:g=-4`);
  }

  if (compression) {
    filters.push(`acompressor=threshold=${compThreshold}dB:ratio=${compRatio}:attack=${compAttack}:release=${compRelease}`);
  }

  if (limiter) {
    filters.push(`alimiter=limit=${limiterThreshold}dB:level=disabled`);
  }

  if (normalize) {
    filters.push(`loudnorm=I=${targetLoudness}:TP=-1:LRA=11`);
  }

  if (stereoWidth !== null) {
    if (stereoWidth > 1) {
      filters.push(`stereotools=mlev=1:slev=${stereoWidth}`);
    } else if (stereoWidth < 1) {
      filters.push(`stereotools=mlev=${2 - stereoWidth}:slev=${stereoWidth}`);
    }
  }

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (filters.length > 0) {
      command = command.audioFilters(filters);
    }

    command
      .audioCodec('pcm_s24le')
      .audioFrequency(48000)
      .format('wav')
      .on('start', (cmdLine) => {
        console.log('FFmpeg processing started:', cmdLine);
      })
      .on('progress', (progress) => {
        console.log('Processing progress:', progress.percent?.toFixed(1) + '%');
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('Processing complete:', outputPath);
        resolve({
          success: true,
          outputPath,
          outputFilename,
          downloadUrl: `/processed/${outputFilename}`,
        });
      })
      .save(outputPath);
  });
}

export function parseRecommendationsToProcessing(analysisMetrics, aiRecommendations, userPreferences = {}) {
  const options = {};
  const rec = aiRecommendations.toLowerCase();
  const metrics = analysisMetrics;
  
  const proMode = userPreferences.professional || rec.includes('professional') || rec.includes('radio-ready') || rec.includes('mainstream') || rec.includes('crispy') || rec.includes('drake') || rec.includes('ovo');

  options.highpass = 80;
  if (rec.includes('vocal') || rec.includes('voice')) {
    options.highpass = 100;
  }

  if (proMode || metrics.issues?.includes('quiet') || rec.includes('normalize') || rec.includes('bring up the level') || rec.includes('too quiet') || rec.includes('lufs')) {
    options.normalize = true;
    options.targetLoudness = proMode ? -10 : -14;
  }

  if (proMode || metrics.issues?.includes('clipping') || rec.includes('limiter') || rec.includes('clipping') || rec.includes('peaks') || rec.includes('limiting')) {
    options.limiter = true;
    options.limiterThreshold = proMode ? -0.3 : -1;
  }

  if (proMode || rec.includes('compress') || rec.includes('compression') || rec.includes('dynamics') || rec.includes('punch')) {
    options.compression = true;
    if (proMode) {
      options.compRatio = 4;
      options.compThreshold = -18;
      options.compAttack = 8;
      options.compRelease = 100;
    } else if (rec.includes('gentle') || rec.includes('subtle') || rec.includes('light')) {
      options.compRatio = 2;
      options.compThreshold = -18;
    } else if (rec.includes('heavy') || rec.includes('aggressive')) {
      options.compRatio = 6;
      options.compThreshold = -24;
    } else {
      options.compRatio = 4;
      options.compThreshold = -20;
    }
  }

  if (rec.includes('de-ess') || rec.includes('sibilance') || rec.includes('harsh s') || rec.includes('ess')) {
    options.deEss = true;
    options.deEssFreq = 6000;
  }

  if (rec.includes('rumble') || rec.includes('low cut') || rec.includes('high-pass') || rec.includes('highpass') || rec.includes('mud')) {
    if (rec.includes('100') || rec.includes('100hz')) options.highpass = 100;
    if (rec.includes('120') || rec.includes('120hz')) options.highpass = 120;
  }

  if (rec.includes('noise') || rec.includes('hiss') || rec.includes('background noise')) {
    options.noiseReduction = true;
    options.noiseAmount = 0.15;
  }

  options.eq = [];

  if (rec.includes('muddy') || rec.includes('boomy') || rec.includes('too much low') || rec.includes('cut the low') || rec.includes('200hz') || rec.includes('250hz')) {
    options.eq.push({ freq: 250, gain: -3, width: 2 });
  }

  if (rec.includes('boxy') || rec.includes('nasal') || rec.includes('400hz') || rec.includes('500hz')) {
    options.eq.push({ freq: 450, gain: -2.5, width: 1.5 });
  }

  if (proMode || rec.includes('presence') || rec.includes('clarity') || rec.includes('cut through') || rec.includes('definition') || rec.includes('3k') || rec.includes('3000')) {
    options.eq.push({ freq: 3200, gain: proMode ? 2.5 : 2, width: 1.2 });
  }

  if (proMode || rec.includes('air') || rec.includes('brightness') || rec.includes('sparkle') || rec.includes('crispy') || rec.includes('shimmer') || rec.includes('10k') || rec.includes('12k')) {
    options.eq.push({ freq: 12000, gain: proMode ? 3 : 2, width: 1.5 });
  }

  if (rec.includes('warmth') || rec.includes('body') || rec.includes('fullness') || rec.includes('low mids')) {
    options.eq.push({ freq: 180, gain: 1.5, width: 1 });
  }

  if (proMode) {
    const hasPresence = options.eq.some(e => e.freq >= 2500 && e.freq <= 4000);
    const hasAir = options.eq.some(e => e.freq >= 10000);
    if (!hasPresence) options.eq.push({ freq: 3200, gain: 2, width: 1.2 });
    if (!hasAir) options.eq.push({ freq: 12000, gain: 2.5, width: 1.5 });
    
    if (!options.eq.some(e => e.freq >= 200 && e.freq <= 300)) {
      options.eq.push({ freq: 250, gain: -2, width: 2 });
    }
  }

  if (options.eq.length === 0) {
    delete options.eq;
  }

  return options;
}

export function getProcessingDescription(options) {
  const descriptions = [];

  if (options.normalize) {
    descriptions.push(`Normalize to ${options.targetLoudness} LUFS`);
  }
  if (options.highpass) {
    descriptions.push(`High-pass filter at ${options.highpass}Hz`);
  }
  if (options.lowpass) {
    descriptions.push(`Low-pass filter at ${options.lowpass}Hz`);
  }
  if (options.noiseReduction) {
    descriptions.push('Noise reduction');
  }
  if (options.eq && options.eq.length > 0) {
    const eqDesc = options.eq.map(b => `${b.gain > 0 ? '+' : ''}${b.gain}dB at ${b.freq}Hz`).join(', ');
    descriptions.push(`EQ: ${eqDesc}`);
  }
  if (options.deEss) {
    descriptions.push('De-esser');
  }
  if (options.compression) {
    descriptions.push(`Compression (${options.compRatio}:1 ratio, ${options.compThreshold}dB threshold)`);
  }
  if (options.limiter) {
    descriptions.push(`Limiter at ${options.limiterThreshold}dB`);
  }

  return descriptions;
}
