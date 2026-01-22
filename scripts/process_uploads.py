#!/usr/bin/env python3
"""
Process manually uploaded files and extract knowledge.
Run this after uploading files to uploads/ directory.
"""

import json
import shutil
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

# Expected upload locations
UPLOAD_PATHS = {
    "schedule": UPLOADS_DIR / "schedules",
    "map": UPLOADS_DIR / "maps",
    "gtfs": UPLOADS_DIR / "gtfs",
    "api": UPLOADS_DIR / "api",
}

def ensure_directories():
    """Create upload directories if they don't exist."""
    for path in UPLOAD_PATHS.values():
        path.mkdir(parents=True, exist_ok=True)
    
    # Create .gitkeep files so directories are tracked
    for path in UPLOAD_PATHS.values():
        (path / ".gitkeep").touch(exist_ok=True)

def find_uploaded_files():
    """Find all files in upload directories."""
    files = {
        "schedules": list(UPLOAD_PATHS["schedule"].glob("*.pdf")),
        "maps": list(UPLOAD_PATHS["map"].glob("*.pdf")),
        "gtfs": list(UPLOAD_PATHS["gtfs"].glob("*.zip")),
        "api_config": list(UPLOAD_PATHS["api"].glob("*.json")),
    }
    return files

def process_schedule_pdf(pdf_path):
    """Process schedule PDF."""
    print(f"Processing schedule: {pdf_path.name}")
    # Copy to data directory
    dest = DATA_DIR / f"schedule_{pdf_path.stem}.pdf"
    shutil.copy2(pdf_path, dest)
    print(f"  → Copied to {dest}")
    
    # TODO: Extract route/stop data from PDF
    return {
        "file": str(dest),
        "processed": False,  # Set to True when PDF parsing is implemented
        "note": "PDF ready for parsing"
    }

def process_route_map(pdf_path):
    """Process route map PDF."""
    print(f"Processing route map: {pdf_path.name}")
    dest = DATA_DIR / f"route_map_{pdf_path.stem}.pdf"
    shutil.copy2(pdf_path, dest)
    print(f"  → Copied to {dest}")
    return {"file": str(dest), "processed": False}

def process_gtfs_zip(zip_path):
    """Process GTFS ZIP file."""
    print(f"Processing GTFS: {zip_path.name}")
    dest = DATA_DIR / "gtfs_static.zip"
    shutil.copy2(zip_path, dest)
    print(f"  → Copied to {dest}")
    
    # TODO: Extract and parse GTFS files
    return {
        "file": str(dest),
        "processed": False,
        "note": "GTFS ready for extraction"
    }

def process_api_config(json_path):
    """Process API configuration."""
    print(f"Processing API config: {json_path.name}")
    with open(json_path, 'r') as f:
        config = json.load(f)
    
    # Update knowledge base with API info
    kb_path = DOCS_DIR / "knowledge_base.json"
    if kb_path.exists():
        with open(kb_path, 'r') as f:
            kb = json.load(f)
    else:
        kb = {}
    
    if "api" not in kb:
        kb["api"] = {}
    
    kb["api"].update(config)
    kb["api"]["config_source"] = str(json_path)
    kb["api"]["last_updated"] = datetime.now().isoformat()
    
    with open(kb_path, 'w') as f:
        json.dump(kb, f, indent=2)
    
    print(f"  → Updated knowledge base")
    return {"updated": True}

def main():
    """Process all uploaded files."""
    print("=" * 60)
    print("Processing Uploaded Files")
    print("=" * 60)
    
    ensure_directories()
    files = find_uploaded_files()
    
    results = {
        "schedules": [],
        "maps": [],
        "gtfs": [],
        "api": [],
    }
    
    # Process schedules
    for pdf in files["schedules"]:
        results["schedules"].append(process_schedule_pdf(pdf))
    
    # Process maps
    for pdf in files["maps"]:
        results["maps"].append(process_route_map(pdf))
    
    # Process GTFS
    for zip_file in files["gtfs"]:
        results["gtfs"].append(process_gtfs_zip(zip_file))
    
    # Process API config
    for json_file in files["api_config"]:
        results["api"].append(process_api_config(json_file))
    
    # Save processing report
    report = {
        "processed_at": datetime.now().isoformat(),
        "results": results,
        "summary": {
            "schedules": len(results["schedules"]),
            "maps": len(results["maps"]),
            "gtfs": len(results["gtfs"]),
            "api_configs": len(results["api"]),
        }
    }
    
    report_path = DATA_DIR / "processing_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print("\n" + "=" * 60)
    print("Processing Complete!")
    print("=" * 60)
    print(f"Schedules: {len(results['schedules'])}")
    print(f"Maps: {len(results['maps'])}")
    print(f"GTFS: {len(results['gtfs'])}")
    print(f"API Configs: {len(results['api'])}")
    print(f"\nReport saved to: {report_path}")

if __name__ == "__main__":
    main()
