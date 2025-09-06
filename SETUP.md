# Open News Setup Guide

## Quick Start

### Prerequisites
- Node.js 20+ 
- npm or yarn
- SQLite3

### Installation

1. **Clone and install dependencies:**
```bash
# Install backend dependencies
npm install

# Install frontend dependencies  
cd frontend
npm install
cd ..
```

2. **Initialize database and seed sources:**
```bash
npm run migrate
node src/utils/seed-sources.js
```

3. **Start the application:**

In separate terminals:

```bash
# Terminal 1: Start API server
npm start

# Terminal 2: Start frontend dev server
cd frontend
npm run dev

# Terminal 3 (optional): Start ingestion worker
node src/jobs/ingest.js --daemon
```

The application will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:3001

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or build manually
docker build -t open-news .
docker run -p 3000:3000 -p 3001:3001 open-news
```

## Manual Ingestion

To manually trigger article ingestion:

```bash
# Ingest all sources once
npm run ingest

# Run clustering on ingested articles
npm run cluster
```

## Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3000
API_PORT=3001
DB_PATH=./data/news.db
CONTENT_MODE=safe          # 'safe' or 'research'
INGEST_INTERVAL=*/15 * * * *
CLUSTER_INTERVAL=*/30 * * * *
MAX_ARTICLE_LENGTH=10000
MIN_CLUSTER_SIZE=2
SIMILARITY_THRESHOLD=0.7
```

## Content Modes

- **Safe Mode** (default): Stores only metadata (title, URL, excerpt)
- **Research Mode**: Stores full article text for NLP analysis

To enable research mode:
```env
CONTENT_MODE=research
```

## Adding New Sources

Edit `config/sources.json` and add your source:

```json
{
  "name": "Source Name",
  "url": "https://example.com",
  "rss_url": "https://example.com/rss",
  "bias": "center",
  "bias_score": 0,
  "scraping_enabled": false,
  "notes": "Description"
}
```

Then re-run the seeding script:
```bash
node src/utils/seed-sources.js
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/stats` - Dashboard statistics
- `GET /api/clusters` - List news clusters
- `GET /api/clusters/:id` - Get cluster details
- `GET /api/clusters/:id/compare` - Side-by-side comparison
- `GET /api/articles` - List articles
- `GET /api/sources` - List sources
- `POST /api/ingest` - Trigger manual ingestion

## Troubleshooting

### Database Issues
```bash
# Reset database
rm data/news.db
npm run migrate
node src/utils/seed-sources.js
```

### Port Conflicts
Change ports in `.env`:
```env
PORT=3002
API_PORT=3003
```

### Build Issues
```bash
# Clean install
rm -rf node_modules package-lock.json
rm -rf frontend/node_modules frontend/package-lock.json
npm install
cd frontend && npm install
```

## Development

### Project Structure
```
open-news/
├── src/              # Backend source code
│   ├── api/         # REST API routes
│   ├── db/          # Database models & migrations
│   ├── ingestion/   # RSS/content extraction
│   ├── clustering/  # Article clustering
│   ├── bias/        # Bias classification
│   └── jobs/        # Scheduled tasks
├── frontend/        # React frontend
│   └── src/
│       ├── pages/   # Page components
│       └── services/ # API client
├── config/          # Configuration files
└── plugins/         # Scraper plugins
```

### Adding Scraper Plugins

Create a plugin in `plugins/scrapers/{domain}.mjs`:

```javascript
export const scrape = async (url) => {
  // Custom scraping logic
  return {
    title,
    text,
    author,
    publishedAt,
    images
  };
};
```

Enable in sources.json:
```json
{
  "scraping_enabled": true
}
```