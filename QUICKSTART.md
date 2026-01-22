# Kenosha Transit Brain - Quick Start

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize knowledge base with known information
python scripts/init_knowledge.py
```

## Usage

### Query the Knowledge Base

```bash
# Interactive query interface
python query/query_brain.py
```

### Example Queries

- "What are the fares?"
- "How much does a student ticket cost?"
- "What API does Kenosha Transit use?"
- "Where can I find the route schedules?"
- "Tell me about real-time data"

### Programmatic Usage

```python
from query.query_brain import KenoshaTransitBrain

brain = KenoshaTransitBrain()
result = brain.query("What are the fares?")
print(result['answer'])

# Direct access
fares = brain.get_fares()
api_info = brain.get_api_info()
```

## Data Sources

The knowledge base includes:

1. **Fares**: Adult $2.00, Student $1.50
2. **Schedules**: 2025 PDF from official site
3. **Routes**: Route map PDF
4. **API**: GMV Syncromatics GTFS-RT

## Fetching Additional Data

To download the latest PDFs and web pages:

```bash
python scripts/fetch_data.py
python scripts/extract_knowledge.py
```

## Structure

- `data/` - Raw downloaded files (PDFs, HTML)
- `docs/` - Processed knowledge base (JSON)
- `scripts/` - Data fetching and processing
- `query/` - Query interface

## Benefits

✅ Instant answers without Google searches
✅ Structured, queryable data
✅ Programmatic access for apps
✅ Always up-to-date with source links
