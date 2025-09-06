# LLM Features Testing Guide

## Prerequisites

### 1. Install Ollama (Recommended for Local Testing)
```bash
# macOS
brew install ollama

# Start Ollama service
ollama serve

# Pull a model (choose one)
ollama pull llama3.2:latest
ollama pull mistral:latest
ollama pull gemma3:latest
```

### 2. Alternative: Use OpenAI API
```bash
# Add to .env file
OPENAI_API_KEY=your-api-key-here
LLM_ADAPTER=openai
```

## Testing Steps

### Step 1: Verify LLM Connection
```bash
# Check which adapters are available
npm run llm status

# Test all configured adapters
npm run llm test
```

### Step 2: Test Bias Detection

```bash
# Analyze bias of a specific article
npm run llm bias 1

# Analyze recent articles from all sources
npm run llm analyze
```

### Step 3: Test Fact Extraction

```bash
# Extract facts from an article
npm run llm facts 1

# Try with different articles
npm run llm facts 10
npm run llm facts 50
```

### Step 4: Test Consensus Finding

```bash
# Find consensus facts in a news cluster
npm run llm consensus 1

# Try with other clusters
npm run llm consensus 2
npm run llm consensus 3
```

## Quick Test Script

Create a test script to run all features:

```bash
#!/bin/bash
echo "🧪 Testing LLM Features"

echo "\n1. Checking Status..."
npm run llm status

echo "\n2. Testing Adapters..."
npm run llm test

echo "\n3. Testing Bias Detection..."
npm run llm bias 1

echo "\n4. Testing Fact Extraction..."
npm run llm facts 1

echo "\n5. Testing Consensus Finding..."
npm run llm consensus 1

echo "\n✅ Testing Complete!"
```

## Expected Results

### Bias Detection Output
```
Basic NLP Analysis:
  Bias: left (-0.70)
  Sentiment: 0.15

LLM Analysis:
  Bias Score: -0.65
  Confidence: 75%
  Reasoning: Article uses emotional language...
  Indicators: [selective quotes, missing context]

Combined Analysis:
  Bias: left (-0.66)
  Confidence: 82%
```

### Fact Extraction Output
```
Extracted Facts:
1. Company settled for $787.5 million
   Type: statistic
   Confidence: 90%
   
2. "The claims were false" - Fox statement
   Type: quote
   Confidence: 95%

Extracted Entities:
  people: [Rudy Giuliani, Sidney Powell]
  organizations: [Fox News, Dominion]
  dates: [April 18, 2023]
```

### Consensus Finding Output
```
Consensus Facts (across sources):
  1. Settlement amount was $787.5 million
  2. Fox acknowledged false statements

Disputed Points:
  1. Extent of responsibility
  2. Impact on future coverage

Unique Angles by Bias:
  left: [democracy concerns, accountability]
  center: [legal precedent, settlement details]
  right: [business decision, moving forward]
```

## Troubleshooting

### If Ollama isn't working:
1. Check if Ollama is running: `curl http://localhost:11434/api/tags`
2. Check available models: `ollama list`
3. Pull a model if needed: `ollama pull llama3.2:latest`

### If no LLM is available:
- The system will fallback to basic NLP analysis
- You'll see "Method: basic_extraction" in outputs
- Results will have lower confidence scores

### To switch adapters:
```bash
# Edit .env file
LLM_ADAPTER=openai  # or anthropic, gemini, lmstudio
# Then restart the test
```

## Performance Tips

1. **Use local models (Ollama/LM Studio) for:**
   - Privacy-sensitive analysis
   - High-volume processing
   - No API costs

2. **Use cloud models (OpenAI/Anthropic) for:**
   - Higher accuracy
   - Better reasoning
   - Complex consensus finding

3. **Optimize for speed:**
   - The system caches results automatically
   - Batch analyze multiple articles: `npm run llm analyze`

## API Endpoints (Coming Soon)

Once integrated, you can also test via API:

```bash
# Analyze bias via API
curl http://localhost:3001/api/articles/1/bias

# Extract facts via API
curl http://localhost:3001/api/articles/1/facts

# Get consensus for cluster
curl http://localhost:3001/api/clusters/1/consensus
```