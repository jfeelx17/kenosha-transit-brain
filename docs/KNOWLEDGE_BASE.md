# Kenosha Transit Brain - Knowledge Base Documentation

## Overview

The Kenosha Transit Brain is a comprehensive, queryable knowledge base that provides instant answers about Kenosha Transit without requiring Google searches.

## Core Information

### Fares
- **Adult**: $2.00
- **Student**: $1.50
- **Source**: https://www.kenoshatransit.com/fares
- **Payment**: Exact fare required

### Schedules
- **Year**: 2025
- **Source**: https://www.kenosha.org/departments/transit/published_bus_schedules.php
- **Format**: PDF (official schedule and rules)
- **Contains**: Route schedules, service rules, transfer information

### Routes
- **Map**: https://www.kenosha.org/English%20Bus%20Routes.pdf
- **Format**: PDF (visual route map)
- **Contains**: All bus routes, stops, and connections

### Real-Time API
- **Vendor**: GMV Syncromatics
- **Type**: GTFS-RT (General Transit Feed Specification - Real-Time)
- **Directory**: https://gtfs-directory.syncromatics.com/
- **Features**:
  - Vehicle positions (GPS tracking)
  - Trip updates (arrival predictions)
  - Service alerts
- **Notes**: This is the "key" to accessing the real-time API

## Data Sources

All information is sourced from official Kenosha Transit resources:

1. **Official Schedule & Rules (The "Bible")**
   - URL: https://www.kenosha.org/departments/transit/published_bus_schedules.php
   - Contains: 2025 PDF with official schedules and rules

2. **Bus Routes Map**
   - URL: https://www.kenosha.org/English%20Bus%20Routes.pdf
   - Contains: Visual map of all routes

3. **Fares Page**
   - URL: https://www.kenoshatransit.com/fares
   - Contains: Current fare information

4. **GTFS Directory**
   - URL: https://gtfs-directory.syncromatics.com/
   - Contains: Confirmation of GMV Syncromatics as vendor

## Query Examples

### Fares
- "What are the fares?"
- "How much does a student ticket cost?"
- "What is the adult fare?"

### Routes & Schedules
- "Where can I find route schedules?"
- "What routes are available?"
- "When does the bus run?"

### API & Real-Time Data
- "What API does Kenosha Transit use?"
- "How do I access real-time data?"
- "What is GTFS-RT?"

## Usage

### Command Line
```bash
python query/cli.py "What are the fares?"
```

### Python API
```python
from query.query_brain import KenoshaTransitBrain

brain = KenoshaTransitBrain()
result = brain.query("What are the fares?")
print(result['answer'])
```

### Interactive Mode
```bash
python query/query_brain.py
```

## Benefits

✅ **Instant Answers** - No need to search Google repeatedly
✅ **Structured Data** - Queryable JSON format
✅ **Programmatic Access** - Easy integration into apps
✅ **Always Current** - Links to official sources
✅ **Comprehensive** - All transit information in one place

## Extending the Knowledge Base

To add more information:

1. **Fetch new data**: `python scripts/fetch_data.py`
2. **Extract knowledge**: `python scripts/extract_knowledge.py`
3. **Update queries**: Edit `query/query_brain.py` to handle new question types

## File Structure

```
kenosha-transit-brain/
├── data/              # Raw downloaded files (PDFs, HTML)
├── docs/              # Processed knowledge base (JSON, MD)
├── scripts/           # Data fetching and processing
│   ├── fetch_data.py
│   ├── extract_knowledge.py
│   └── init_knowledge.py
└── query/             # Query interface
    ├── query_brain.py
    └── cli.py
```

## Next Steps

1. **Download PDFs**: Run `fetch_data.py` when network access is available
2. **Extract Route Data**: Parse PDFs to extract specific route information
3. **Add GTFS Parsing**: Convert schedule PDFs to GTFS format
4. **Real-Time Integration**: Connect to Syncromatics API for live data
