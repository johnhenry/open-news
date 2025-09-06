Please create the project according to the given PRD

⸻

Product Requirements Document (PRD)

Open-Source Ground News–Style Aggregator

⸻

1. Overview

This project is an open-source alternative to Ground News, designed to let users compare how news is reported across the political spectrum. It aggregates articles from diverse outlets, classifies bias, clusters stories into shared topics, and provides visualizations to highlight differences in framing.

The platform is self-hostable (Raspberry Pi, local server, cloud), with a plugin-based architecture for scraping and paywall bypass. It defaults to safe/legal metadata-only mode, but can be extended into research mode (full-text storage, NLP-driven bias analysis, fact extraction).

⸻

2. Goals & Objectives
	•	Transparency: Show how the same event is reported differently by left, center, and right outlets.
	•	Comparative Visualization: Provide timelines, charts, and side-by-side comparison views.
	•	Extensibility: Modular ingestion pipeline with plugins for scraping, paywall bypass, and new source adapters.
	•	Openness: MIT/AGPL-licensed, community-driven source/bias list.
	•	Research Utility: Exports (CSV/JSON) for academic/media bias research.

⸻

3. MVP Decisions (Your Choices)

Area	Decision
Bias Classification	Hybrid — Source-level baseline + optional article overrides
Fact Core	Consensus summaries via NLP/LLM
Content Access	RSS/API first, plugin scrapers for paywalls
Clustering	Hybrid — keyword pre-filter + embeddings refinement
Scope	Tiered — start small (~5 per bias), expand via community
User Features	Visualizations (charts, timelines) + Researcher exports
Legal/Ethical	Dual mode — Safe (metadata only) + Research (full text)
Technical Architecture	Lightweight MVP — Node.js + SQLite + cron jobs


⸻

4. User Stories

Readers
	•	Compare the same story across left/center/right outlets.
	•	Understand the factual baseline and how outlets diverge.
	•	Visualize bias over time (timelines, charts).

Researchers
	•	Export clusters with bias distribution.
	•	Run NLP on archived text in research mode.

Developers
	•	Add new sources via JSON config or plugins.
	•	Enable scraping/paywall bypass selectively.
	•	Extend clustering/bias algorithms without breaking core.

⸻

5. Functional Requirements

5.1 Ingestion
	•	Poll RSS feeds via rss-parser.
	•	API fetch (Guardian, NPR JSON).
	•	Scraper plugins (Cheerio, Mercury parser, Puppeteer for paywalls).

5.2 Classification
	•	Source-level bias (AllSides, Ad Fontes maps).
	•	NLP overrides (sentiment/entity stance).
	•	Bias represented as categorical (Left/Center/Right) + numerical spectrum (-1 to +1).

5.3 Fact Core
	•	Extract entities/events with transformers.js NER.
	•	Consensus summary generated from overlapping entities + LLM summarization.
	•	Display “fact box” alongside articles.

5.4 Clustering
	•	Stage 1: Keyword/title overlap.
	•	Stage 2: Embedding similarity (transformers.js MiniLM).
	•	Store clusters with confidence score.

5.5 Presentation
	•	Side-by-side coverage view.
	•	Bias breakdown charts (percentages).
	•	Timelines of framing over time.
	•	Cluster overview pages.

5.6 Modes
	•	Safe Mode: Store metadata only (title, URL, excerpt).
	•	Research Mode: Store full article text for NLP/exports (opt-in).

⸻

6. Non-Functional Requirements
	•	Deployability: One-line Docker, or Node+SQLite on Raspberry Pi.
	•	Scalability: SQLite → Postgres migration path.
	•	Extensibility: Plugin system for scrapers, bias classifiers, clustering.
	•	Accessibility: Responsive React frontend.
	•	Security: Clear separation of safe/research mode to avoid accidental copyright issues.

⸻

7. Architecture

7.1 Component Diagram

flowchart LR
  subgraph Ingestion["Ingestion (scheduled/workers)"]
    RSS[rss-parser] --> Q{Queue}
    Manual[Manual URL submit] --> Q
    Cron[node-cron] --> RSS
  end

  subgraph FetchParse["Fetch & Parse"]
    Q --> Fetch[fetch (native)]
    Fetch --> Reader[@postlight/mercury-parser<br/>cheerio fallback]
    Reader --> Norm[Normalize: title, author, date, URL, text]
  end

  subgraph BiasLayer["Bias & Enrichment"]
    SourceMap[Source bias map]
    Norm --> BiasSrc[Source bias label]
    Norm --> NLP[Sentiment/stance NLP]
    NLP --> BiasSrc
    Norm --> Embed[Embeddings<br/>transformers.js]
    Embed --> Cluster[Keyword+Embedding Clustering]
    Norm --> Facts[Consensus fact core<br/>NER + LLM]
  end

  subgraph Storage["Storage"]
    DB[(SQLite/Postgres)]
    BiasSrc --> DB
    Cluster --> DB
    Norm --> DB
    Facts --> DB
  end

  subgraph API["API"]
    REST[Fastify/Express REST]
    Realtime[Socket.IO]
  end

  subgraph UI["Frontend"]
    Compare[Side-by-side view]
    Viz[Charts/timelines]
    Research[Export: CSV/JSON]
  end

  Ingestion --> FetchParse --> BiasLayer --> Storage
  Storage <--> API
  API --> UI

7.2 Sequence Flow

sequenceDiagram
  autonumber
  participant CRON as node-cron
  participant RSS as rss-parser
  participant FETCH as fetch
  participant PARSER as mercury-parser/cheerio
  participant NLP as transformers.js
  participant DB as SQLite
  participant API as Fastify
  participant UI as React

  CRON->>RSS: poll feeds
  RSS->>FETCH: fetch article URLs
  FETCH->>PARSER: parse HTML → clean text
  PARSER->>NLP: embeddings + bias override
  NLP->>DB: store article + bias + cluster ID
  DB-->>API: provide cluster/article data
  API-->>UI: render comparison + charts


⸻

8. Source Map

JSON Schema

{
  "name": "CNN",
  "url": "https://cnn.com",
  "api": false,
  "rss": "https://rss.cnn.com/rss/cnn_topstories.rss",
  "scraping": false,
  "bias": "left",
  "notes": "RSS feed, truncates content"
}

Sample Seed Sources

(abridged from our table)
	•	Left: CNN, Guardian, MSNBC, HuffPost.
	•	Center: AP, Reuters, NPR, USA Today, BBC.
	•	Right: Fox News, Washington Times, New York Post, Breitbart, OANN (scraper), Newsmax (scraper).

⸻

9. Libraries & Stack
	•	Ingestion: rss-parser, node-fetch
	•	Scraping: cheerio, @postlight/mercury-parser, puppeteer (plugins)
	•	NLP: @xenova/transformers, natural
	•	Clustering: ml-kmeans, ml-distance
	•	DB: better-sqlite3 (SQLite), pg (Postgres option)
	•	API: fastify or express
	•	Frontend: React + D3/ECharts
	•	Jobs: node-cron

⸻

10. Plugin Architecture (Scrapers)
	•	Core system = RSS/API ingestion only.
	•	Scrapers live in /plugins/scrapers/{source}.mjs.
	•	Users enable by editing sources.json → "scraping": true.
	•	Example plugin signature:

export const scrape = async (url) => {
  // fetch + cheerio/puppeteer parse
  return {
    title,
    text,
    author,
    publishedAt,
    images
  };
};


⸻

11. Roadmap

Phase 1 (MVP)
	•	RSS ingestion
	•	Source-level bias labels
	•	Keyword clustering
	•	Side-by-side UI (Left/Center/Right)
	•	Safe mode (metadata only)

Phase 2
	•	Scraper plugins (OANN, Newsmax, others)
	•	NLP overrides for article bias
	•	Consensus fact core
	•	Visualization: bias charts, timelines
	•	Researcher mode (full text + exports)

Phase 3
	•	Advanced embeddings-based clustering
	•	Search integration (Meilisearch/Typesense)
	•	Community plugin system (custom sources, classifiers)
	•	Cloud-ready scaling

⸻

12. Success Metrics
	•	MVP: 1 topic, 3+ biases shown side by side.
	•	Adoption: GitHub stars, self-host installs.
	•	Coverage: % of major news events clustered across >3 biases.
	•	Research: # of exports/downloads.