# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open News is an open-source news aggregator that compares how stories are reported across the political spectrum (left to right). It clusters related articles from multiple sources and provides side-by-side bias comparison. Built with Fastify (backend) + React/Vite (frontend) + SQLite.

## Commands

### Development
```bash
npm run dev              # HTTP/2 dev server with Vite HMR (recommended)
npm run dev:split        # Concurrent backend + frontend (legacy)
```

### Database
```bash
npm run migrate          # Initialize/update database schema
npm run seed             # Seed news sources from config/sources.json
```

### Data Processing
```bash
npm run ingest           # Manually fetch articles from RSS feeds
npm run cluster          # Run clustering algorithm on articles
```

### Production
```bash
npm run build            # Build frontend only
npm start                # Run production server
```

### Testing
```bash
npm test                 # Run Jest tests
npm run llm              # LLM testing CLI
```

## Architecture

### Backend (`src/`)
- **server.js** - Main entry point, Fastify server setup
- **api/** - REST endpoints (`routes.js`, `settings-routes.js`)
- **db/** - SQLite with better-sqlite3
  - `database.js` - Connection and initialization
  - `models.js` - Data models (Source, Article, Cluster, Entity, Embedding)
  - `schema.sql` / `settings-schema.sql` - Database schemas
- **ingestion/** - RSS feed processing pipeline
- **clustering/** - Two-stage clustering: TF-IDF keywords → transformer embeddings (K-means)
- **bias/** - Bias distribution calculations
- **llm/** - LLM integration with adapter pattern (Ollama, LM Studio, OpenAI, Anthropic, Gemini)
- **jobs/** - Scheduled tasks (ingest, cluster, backup, cleanup)

### Frontend (`frontend/`)
- Vite + React 18
- `src/pages/` - Page components
- `src/services/` - API client

### Key Data Flow
1. RSS feeds → `ingestion/` → articles stored in SQLite
2. Articles → `clustering/` (TF-IDF + embeddings) → clusters created
3. Clusters → `bias/` → bias distribution calculated
4. Optional: `llm/` for advanced bias detection and fact extraction

## Database Schema

Core tables: `sources`, `articles`, `clusters`, `article_clusters` (M:M), `entities`, `embeddings`, `ingestion_log`, `scheduled_jobs`, `settings`

Articles have unique constraint on URL. Clusters contain aggregated bias distribution from their articles.

## Environment Variables

Key settings in `.env`:
- `PORT` / `API_PORT` - Server ports (default 3000/3001)
- `DB_PATH` - SQLite database location
- `CONTENT_MODE` - `safe` (metadata only) or `research` (full text)
- `SIMILARITY_THRESHOLD` - Clustering strictness (0-1, default 0.7)
- `MIN_CLUSTER_SIZE` - Minimum articles per cluster
- `LLM_ADAPTER` - ollama/lmstudio/openai/anthropic/gemini
- `INGEST_INTERVAL` / `CLUSTER_INTERVAL` - Cron expressions

## Code Conventions

- ES modules throughout (`import`/`export`, `"type": "module"`)
- Async/await for all async operations
- Models follow Data Mapper pattern in `src/db/models.js`
- Jobs in `src/jobs/` are independently runnable scripts
