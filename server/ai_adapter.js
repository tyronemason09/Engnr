import fetch from 'node-fetch';
import fs from 'fs';

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

function localChat(prompt, modes = {}) {
  if (modes.fast) return 'Short: Understood. Quick tip: check gain staging and de-ess.';
  return `Engnr reply: I read your prompt and can help. You asked: ${prompt}`;
}

async function callHfModel(prompt, model = 'distilgpt2', max_length = 512) {
  const token = process.env.HF_API_KEY;
  if (!token) throw new Error('No HF_API_KEY');

  const url = `https://api-inference.huggingface.co/models/${model}`;
  const body = { inputs: prompt, parameters: { max_new_tokens: Math.min(512, max_length) } };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeout: 120000,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HF error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  if (Array.isArray(json) && json[0]?.generated_text) return json[0].generated_text;
  if (json?.error && typeof json.error === 'string') throw new Error(json.error);
  if (typeof json === 'string') return json;
  // Try to extract text
  if (Array.isArray(json) && json[0]) return JSON.stringify(json[0]);
  return JSON.stringify(json);
}

export async function generateAnalysis(metrics, referenceContext = '', visionContext = '') {
  if (process.env.HF_API_KEY) {
    const prompt = `Audio metrics:\n${JSON.stringify(metrics, null, 2)}\n\nReference:${referenceContext}\nVision:${visionContext}\n\nProvide a professional studio analysis, issues, and concrete processing chain.`;
    try {
      const out = await callHfModel(prompt, process.env.HF_MODEL || 'distilgpt2', 512);
      return out;
    } catch (err) {
      console.error('HF analysis failed, falling back to local:', err.message);
    }
  }
  return localAnalysis(metrics, referenceContext, visionContext);
}

export async function generateChat(prompt, modes = {}) {
  if (process.env.HF_API_KEY) {
    const sys = modes.fast ? 'Be brief.' : 'Be detailed.';
    const p = `${sys}\nUser: ${prompt}\nAssistant:`;
    try {
      const out = await callHfModel(p, process.env.HF_MODEL || 'distilgpt2', modes.fast ? 200 : 512);
      return out;
    } catch (err) {
      console.error('HF chat failed, falling back to local:', err.message);
    }
  }
  return localChat(prompt, modes);
}

export default { generateAnalysis, generateChat };
