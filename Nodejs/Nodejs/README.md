# Engnr — Local Mode

This project runs a local version of the Engnr app without external AI or a database. It uses free tools only (ffmpeg via ffmpeg-static) and a simple on-disk JSON store for conversations.

Quick start (PowerShell):

```powershell
cd Nodejs\Nodejs
npm install
npm start
```

Open http://127.0.0.1:5000 in your browser.

Notes:
- Conversations and messages persist to `server/data/store.json`.
- The app uses a local, rule-based AI stub — no API keys required.
- Processed audio files are written to the `processed/` folder and served from `/processed`.

Next steps you can ask for:
- Use a lightweight SQLite file for structured persistence.
- Hook a free LLM backend if you want richer AI replies.
- Add automated tests or CI.
