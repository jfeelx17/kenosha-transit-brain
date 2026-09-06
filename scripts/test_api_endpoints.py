#!/usr/bin/env python3
"""
Test various Syncromatics API endpoint patterns to find working URLs.
"""

import requests
from pathlib import Path

# Say who we are rather than impersonating a browser. The transit site's proxy accepts this
# (tested 2026-09-06); if a host ever rejects it, that failure is visible here immediately
# because these scripts are run by hand.
USER_AGENT = "KenoshaLoop/0.5 (personal, 1 user; https://github.com/jfeelx17/kenosha-transit-brain)"

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Common endpoint patterns to test
ENDPOINTS = [
    "https://gtfs-directory.syncromatics.com/",
    "https://gtfs-directory.syncromatics.com/kenosha",
    "https://gtfs-directory.syncromatics.com/kenosha/vehiclepositions.pb",
    "https://api.syncromatics.com/v1/agencies/kenosha/gtfs-rt/vehiclepositions",
    "https://kenosha.gtfs.syncromatics.com/gtfs-rt/vehiclepositions.pb",
    "https://gtfs.syncromatics.com/kenosha/vehiclepositions.pb",
    "https://www.kenosha.org/departments/transit/gtfs.zip",
    "https://www.kenosha.org/gtfs/kenosha.zip",
    "https://transit.kenosha.org/gtfs.zip",
]

def test_endpoint(url):
    """Test an endpoint and return results."""
    print(f"\nTesting: {url}")
    try:
        headers = {
            'User-Agent': USER_AGENT
        }
        
        # Try GET request
        response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        
        result = {
            "url": url,
            "status_code": response.status_code,
            "content_type": response.headers.get('Content-Type', 'unknown'),
            "content_length": len(response.content),
            "success": response.status_code == 200,
            "is_binary": False,
            "redirected": len(response.history) > 0,
            "final_url": response.url if response.url != url else None
        }
        
        # Check if it's a binary file (GTFS-RT .pb files)
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '').lower()
            if 'protobuf' in content_type or 'application/x-protobuf' in content_type or \
               url.endswith('.pb') or url.endswith('.zip'):
                result["is_binary"] = True
                # Save binary files
                if url.endswith('.pb'):
                    filename = DATA_DIR / f"vehiclepositions_{url.split('/')[-2] if '/' in url else 'test'}.pb"
                    with open(filename, 'wb') as f:
                        f.write(response.content)
                    result["saved_to"] = str(filename)
                elif url.endswith('.zip'):
                    filename = DATA_DIR / "gtfs_static.zip"
                    with open(filename, 'wb') as f:
                        f.write(response.content)
                    result["saved_to"] = str(filename)
            else:
                # Save HTML/text responses for inspection
                if 'html' in content_type or 'text' in content_type:
                    filename = DATA_DIR / f"response_{url.split('/')[-1].replace('?', '_').replace('=', '_')[:50]}.html"
                    with open(filename, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    result["saved_to"] = str(filename)
                    result["preview"] = response.text[:500]
        
        return result
        
    except requests.exceptions.Timeout:
        return {"url": url, "error": "Timeout"}
    except requests.exceptions.ConnectionError:
        return {"url": url, "error": "Connection error"}
    except Exception as e:
        return {"url": url, "error": str(e)}

def main():
    """Test all endpoints."""
    print("=" * 60)
    print("Testing Syncromatics API Endpoints")
    print("=" * 60)
    
    results = []
    for endpoint in ENDPOINTS:
        result = test_endpoint(endpoint)
        results.append(result)
        
        if result.get("success"):
            print(f"  ✓ SUCCESS - Status: {result['status_code']}, Type: {result['content_type']}")
            if result.get("saved_to"):
                print(f"    Saved to: {result['saved_to']}")
        elif result.get("error"):
            print(f"  ✗ ERROR - {result['error']}")
        else:
            print(f"  ✗ FAILED - Status: {result['status_code']}")
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    successful = [r for r in results if r.get("success")]
    if successful:
        print(f"\n✓ {len(successful)} successful endpoint(s):")
        for r in successful:
            print(f"  - {r['url']}")
            if r.get("is_binary"):
                print(f"    → Binary file (GTFS-RT or GTFS static)")
            if r.get("saved_to"):
                print(f"    → Saved to: {r['saved_to']}")
    else:
        print("\n✗ No endpoints returned 200 OK")
    
    # Save results to JSON
    import json
    results_file = DATA_DIR / "api_test_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Results saved to: {results_file}")
    
    return results

if __name__ == "__main__":
    main()
