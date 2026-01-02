# Gemini API Integration Setup Guide

Your Engnr project now has Gemini API integrated for professional audio analysis! Here's how to get started:

## Step 1: Get Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

## Step 2: Configure Your API Key

Open the `.env` file in your project root and replace `your_gemini_api_key_here` with your actual API key:

```env
GEMINI_API_KEY=AIzaSyC...your_actual_key_here
```

## Step 3: Install Dependencies

Run the following command to install the new Gemini SDK:

```bash
npm install
```

## Step 4: Start Your Server

```bash
npm start
```

The server will run on http://127.0.0.1:5000

## How It Works

### Audio Analysis with Gemini

When you upload an audio file:

1. **FFmpeg Analysis**: First, the app analyzes the audio file to extract technical metrics:
   - Peak levels
   - RMS levels
   - Dynamic range
   - Sample rate and channels
   - Silence detection

2. **Gemini AI Analysis**: The audio file and metrics are sent to Gemini for professional mastering analysis. Gemini provides:
   - Quick assessment comparing to mainstream quality
   - Critical issues holding back radio-ready sound
   - Exact EQ settings (frequency, gain, Q values)
   - Precise compression settings (ratio, threshold, attack, release)
   - Saturation recommendations
   - Limiting and loudness targets (LUFS)
   - Polish touches for professional sparkle

3. **Processing**: You can then click "Apply Changes" to process the audio with the recommended settings using FFmpeg.

### Chat with Gemini

The chat interface also uses Gemini for:
- Fast Mode: Quick, concise mixing advice (uses gemini-1.5-flash)
- Detailed Mode: Comprehensive guidance (uses gemini-1.5-pro)
- Lyric verification and flow analysis

## Example Gemini Response

When you upload audio, Gemini will provide mastering analysis like:

```
1. Quick Assessment
Your track has solid fundamentals but needs professional polish to reach radio-ready quality. The dynamics are compressed but lack the crispy high-end presence and controlled low-end typical of mainstream releases.

2. Critical Issues
- Muddy low-mids around 250Hz reducing clarity
- Lacking presence and definition in the 3-4kHz range
- Not enough air and sparkle above 10kHz
- Dynamic range suggests over-compression or needs gentle limiting

3. Pro Processing Chain

EQ Settings:
- High-pass: 80Hz to remove rumble
- Cut: -3dB at 250Hz, Q=2.0 (reduce muddiness)
- Boost: +2.5dB at 3200Hz, Q=1.2 (vocal presence and clarity)
- Boost: +3dB at 12000Hz, Q=1.5 (air and shimmer for crispy top-end)

Compression:
- Ratio: 4:1
- Threshold: -18dB
- Attack: 8ms (fast enough to catch peaks)
- Release: 100ms (breathes naturally)

Limiting:
- Threshold: -0.3dB (prevent clipping)
- Target: -10 LUFS (streaming-ready loudness)

4. Polish Touches
Add gentle tape saturation (15% drive) for warmth and harmonic richness. Consider parallel compression on vocals for weight without destroying dynamics.
```

## Fallback Behavior

If the Gemini API key is not configured or the API call fails, the app automatically falls back to local rule-based analysis to keep your workflow uninterrupted.

## Troubleshooting

### "Gemini API key not configured"
- Check that you've added your API key to the `.env` file
- Make sure you replaced `your_gemini_api_key_here` with your actual key
- Restart the server after updating the `.env` file

### API Errors
- Verify your API key is valid at [Google AI Studio](https://aistudio.google.com/)
- Check your API quota and usage limits
- Ensure your audio file format is supported (MP3, WAV, M4A, AAC, OGG, FLAC, WebM)

### Audio File Too Large
- Gemini has file size limits (typically 20MB per request)
- Consider compressing your audio file or using a shorter clip for analysis

## Supported Audio Formats

The integration supports all common audio formats:
- MP3
- WAV
- M4A
- AAC
- OGG
- FLAC
- WebM

## API Costs

Gemini has a generous free tier:
- gemini-1.5-flash: 15 requests per minute, 1 million tokens per day (free)
- gemini-1.5-pro: 2 requests per minute, 50 requests per day (free)

For audio analysis, the app uses gemini-1.5-flash for optimal speed and cost-effectiveness.

## Questions?

If you encounter any issues or have questions about the integration, check the console logs for detailed error messages.
