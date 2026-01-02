import express from "express";
import multer from "multer";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
// Lightweight local replacements for AI and DB so the app runs without external services
import { analyzeAudio, formatMetricsForAI } from "./server/audioAnalysis.js";
import { processAudio, parseRecommendationsToProcessing, getProcessingDescription } from "./server/audioProcessor.js";
import { generateAnalysis, generateChat } from "./server/ai_adapter.js";

// Keep the process alive and log unexpected errors (e.g. DB connection refused)
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

const pendingProcessing = new Map();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// AI adapter: generateAnalysis and generateChat come from server/ai_adapter.js

// Simple in-memory DB
const _conversations = [];
const _messages = [];
let _nextConvId = 1;
let _nextMsgId = 1;

import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) { console.error('Failed to ensure data dir', e); }
}

function loadStore() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.conversations)) {
        _conversations.length = 0;
        parsed.conversations.forEach(c => _conversations.push(c));
      }
      if (Array.isArray(parsed.messages)) {
        _messages.length = 0;
        parsed.messages.forEach(m => _messages.push(m));
      }
      _nextConvId = parsed.nextConvId || (_conversations.reduce((max, c) => Math.max(max, c.id), 0) + 1);
      _nextMsgId = parsed.nextMsgId || (_messages.reduce((max, m) => Math.max(max, m.id), 0) + 1);
    }
  } catch (err) {
    console.error('Failed to load store:', err);
  }
}

function saveStore() {
  try {
    ensureDataDir();
    const payload = { conversations: _conversations, messages: _messages, nextConvId: _nextConvId, nextMsgId: _nextMsgId };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

function createConversation(title) {
  const conv = { id: _nextConvId++, title: title || `Conversation ${Date.now()}`, createdAt: Date.now() };
  _conversations.push(conv);
  saveStore();
  return conv;
}

function insertMessage(conversationId, role, content) {
  const msg = { id: _nextMsgId++, conversationId, role, content, createdAt: Date.now() };
  _messages.push(msg);
  saveStore();
  return msg;
}

// Ensure directories exist
["uploads", "processed", "public"].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
});

const app = express();
app.use(express.static("public"));
app.use("/processed", express.static("processed"));

const PORT = 5000;
const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.post("/api/engnr-analyze", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { conversationId, referenceTrack, userVision, professional } = req.body;
    let currentId = conversationId ? parseInt(conversationId) : null;
    const wantsPro = professional === 'true' || professional === true;

    const metrics = await analyzeAudio(req.file.path);
    const metricsText = formatMetricsForAI(metrics);

    let referenceContext = '';
    if (referenceTrack) {
      referenceContext = `\n\nREFERENCE TRACK: User wants their audio to sound like "${referenceTrack}" - match that professional, radio-ready quality with crispy highs, controlled lows, and mainstream polish.`;
    }
    
    let visionContext = '';
    if (userVision) {
      visionContext = `\n\nUSER'S VISION: "${userVision}" - Prioritize what the user wants. Tailor all recommendations to achieve their specific sound goals.`;
    }

    const analysisPrompt = `You are Engnr, an elite mix engineer known for crispy, radio-ready sound. A user uploaded audio for professional treatment. Here are the measured metrics:${referenceContext}${visionContext}

${metricsText}

Provide a PROFESSIONAL STUDIO ANALYSIS:

1. **Quick Assessment** (2 sentences): How does this compare to mainstream release quality?

2. **Critical Issues** (if any): What's holding this back from radio-ready?

3. **Pro Processing Chain** (in exact order):
   - List each processor with EXACT settings
   - Example: "Compression: 4:1 ratio, -18dB threshold, 8ms attack, 100ms release"
   - Include EQ frequencies, gain amounts, Q values
   - Reference what these settings achieve (e.g., "for that crispy OVO vocal presence")

4. **Polish Touches**: Final refinements for that mainstream sparkle

TARGET SOUND: Modern Hip-Hop/R&B clarity - think Drake, PARTYNEXTDOOR, The Weeknd. Crystal highs, controlled lows, intimate presence.

Be specific with numbers. No vague advice.`;

    const aiReply = await generateAnalysis(metrics, referenceContext, visionContext);

    if (!currentId) {
      const newConv = createConversation(`Vocal Analysis - ${new Date().toLocaleTimeString()}`);
      currentId = newConv.id;
    }

    insertMessage(currentId, "user", `[Audio Upload] Analyze this audio file: ${req.file.originalname}`);

    const userPrefs = { professional: wantsPro || !!referenceTrack };
    const processingOptions = parseRecommendationsToProcessing(metrics, aiReply, userPrefs);
    const processingSteps = getProcessingDescription(processingOptions);

    const processingId = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const newFilePath = `uploads/${processingId}_${req.file.originalname}`;
    fs.renameSync(req.file.path, newFilePath);
    
    pendingProcessing.set(processingId, {
      filePath: newFilePath,
      originalName: req.file.originalname,
      metrics,
      processingOptions,
      conversationId: currentId,
      createdAt: Date.now()
    });

    setTimeout(() => {
      const pending = pendingProcessing.get(processingId);
      if (pending) {
        try { fs.unlinkSync(pending.filePath); } catch (e) {}
        pendingProcessing.delete(processingId);
      }
    }, 30 * 60 * 1000);

    const fullReply = `**Audio Analysis Results:**
- Duration: ${metrics.duration?.toFixed(1) || 0}s
- Peak Level: ${metrics.peakLevel?.toFixed(1) || 0} dB
- RMS Level: ${metrics.rmsLevel?.toFixed(1) || -20} dB
- Dynamic Range: ${metrics.dynamicRange?.toFixed(1) || 0} dB
${metrics.issues?.length > 0 ? '\n**Issues Detected:**\n' + metrics.issues.map(i => '- ' + i).join('\n') : ''}

${aiReply}

---

**Would you like me to apply these improvements?**
I can process your audio with the following adjustments:
${processingSteps.length > 0 ? processingSteps.map(s => `- ${s}`).join('\n') : '- Basic normalization and optimization'}

Click "Apply Changes" below to create an improved version of your audio.`;

    insertMessage(currentId, "assistant", fullReply);

    res.json({ 
      metrics,
      aiReply: fullReply,
      conversationId: currentId,
      processingId,
      processingSteps,
      canProcess: true
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/process-audio", express.json(), async (req, res) => {
  try {
    const { processingId, conversationId } = req.body;
    
    if (!processingId) {
      return res.status(400).json({ error: "No processing ID provided" });
    }

    const pending = pendingProcessing.get(processingId);
    if (!pending) {
      return res.status(404).json({ error: "Processing session expired or not found. Please upload the file again." });
    }

    const currentId = conversationId || pending.conversationId;

    insertMessage(currentId, "user", "[Processing Request] Apply the recommended audio improvements");

    let processingResult;
    try {
      processingResult = await processAudio(pending.filePath, pending.processingOptions);
    } catch (processErr) {
      try { fs.unlinkSync(pending.filePath); } catch (e) {}
      pendingProcessing.delete(processingId);
      throw processErr;
    }
    
    const appliedSteps = getProcessingDescription(pending.processingOptions);

    const responseMessage = `**Processing Complete!**

Your audio has been improved with the following adjustments:
${appliedSteps.length > 0 ? appliedSteps.map(s => `- ${s}`).join('\n') : '- Basic optimization applied'}

Your processed file is ready for download. The new file maintains high quality at 48kHz/24-bit WAV format.

Let me know if you'd like any adjustments or have questions about the processing!`;

    insertMessage(currentId, "assistant", responseMessage);

    try { fs.unlinkSync(pending.filePath); } catch (e) {}
    pendingProcessing.delete(processingId);

    res.json({
      success: true,
      downloadUrl: processingResult.downloadUrl,
      filename: processingResult.outputFilename,
      message: responseMessage,
      conversationId: currentId
    });
  } catch (err) {
    console.error("Processing error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations", (req, res) => {
  try {
    const history = [..._conversations].sort((a, b) => b.createdAt - a.createdAt);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/conversations/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    for (let i = _messages.length - 1; i >= 0; i--) {
      if (_messages[i].conversationId === id) _messages.splice(i, 1);
    }
    for (let i = _conversations.length - 1; i >= 0; i--) {
      if (_conversations[i].id === id) _conversations.splice(i, 1);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations/:id/messages", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const msgs = _messages.filter(m => m.conversationId === id).sort((a, b) => a.createdAt - b.createdAt);
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ENGNR_SYSTEM_PROMPT = `You are Engnr, an elite AI mix engineer who has worked with top-tier artists. You deliver mainstream, radio-ready, professional studio quality. Your mixes are known for being CRISPY, punchy, and polished.

SOUND SIGNATURE:
- Modern R&B/Hip-Hop vocal clarity: crystal-clear highs, controlled low-mids, intimate presence
- Crispy top-end (10-16kHz air and shimmer without harshness)
- Punchy, tight compression that breathes naturally
- Wide stereo image with focused center
- Deep, controlled sub-bass (no mud, no boom)
- Professional loudness (-8 to -10 LUFS for streaming masters)

EXPERTISE AREAS:
- Vocal Chains: Serial compression, parallel saturation, surgical de-essing, pitch correction integration
- Modern Hip-Hop/R&B: OVO-style warm intimacy, crisp hi-hats, 808 sub control, vocal layering
- Mix Bus Processing: Glue compression, soft clipping, multiband dynamics, stereo enhancement
- Mastering: LUFS targeting, true peak limiting, mid-side EQ, final polish

PROCESSING PHILOSOPHY:
- Less is more: surgical moves, not broad strokes
- Gain staging is everything: -18dBFS average before processing
- Parallel processing for weight without destroying transients
- High-pass everything that doesn't need sub frequencies
- De-ess before compression to prevent pumping on sibilants

RESPONSE STYLE:
- Give EXACT settings: "4:1 ratio, -18dB threshold, 10ms attack, 80ms release"
- Reference pro techniques: "Similar to how 40 processes Drake's vocals..."
- Recommend specific signal chains in order
- If user specifies what they want, prioritize their vision
- Always explain WHY a setting works, not just what to do

IMPORTANT - AUDIO PROCESSING WORKFLOW:
- You can ANALYZE audio and RECOMMEND changes, but you CANNOT directly apply changes through chat
- When you analyze uploaded audio, the user sees an "Apply Changes" button below your analysis
- If the user says "yes", "apply", "do it", or agrees in chat, tell them: "Click the green Apply Changes button below my analysis to process your audio!"
- NEVER say you have "applied" or "theoretically applied" or "conceptually applied" changes - you ONLY recommend them
- The actual audio processing happens ONLY when the user clicks the "Apply Changes" button
- After clicking, they get a download link for their processed file`;

app.post("/api/engnr-chat", express.json(), async (req, res) => {
  try {
    const { prompt, conversationId, modes = {}, lyrics = "" } = req.body;
    let currentId = conversationId;

    if (!currentId) {
      const title = (prompt || "Lyric Check").slice(0, 30) + ((prompt || "").length > 30 ? "..." : "");
      const newConv = createConversation(title);
      currentId = newConv.id;
    }

    const userContent = modes.lyricVerify && lyrics ? `[Lyric Check] ${prompt || 'Verify lyrics'}\n\nLyrics:\n${lyrics}` : prompt;
    insertMessage(currentId, "user", userContent);

    const previousMsgs = _messages.filter(m => m.conversationId === currentId).sort((a, b) => a.createdAt - b.createdAt);
    const chatHistory = previousMsgs.slice(-10).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

    if (modes.fast && modes.webSearch) {
      modes.fast = true;
      modes.webSearch = false;
    }

    let systemInstruction = ENGNR_SYSTEM_PROMPT;
    let generationConfig = { maxOutputTokens: 1024, temperature: 0.7 };

    if (modes.fast) {
      systemInstruction += "\n\nMODE: FAST - Be extremely brief. Give quick, actionable advice in 2-3 sentences max. No lengthy explanations.";
      generationConfig = { maxOutputTokens: 200, temperature: 0.7 };
    } else if (modes.webSearch) {
      systemInstruction += "\n\nMODE: DETAILED - Provide comprehensive, in-depth guidance. Include specific techniques, exact plugin settings, industry standards, pro tips, and common mistakes to avoid. Structure your response clearly with categories.";
      generationConfig = { maxOutputTokens: 2048, temperature: 0.8 };
    } else if (modes.lyricVerify && lyrics) {
      systemInstruction += `\n\nMODE: LYRIC ANALYSIS - Analyze these lyrics for flow, rhythm compatibility, syllable structure, rhyme scheme, and suggest improvements for recording/performance.
      
LYRICS TO ANALYZE:
${lyrics}`;
      generationConfig = { maxOutputTokens: 2048, temperature: 0.6 };
    }

    const contents = [
      { role: "user", parts: [{ text: systemInstruction }] },
      { role: "model", parts: [{ text: "Understood! I'm Engnr, your AI sound engineering partner. I'll help you with mixing, mastering, and all things audio. What are you working on?" }] },
      ...chatHistory
    ];

    const text = await generateChat(prompt || "", modes);
    insertMessage(currentId, "assistant", text);
    res.json({ reply: text || "No reply generated.", conversationId: currentId });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/upload", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const inputFile = req.file.path;
  const outputFile = `processed/${req.file.filename}.wav`;

  ffmpeg(inputFile)
    .audioCodec("pcm_s16le")
    .format("wav")
    .on("end", () => {
      res.json({
        metrics: { clarity: "High", pitch: "Stable", balance: "Needs more bass" },
        recommendations: ["Boost low frequencies", "Add compression to vocals"],
        steps: ["Normalize audio", "Apply EQ", "Add reverb"],
        file: outputFile
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      res.status(500).json({ error: err.message });
    })
    .save(outputFile);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
