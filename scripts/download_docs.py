#!/usr/bin/env python3
"""
Download official Kenosha Transit documents.
"""

import requests
from pathlib import Path
from bs4 import BeautifulSoup
import re

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

SOURCES = {
    "schedule_page": "https://www.kenosha.org/departments/transit/published_bus_schedules.php",
    "route_map": "https://www.kenosha.org/English%20Bus%20Routes.pdf",
    "fares_page": "https://www.kenoshatransit.com/fares",
    "transit_home": "https://www.kenosha.org/departments/transit/",
}

def download_file(url, output_path, is_pdf=False):
    """Download a file from URL."""
    print(f"Downloading: {url}")
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        mode = 'wb' if is_pdf else 'w'
        encoding = None if is_pdf else 'utf-8'
        
        with open(output_path, mode, encoding=encoding) as f:
            f.write(response.content if is_pdf else response.text)
        
        size = len(response.content) if is_pdf else len(response.text)
        print(f"  ✓ Saved {size:,} bytes to {output_path}")
        return True
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def extract_pdf_links(html_content, base_url):
    """Extract PDF links from HTML."""
    soup = BeautifulSoup(html_content, 'html.parser')
    pdf_links = []
    
    # Find all links
    for link in soup.find_all('a', href=True):
        href = link.get('href', '')
        if '.pdf' in href.lower():
            # Make absolute URL
            if href.startswith('http'):
                full_url = href
            elif href.startswith('/'):
                full_url = f"https://www.kenosha.org{href}"
            else:
                full_url = f"{base_url}{href}"
            
            pdf_links.append({
                "url": full_url,
                "text": link.get_text().strip(),
                "href": href
            })
    
    return pdf_links

def main():
    """Download all documents."""
    print("=" * 60)
    print("Downloading Kenosha Transit Documents")
    print("=" * 60)
    
    # Download schedule page
    schedule_page_path = DATA_DIR / "schedule_page.html"
    if download_file(SOURCES["schedule_page"], schedule_page_path):
        # Extract PDF links
        with open(schedule_page_path, 'r', encoding='utf-8') as f:
            html = f.read()
            pdf_links = extract_pdf_links(html, SOURCES["schedule_page"])
            
            if pdf_links:
                print(f"\nFound {len(pdf_links)} PDF link(s) on schedule page:")
                for link in pdf_links:
                    print(f"  - {link['text']}: {link['url']}")
                    
                    # Download 2025 PDF if found
                    if '2025' in link['text'] or '2025' in link['url']:
                        pdf_path = DATA_DIR / "schedule_2025.pdf"
                        download_file(link['url'], pdf_path, is_pdf=True)
    
    # Download route map PDF
    route_map_path = DATA_DIR / "route_map.pdf"
    download_file(SOURCES["route_map"], route_map_path, is_pdf=True)
    
    # Download fares page
    fares_page_path = DATA_DIR / "fares_page.html"
    download_file(SOURCES["fares_page"], fares_page_path)
    
    # Download transit home page (might have additional links)
    transit_home_path = DATA_DIR / "transit_home.html"
    download_file(SOURCES["transit_home"], transit_home_path)
    
    print("\n" + "=" * 60)
    print("Download complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
