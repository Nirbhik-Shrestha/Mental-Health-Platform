# Aashraya

Mental health & wellness platform (MERN). See [client/README.md](client/README.md) for the full feature overview.

## Structure

```
client/   React + Vite frontend (port 5173, proxies /api to :5000)
server/   Express + MongoDB API (port 5000)
```

## Running locally

```bash
# API — needs server/.env with PORT, MONGO_URI, JWT_SECRET
cd server
npm install
pip install vaderSentiment   # used by utils/analyze_sentiment.py
npm run dev

# Frontend (separate terminal)
cd client
npm install
npm run dev
```

## History

This repo combines two earlier repos, with their full commit history preserved:

- Frontend: https://github.com/Itachi-Ns/Aashraya → `client/`
- Backend: https://github.com/Nirbhik-Shrestha/Aashrya-Backend → `server/`
