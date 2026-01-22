#!/usr/bin/env python3
"""
Extract structured knowledge from fetched data sources.
"""

import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"
DOCS_DIR.mkdir(exist_ok=True)

def extract_fares(html_path):
    """Extract fare information from fares page."""
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    fares = {
        "adult": "$2.00",
        "student": "$1.50",
        "details": {}
    }
    
    # Try to extract additional fare details
    text = soup.get_text()
    
    # Look for fare patterns
    fare_patterns = [
        r'(\$[\d.]+)',
        r'(\d+\.\d{2})',
    ]
    
    # Extract any additional context
    fare_sections = soup.find_all(['div', 'section', 'p'], class_=re.compile(r'fare|price|cost', re.I))
    for section in fare_sections:
        section_text = section.get_text()
        if '$' in section_text or 'fare' in section_text.lower():
            fares["details"][section.get('class', ['unknown'])[0]] = section_text.strip()
    
    return fares

def extract_schedule_info(html_path):
    """Extract schedule page information."""
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    info = {
        "title": "",
        "pdf_links": [],
        "description": ""
    }
    
    # Extract title
    title_tag = soup.find('title') or soup.find('h1')
    if title_tag:
        info["title"] = title_tag.get_text().strip()
    
    # Find all PDF links
    for link in soup.find_all('a', href=re.compile(r'\.pdf', re.I)):
        href = link.get('href', '')
        if href:
            if not href.startswith('http'):
                href = f"https://www.kenosha.org{href}" if href.startswith('/') else f"https://www.kenosha.org/departments/transit/{href}"
            info["pdf_links"].append({
                "url": href,
                "text": link.get_text().strip()
            })
    
    # Extract description
    main_content = soup.find('main') or soup.find('div', class_=re.compile(r'content|main', re.I))
    if main_content:
        info["description"] = main_content.get_text()[:500].strip()
    
    return info

def extract_gtfs_info(html_path):
    """Extract GTFS directory information."""
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    info = {
        "vendor": "GMV Syncromatics",
        "feeds": [],
        "api_info": {}
    }
    
    # Look for Kenosha-specific information
    text = soup.get_text()
    if 'kenosha' in text.lower():
        info["has_kenosha"] = True
    
    # Extract any API endpoints or feed information
    for link in soup.find_all('a', href=True):
        href = link.get('href', '')
        if 'kenosha' in href.lower() or 'gtfs' in href.lower():
            info["feeds"].append({
                "url": href,
                "text": link.get_text().strip()
            })
    
    return info

def create_knowledge_base():
    """Create the main knowledge base JSON file."""
    knowledge = {
        "metadata": {
            "name": "Kenosha Transit Brain",
            "version": "1.0",
            "last_updated": "",
            "sources": {
                "schedule_page": "https://www.kenosha.org/departments/transit/published_bus_schedules.php",
                "route_map": "https://www.kenosha.org/English%20Bus%20Routes.pdf",
                "fares": "https://www.kenoshatransit.com/fares",
                "gtfs_directory": "https://gtfs-directory.syncromatics.com/"
            }
        },
        "fares": {},
        "schedules": {},
        "routes": {},
        "api": {
            "vendor": "GMV Syncromatics",
            "type": "GTFS-RT",
            "directory": "https://gtfs-directory.syncromatics.com/"
        },
        "rules": []
    }
    
    # Extract fares
    fares_path = DATA_DIR / "fares_page.html"
    if fares_path.exists():
        knowledge["fares"] = extract_fares(fares_path)
    
    # Extract schedule info
    schedule_path = DATA_DIR / "schedule_page.html"
    if schedule_path.exists():
        knowledge["schedules"] = extract_schedule_info(schedule_path)
    
    # Extract GTFS info
    gtfs_path = DATA_DIR / "gtfs_directory.html"
    if gtfs_path.exists():
        gtfs_info = extract_gtfs_info(gtfs_path)
        knowledge["api"].update(gtfs_info)
    
    # Save knowledge base
    output_path = DOCS_DIR / "knowledge_base.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(knowledge, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Knowledge base created: {output_path}")
    return knowledge

def create_text_summary(knowledge):
    """Create a human-readable text summary."""
    summary = f"""# Kenosha Transit Brain - Knowledge Summary

## Fares
- Adult: {knowledge['fares'].get('adult', 'N/A')}
- Student: {knowledge['fares'].get('student', 'N/A')}

## API Information
- Vendor: {knowledge['api'].get('vendor', 'N/A')}
- Type: {knowledge['api'].get('type', 'N/A')}
- Directory: {knowledge['api'].get('directory', 'N/A')}

## Schedule Information
- Title: {knowledge['schedules'].get('title', 'N/A')}
- PDF Links Found: {len(knowledge['schedules'].get('pdf_links', []))}

## Data Sources
- Schedule Page: {knowledge['metadata']['sources']['schedule_page']}
- Route Map: {knowledge['metadata']['sources']['route_map']}
- Fares: {knowledge['metadata']['sources']['fares']}
- GTFS Directory: {knowledge['metadata']['sources']['gtfs_directory']}
"""
    
    output_path = DOCS_DIR / "summary.txt"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(summary)
    
    print(f"✓ Summary created: {output_path}")

def main():
    """Extract knowledge from all sources."""
    print("=" * 60)
    print("Kenosha Transit Brain - Knowledge Extractor")
    print("=" * 60)
    
    knowledge = create_knowledge_base()
    create_text_summary(knowledge)
    
    print("\n" + "=" * 60)
    print("Knowledge extraction complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
