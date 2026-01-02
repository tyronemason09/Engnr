# Engnr - AI-Powered Sound Design Platform

## Overview

Engnr is an AI-powered audio engineering and sound design application. It allows users to upload audio files for analysis and provides AI-driven recommendations for tone, clarity, pitch, dynamics, and balance. The platform combines audio processing capabilities with a conversational AI interface to help users improve their sound production workflow.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js (v5) running on Node.js with ES modules
- **Entry Point**: `index.js` serves as the main application file
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Static File Serving**: Express serves the `public/` directory for frontend assets and `processed/` for output files

### AI Integration
- **Provider**: Google Gemini via Replit AI Integrations service
- **Models Available**: 
  - `gemini-2.5-flash` - Fast text generation
  - `gemini-2.5-pro` - Advanced reasoning
  - `gemini-2.5-flash-image` - Image generation
- **Configuration**: Uses environment variables `AI_INTEGRATIONS_GEMINI_API_KEY` and `AI_INTEGRATIONS_GEMINI_BASE_URL` (Replit provides these automatically)

### AI Personality (Elite Mix Engineer)
- **Sound Signature**: Radio-ready, mainstream quality - crispy highs, controlled lows, professional polish
- **Reference Sound**: Drake, PARTYNEXTDOOR, The Weeknd - OVO-style warm intimacy with crystal clarity
- **Context Awareness**: Maintains last 10 messages of conversation history for contextual responses
- **Expertise Areas**: Vocal chains, modern Hip-Hop/R&B, mix bus processing, mastering for streaming
- **Response Format**: EXACT settings (e.g., "4:1 ratio, -18dB threshold, 8ms attack, 100ms release")
- **User Vision**: Prioritizes user's specific requests - users can tell AI exactly what sound they want

### Reference Track Feature
- Users can upload a reference track (purple music note button) to specify their target sound
- Reference track name is passed to AI analysis for tailored recommendations
- AI matches processing to achieve the reference track's professional quality

### Audio Processing & Analysis
- **Upload Handling**: Multer middleware for file uploads to `uploads/` directory
- **Audio Processing**: FFmpeg via `fluent-ffmpeg` for audio manipulation
- **FFmpeg Binary**: Uses `ffmpeg-static` and `ffprobe-static` for cross-platform compatibility
- **Analysis Module**: `server/audioAnalysis.js` extracts real metrics from audio files:
  - Peak level (dB)
  - RMS level (dB)
  - Dynamic range
  - Duration, sample rate, channels
  - Silence ratio detection
  - Issue detection (clipping, quiet recordings, over-compression)
- **AI Integration**: Metrics are passed to Gemini AI which provides contextual recommendations based on actual audio characteristics

### Audio Processing Pipeline
- **Processing Module**: `server/audioProcessor.js` applies AI-recommended improvements using FFmpeg
- **Available Effects**:
  - Loudness normalization (LUFS targeting)
  - Compression with configurable ratio/threshold/attack/release
  - EQ adjustments (low/mid/high frequency bands)
  - De-essing for harsh sibilance
  - High-pass filtering for rumble removal
  - Noise reduction
  - Limiting for peak control
- **AI-to-FFmpeg Translation**: Parses AI recommendations and converts them to FFmpeg filter chains
- **Processing Flow**:
  1. User uploads audio → Analysis with metrics extraction
  2. AI provides recommendations → User sees "Apply Changes" button
  3. User clicks Apply → FFmpeg processes audio with recommended settings
  4. Download link provided → High-quality 48kHz/24-bit WAV output
- **Session Management**: Processing sessions expire after 30 minutes; uploaded files cleaned up automatically

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL schema definitions
- **Schema Location**: `server/db/schema.js` and `server/db/index.js`
- **Schema Validation**: Zod schemas via `drizzle-zod` for type-safe inserts
- **Tables**:
  - `conversations` - Stores chat sessions with title and timestamp (id, title, created_at)
  - `messages` - Stores individual messages linked to conversations (id, conversation_id, role, content, created_at)

### Chat History Feature
- Persistent conversation history saved to PostgreSQL database
- Sidebar displays all previous sessions with date and time
- Users can click any session to load the full conversation
- New sessions automatically created when user sends first message
- Each message timestamped with creation date/time

### Chat Modes
The chat interface supports multiple modes that modify AI behavior:
- **Fast Mode** (lightning icon): Quick, concise responses (2-3 sentences, max 150 tokens)
- **Web Search Mode** (slider icon): Comprehensive, detailed guidance with industry knowledge, techniques, and tool recommendations
- **Lyric Verification** (music note icon): Structured lyric analysis for flow, rhythm, syllable count, and rhyme scheme
- **File Upload** (plus icon): Upload audio files for AI analysis

Note: Fast Mode and Web Search Mode are mutually exclusive - enabling one disables the other. Backend enforces this rule even if both are sent in a request (fast takes priority).

### Frontend Architecture
- **Approach**: Simple static HTML served from `public/` directory
- **Styling**: Tailwind CSS via CDN with custom glassmorphism/metallic design system
- **Fonts**: Inter and Outfit from Google Fonts
- **Design Pattern**: Single-page application with sidebar navigation, main chat area, and right panel for uploads/analysis

### Batch Processing
- **Concurrency Control**: Uses `p-limit` for rate limiting API calls
- **Retry Logic**: Uses `p-retry` for handling rate limit errors with exponential backoff
- **Progress Tracking**: Supports callback-based progress updates and SSE streaming

## External Dependencies

### AI Services
- **Replit AI Integrations**: Provides Gemini API access without requiring separate API keys. Environment variables are automatically configured by Replit.

### Database
- **PostgreSQL**: Required for chat conversation persistence via Drizzle ORM. Database connection configured through the `server/db` module.

### Audio Processing
- **FFmpeg**: Static binary included via npm for audio file processing (conversion, analysis, manipulation)

### NPM Packages
- `@google/genai` - Google Gemini SDK for AI features
- `express` - Web server framework
- `multer` - Multipart form handling for file uploads
- `fluent-ffmpeg` + `ffmpeg-static` - Audio processing pipeline
- `drizzle-orm` + `drizzle-zod` - Database ORM and validation
- `zod` - Runtime type validation
- `p-limit` + `p-retry` - Rate limiting and retry utilities for API calls