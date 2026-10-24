# VoyageBuddy

AI trip planner. Enter source, destination, days, travellers and budget, and get transport options, 10 hotels, restaurants, hidden spots and a day-by-day plan.

**Stack:** HTML, CSS, JavaScript, React (via CDN), Node.js, Express, Groq API.

## Setup
1. Install Node.js 18 or newer.
2. Install dependencies:
   ```
   npm install
   ```
3. Create your environment file and add your Groq key from https://console.groq.com/keys:
   ```
   cp .env.example .env
   ```
   ```
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   PORT=3000
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open http://localhost:3000

## Model
VoyageBuddy uses `openai/gpt-oss-120b` on Groq by default. To try another Groq model, change `GROQ_MODEL` in `.env` and restart the server.

## Notes
- Your API key stays on the server and is never sent to the browser.
- Plans can take a few seconds to generate.
- Train timings, fares and hotel prices come from an AI model and can be out of date. Confirm them before you book.
- This setup doesn't pass a web search tool to the model, so results come from the model's own knowledge. Ask if you want live search added.

## Project structure
```
voyagebuddy/
├── server.js        Express server and Groq API call
├── package.json
├── .env.example
└── public/
    └── index.html   React front end (HTML, CSS and JS in one file)
```
