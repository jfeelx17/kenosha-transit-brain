#!/usr/bin/env python3
"""
Simple CLI for querying Kenosha Transit Brain.
Usage: python query/cli.py "your question"
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from query.query_brain import KenoshaTransitBrain

def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python query/cli.py 'your question'")
        print("\nExamples:")
        print("  python query/cli.py 'What are the fares?'")
        print("  python query/cli.py 'What API does Kenosha Transit use?'")
        sys.exit(1)
    
    question = ' '.join(sys.argv[1:])
    brain = KenoshaTransitBrain()
    
    result = brain.query(question)
    
    print(f"Q: {result['question']}")
    print(f"A: {result['answer']}")
    
    if result.get('details'):
        import json
        print(f"\nDetails:\n{json.dumps(result['details'], indent=2)}")

if __name__ == "__main__":
    main()
