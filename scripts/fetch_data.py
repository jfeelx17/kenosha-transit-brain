#!/usr/bin/env python3
"""
Fetch all Kenosha Transit data sources and save locally.
"""

import requests
import os
from pathlib import Path

# Say who we are rather than impersonating a browser. The transit site's proxy accepts this
# (tested 2026-09-06); if a host ever rejects it, that failure is visible here immediately
# because these scripts are run by hand.
USER_AGENT = "KenoshaLoop/0.5 (personal, 1 user; https://github.com/jfeelx17/kenosha-transit-brain)"

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

SOURCES = {
    "schedule_page": "https://www.kenosha.org/departments/transit/published_bus_schedules.php",
    "route_map": "https://www.kenosha.org/English%20Bus%20Routes.pdf",
    "fares_page": "https://www.kenoshatransit.com/fares",
    "gtfs_directory": "https://gtfs-directory.syncromatics.com/",
}

def fetch_url(url, output_path, is_pdf=False):
    """Fetch a URL and save to file."""
    print(f"Fetching {url}...")
    try:
        headers = {
            'User-Agent': USER_AGENT
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        mode = 'wb' if is_pdf else 'w'
        encoding = None if is_pdf else 'utf-8'
        
        with open(output_path, mode, encoding=encoding) as f:
            f.write(response.content if is_pdf else response.text)
        
        print(f"✓ Saved to {output_path}")
        return True
    except Exception as e:
        print(f"✗ Error fetching {url}: {e}")
        return False

def extract_pdf_link(html_content):
    """Extract PDF link from schedule page."""
    # Look for 2025 PDF link
    import re
    # Common patterns for PDF links
    patterns = [
        r'href=["\']([^"\']*2025[^"\']*\.pdf[^"\']*)["\']',
        r'href=["\']([^"\']*schedule[^"\']*\.pdf[^"\']*)["\']',
        r'href=["\']([^"\']*\.pdf[^"\']*)["\']',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, html_content, re.IGNORECASE)
        if matches:
            # Get full URL
            base_url = "https://www.kenosha.org"
            for match in matches:
                if match.startswith('http'):
                    return match
                elif match.startswith('/'):
                    return base_url + match
                else:
                    return f"{base_url}/departments/transit/{match}"
    
    return None

def main():
    """Fetch all data sources."""
    print("=" * 60)
    print("Kenosha Transit Brain - Data Fetcher")
    print("=" * 60)
    
    # Fetch schedule page to find PDF link
    schedule_page_path = DATA_DIR / "schedule_page.html"
    if fetch_url(SOURCES["schedule_page"], schedule_page_path):
        # Try to extract PDF link
        with open(schedule_page_path, 'r', encoding='utf-8') as f:
            html = f.read()
            pdf_link = extract_pdf_link(html)
            if pdf_link:
                print(f"Found PDF link: {pdf_link}")
                fetch_url(pdf_link, DATA_DIR / "schedule_2025.pdf", is_pdf=True)
    
    # Fetch route map PDF
    fetch_url(SOURCES["route_map"], DATA_DIR / "route_map.pdf", is_pdf=True)
    
    # Fetch fares page
    fetch_url(SOURCES["fares_page"], DATA_DIR / "fares_page.html")
    
    # Fetch GTFS directory
    fetch_url(SOURCES["gtfs_directory"], DATA_DIR / "gtfs_directory.html")
    
    print("\n" + "=" * 60)
    print("Data fetching complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
