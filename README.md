# 📰 Open News

An open-source news aggregator that compares how stories are reported across the political spectrum. Compare coverage from left, center, and right-leaning sources side-by-side to understand different perspectives on the same events.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## 🎯 Features

- **📊 Bias Comparison** - View how the same story is covered by left, center, and right sources
- **🔗 Smart Clustering** - Automatically groups related articles across different sources
- **📈 Bias Distribution** - Visualize the political spectrum coverage of any topic
- **🔍 Fact Extraction** - Identifies consensus facts across different perspectives
- **🌐 15+ News Sources** - Pre-configured sources from CNN to Fox News
- **⚡ Real-time Updates** - Automated RSS ingestion every 15 minutes
- **🔒 Privacy Modes** - Safe mode (metadata only) or Research mode (full text)
- **🐳 Docker Ready** - Easy deployment with Docker Compose

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- SQLite3

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/open-news.git
cd open-news

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Initialize database
npm run migrate
node src/utils/seed-sources.js

# Start the application
npm start                     # Terminal 1: API server
cd frontend && npm run dev    # Terminal 2: Frontend
```

Visit **http://localhost:3000** to see the application.

## 🐳 Docker Deployment

```bash
# Using Docker Compose (recommended)
docker-compose up --build

# Or using Docker directly
docker build -t open-news .
docker run -p 3000:3000 -p 3001:3001 open-news
```

## 📖 Usage

### Manual Article Ingestion

```bash
# Fetch articles from all sources
npm run ingest

# Run clustering on fetched articles
npm run cluster
```

### Automated Ingestion

The system automatically fetches new articles every 15 minutes and clusters them every 30 minutes. Configure intervals in `.env`:

```env
INGEST_INTERVAL=*/15 * * * *
CLUSTER_INTERVAL=*/30 * * * *
```

## 🏗️ Architecture

```
open-news/
├── src/                 # Backend source code
│   ├── api/            # REST API endpoints
│   ├── db/             # Database models & migrations
│   ├── ingestion/      # RSS feed processing
│   ├── clustering/     # Article clustering algorithms
│   ├── bias/           # Bias classification
│   └── jobs/           # Scheduled tasks
├── frontend/           # React frontend
│   └── src/
│       ├── pages/      # UI pages
│       └── services/   # API client
├── config/             # Configuration files
│   └── sources.json    # News source definitions
└── plugins/            # Extensible scraper plugins
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3000
API_PORT=3001
DB_PATH=./data/news.db
CONTENT_MODE=safe              # 'safe' or 'research'
MAX_ARTICLE_LENGTH=10000
MIN_CLUSTER_SIZE=2
SIMILARITY_THRESHOLD=0.7
```

### Adding News Sources

Edit `config/sources.json`:

```json
{
  "name": "News Source",
  "url": "https://example.com",
  "rss_url": "https://example.com/rss",
  "bias": "center",
  "bias_score": 0,
  "scraping_enabled": false,
  "notes": "Description"
}
```

## 📊 Pre-configured Sources

| Left | Center-Left | Center | Center-Right | Right |
|------|------------|--------|--------------|-------|
| CNN | NPR | AP | WSJ | Fox News |
| Guardian | | Reuters | | Washington Times |
| MSNBC | | BBC | | NY Post |
| HuffPost | | USA Today | | Breitbart |

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/clusters` | List news clusters |
| GET | `/api/clusters/:id` | Get cluster details |
| GET | `/api/clusters/:id/compare` | Side-by-side comparison |
| GET | `/api/articles` | List all articles |
| GET | `/api/sources` | List all sources |
| POST | `/api/ingest` | Trigger manual ingestion |

## 🛠️ Development

### Running Tests

```bash
npm test
```

### Building for Production

```bash
# Build frontend
cd frontend && npm run build

# Start production server
NODE_ENV=production npm start
```

### Creating Scraper Plugins

Create a plugin in `plugins/scrapers/{domain}.mjs`:

```javascript
export const scrape = async (url) => {
  // Custom scraping logic
  return {
    title,
    text,
    author,
    publishedAt
  };
};
```

## 📈 Roadmap

- [x] MVP - RSS ingestion with side-by-side comparison
- [x] Keyword-based clustering
- [x] Source-level bias classification
- [ ] Advanced NLP bias detection
- [ ] LLM-powered fact extraction
- [ ] User accounts and personalization
- [ ] Mobile app
- [ ] Browser extension

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Ground News](https://ground.news)
- Built with [Fastify](https://www.fastify.io/), [React](https://reactjs.org/), and [SQLite](https://www.sqlite.org/)
- RSS parsing by [rss-parser](https://github.com/rbren/rss-parser)
- NLP powered by [@xenova/transformers](https://github.com/xenova/transformers.js)

## ⚠️ Disclaimer

This tool aggregates publicly available RSS feeds and respects robots.txt. Always comply with the terms of service of the news sources you're accessing. The "research mode" should only be used in accordance with fair use principles and applicable copyright laws.

## 📞 Support

- Create an [Issue](https://github.com/yourusername/open-news/issues) for bug reports
- Start a [Discussion](https://github.com/yourusername/open-news/discussions) for feature requests
- Check [SETUP.md](SETUP.md) for detailed setup instructions

---

**Open News** - Understanding news from every angle 🌍