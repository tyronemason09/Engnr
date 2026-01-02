import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

function localAnalysis(metrics, referenceContext = '', visionContext = '') {
  const parts = [];
  parts.push('Quick Assessment: This audio has been analyzed by Engnr.');

  if ((metrics.peakLevel || 0) > -1) parts.push('Peaks are high; recommend limiter/clip prevention.');
  if ((metrics.rmsLevel || -20) < -30) parts.push('Recording is quiet; recommend normalization and bring up level.');
  if ((metrics.dynamicRange || 0) < 6) parts.push('Low dynamic range; consider compression.');
  if ((metrics.silenceRatio || 0) > 20) parts.push('Significant silence detected; consider trimming.');

  const keywordHints = [];
  if ((metrics.rmsLevel || -20) < -24) keywordHints.push('normalize');
  if ((metrics.peakLevel || 0) > -3) keywordHints.push('limiter');
  if ((metrics.dynamicRange || 0) < 8) keywordHints.push('compress');
  if ((metrics.silenceRatio || 0) > 20) keywordHints.push('trim');

  if (referenceContext) keywordHints.push('professional');
  if (visionContext) keywordHints.push('user-vision');

  parts.push('Recommendations: ' + (keywordHints.join(', ') || 'basic normalization'));
  parts.push('Pro Processing Chain: normalize, compression, de-essing if needed, EQ, limiter');
  parts.push('Polish: gentle high-shelf for air, midrange presence around 3kHz');

  return parts.join('\n\n');
}

async function callGeminiForAnalysis(audioFilePath, metrics, referenceContext = '', visionContext = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const audioData = fs.readFileSync(audioFilePath);
  const base64Audio = audioData.toString('base64');
  const mimeType = getMimeType(audioFilePath);

  const metricsText = `
AUDIO FILE METRICS:
- Duration: ${metrics.duration?.toFixed(2) || 0}s
- Peak Level: ${metrics.peakLevel?.toFixed(1) || 0} dB
- RMS Level: ${metrics.rmsLevel?.toFixed(1) || -20} dB
- Dynamic Range: ${metrics.dynamicRange?.toFixed(1) || 0} dB
- Sample Rate: ${metrics.sampleRate || 44100} Hz
- Channels: ${metrics.channels === 1 ? 'Mono' : metrics.channels === 2 ? 'Stereo' : metrics.channels}
${metrics.issues?.length > 0 ? '\nIssues: ' + metrics.issues.join(', ') : ''}
`;

  const prompt = `You are Engnr, an elite mix engineer known for crispy, radio-ready sound. Analyze this audio file for professional mastering.${referenceContext}${visionContext}

${metricsText}

Provide a PROFESSIONAL MASTERING ANALYSIS with EXACT settings:

1. Quick Assessment (2 sentences): How does this compare to mainstream release quality?

2. Critical Issues (if any): What's holding this back from radio-ready?

3. Pro Processing Chain (in exact order):
   - EQ Settings: List each band with frequency, gain (dB), and Q value
     Example: "Low Cut: 80Hz, High-pass | Presence Boost: +2.5dB at 3200Hz, Q=1.2"

   - Compression Settings: Ratio, threshold (dB), attack (ms), release (ms)
     Example: "Compression: 4:1 ratio, -18dB threshold, 8ms attack, 100ms release"

   - Saturation/Harmonics: Type and amount if needed
     Example: "Tape saturation: 15% drive for warmth"

   - Limiting: Threshold and target loudness
     Example: "Limiter: -0.3dB threshold, target -10 LUFS"

4. Polish Touches: Final refinements for mainstream sparkle

TARGET SOUND: Modern Hip-Hop/R&B clarity - crispy highs, controlled lows, intimate presence (Drake, PARTYNEXTDOOR, The Weeknd style).

Be specific with numbers. No vague advice.`;

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Audio
      }
    },
    { text: prompt }
  ]);

  const response = await result.response;
  return response.text();
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mp3',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  };
  return mimeTypes[ext] || 'audio/wav';
}

function localChat(prompt, modes = {}) {
  if (modes.fast) return 'Short: Understood. Quick tip: check gain staging and de-ess.';
  return `Engnr reply: I read your prompt and can help. You asked: ${prompt}`;
}

export async function generateAnalysis(metrics, referenceContext = '', visionContext = '', audioFilePath = null) {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' && audioFilePath) {
    try {
      console.log('Using Gemini API for audio analysis...');
      const analysis = await callGeminiForAnalysis(audioFilePath, metrics, referenceContext, visionContext);
      return analysis;
    } catch (err) {
      console.error('Gemini API failed:', err.message);
      console.log('Falling back to local analysis');
    }
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.log('Gemini API key not configured. Using local analysis.');
  }

  return localAnalysis(metrics, referenceContext, visionContext);
}

export async function generateChat(prompt, modes = {}) {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: modes.fast ? 'gemini-1.5-flash' : 'gemini-1.5-pro'
      });

      const systemPrompt = `You are Engnr, an elite AI mix engineer. You deliver mainstream, radio-ready sound.
${modes.fast ? 'Be extremely brief (2-3 sentences max).' : ''}
${modes.webSearch ? 'Provide comprehensive, detailed guidance with specific techniques and exact settings.' : ''}
${modes.lyricVerify ? 'Analyze lyrics for flow, rhythm, and structure.' : ''}`;

      const result = await model.generateContent(`${systemPrompt}\n\nUser: ${prompt}`);
      const response = await result.response;
      return response.text();
    } catch (err) {
      console.error('Gemini chat failed:', err.message);
    }
  }
  return localChat(prompt, modes);
}

export default { generateAnalysis, generateChat };
