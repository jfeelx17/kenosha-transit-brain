#!/usr/bin/env python3
"""
Initialize knowledge base with known information.
"""

import json
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent.parent
DOCS_DIR = BASE_DIR / "docs"
DOCS_DIR.mkdir(exist_ok=True)

def create_initial_knowledge_base():
    """Create initial knowledge base with known information."""
    knowledge = {
        "metadata": {
            "name": "Kenosha Transit Brain",
            "version": "1.0",
            "created": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "description": "Comprehensive queryable knowledge base for Kenosha Transit",
            "sources": {
                "schedule_page": "https://www.kenosha.org/departments/transit/published_bus_schedules.php",
                "route_map": "https://www.kenosha.org/English%20Bus%20Routes.pdf",
                "fares": "https://www.kenoshatransit.com/fares",
                "gtfs_directory": "https://gtfs-directory.syncromatics.com/"
            }
        },
        "fares": {
            "adult": "$2.00",
            "student": "$1.50",
            "currency": "USD",
            "source": "https://www.kenoshatransit.com/fares",
            "notes": "Standard single-ride fares"
        },
        "schedules": {
            "year": "2025",
            "source_page": "https://www.kenosha.org/departments/transit/published_bus_schedules.php",
            "pdf_available": True,
            "description": "Official 2025 bus schedules and service rules"
        },
        "routes": {
            "map_pdf": "https://www.kenosha.org/English%20Bus%20Routes.pdf",
            "description": "Visual route map showing all bus routes and stops"
        },
        "api": {
            "vendor": "GMV Syncromatics",
            "type": "GTFS-RT",
            "directory": "https://gtfs-directory.syncromatics.com/",
            "description": "Real-time transit data provider using GTFS-RT standard",
            "features": [
                "Vehicle positions (GPS)",
                "Trip updates (arrival predictions)",
                "Service alerts"
            ],
            "notes": "This is the 'key' to the API that was previously identified"
        },
        "rules": {
            "fare_payment": "Exact fare required",
            "transfers": "Check schedule PDF for transfer rules",
            "service_hours": "See schedule PDF for specific route times"
        },
        "quick_facts": {
            "adult_fare": "$2.00",
            "student_fare": "$1.50",
            "vendor": "GMV Syncromatics",
            "data_format": "GTFS-RT",
            "schedule_year": "2025"
        }
    }
    
    output_path = DOCS_DIR / "knowledge_base.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(knowledge, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Initial knowledge base created: {output_path}")
    return knowledge

if __name__ == "__main__":
    print("=" * 60)
    print("Initializing Kenosha Transit Brain")
    print("=" * 60)
    create_initial_knowledge_base()
    print("\n✓ Knowledge base ready!")
    print("\nNext steps:")
    print("  1. Run: python scripts/fetch_data.py (to download PDFs and pages)")
    print("  2. Run: python scripts/extract_knowledge.py (to extract more details)")
    print("  3. Run: python query/query_brain.py (to query the knowledge base)")
