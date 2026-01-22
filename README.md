# Kenosha Transit Brain

A comprehensive, queryable knowledge base for Kenosha Transit that replaces hundreds of Google searches.

## Data Sources

1. **Official Schedule & Rules (2025 PDF)**
   - URL: https://www.kenosha.org/departments/transit/published_bus_schedules.php
   - Contains: Official bus schedules, routes, and service rules

2. **Bus Routes Map**
   - URL: https://www.kenosha.org/English%20Bus%20Routes.pdf
   - Contains: Visual route map and stop locations

3. **Fares**
   - URL: https://www.kenoshatransit.com/fares
   - Adult: $2.00
   - Student: $1.50

4. **Real-Time API (GMV Syncromatics)**
   - Vendor: GMV Syncromatics
   - Directory: https://gtfs-directory.syncromatics.com/
   - Provides: Real-time vehicle positions and trip updates

## Structure

- `uploads/` - **Manual file uploads** (place source files here)
  - `schedules/` - Schedule PDFs
  - `maps/` - Route map PDFs
  - `gtfs/` - GTFS ZIP files
  - `api/` - API configuration JSON
- `data/` - Processed data files (auto-generated)
- `docs/` - Extracted documentation and knowledge base
- `scripts/` - Data fetching and processing scripts
- `query/` - Query interface and search tools

## Quick Start

1. **Upload files**: Place PDFs/ZIPs in `uploads/` subdirectories
2. **Process**: Run `python scripts/process_uploads.py`
3. **Query**: Use `python query/cli.py "your question"`

## Usage

Query the knowledge base for instant answers about:
- Route schedules and stops
- Fares and pricing
- Real-time bus locations
- Service rules and policies
- Route maps and connections
