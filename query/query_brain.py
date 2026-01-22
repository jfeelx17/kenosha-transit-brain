#!/usr/bin/env python3
"""
Query interface for Kenosha Transit Brain.
Instant answers without Google searches.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Any

BASE_DIR = Path(__file__).parent.parent
KNOWLEDGE_BASE = BASE_DIR / "docs" / "knowledge_base.json"

class KenoshaTransitBrain:
    """Queryable knowledge base for Kenosha Transit."""
    
    def __init__(self, knowledge_path=None):
        """Initialize the brain with knowledge base."""
        self.knowledge_path = knowledge_path or KNOWLEDGE_BASE
        self.knowledge = self._load_knowledge()
    
    def _load_knowledge(self) -> Dict:
        """Load knowledge base from JSON."""
        if not self.knowledge_path.exists():
            return {"error": "Knowledge base not found. Run extract_knowledge.py first."}
        
        with open(self.knowledge_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def query(self, question: str) -> Dict[str, Any]:
        """
        Query the knowledge base with a natural language question.
        Returns structured answer.
        """
        question_lower = question.lower()
        
        # API queries (check FIRST, before schedule queries, since "real-time" might match "time")
        if any(word in question_lower for word in ['api', 'real-time', 'realtime', 'syncromatics', 'gtfs', 'gmv']) or \
           ('real' in question_lower and 'time' in question_lower):
            return self._query_api(question)
        
        # Fare queries
        if any(word in question_lower for word in ['fare', 'price', 'cost', 'ticket', 'pay']):
            return self._query_fares(question)
        
        # Route queries
        if any(word in question_lower for word in ['route', 'bus', 'line', 'stop']):
            return self._query_routes(question)
        
        # Schedule queries (check last, since "time" is common)
        if any(word in question_lower for word in ['schedule', 'time', 'when', 'departure', 'arrival']):
            return self._query_schedules(question)
        
        # General info
        return self._query_general(question)
    
    def _query_fares(self, question: str) -> Dict:
        """Answer fare-related questions."""
        fares = self.knowledge.get('fares', {})
        
        answer = {
            "type": "fares",
            "question": question,
            "answer": "",
            "details": {}
        }
        
        if 'adult' in question.lower():
            answer["answer"] = f"Adult fare: {fares.get('adult', 'N/A')}"
            answer["details"]["adult"] = fares.get('adult')
        
        elif 'student' in question.lower():
            answer["answer"] = f"Student fare: {fares.get('student', 'N/A')}"
            answer["details"]["student"] = fares.get('student')
        
        else:
            answer["answer"] = f"Fares: Adult {fares.get('adult', 'N/A')}, Student {fares.get('student', 'N/A')}"
            answer["details"] = fares
        
        return answer
    
    def _query_routes(self, question: str) -> Dict:
        """Answer route-related questions."""
        return {
            "type": "routes",
            "question": question,
            "answer": "Route information is available in the route map PDF and schedule PDF. Check data/route_map.pdf and data/schedule_2025.pdf",
            "details": {
                "route_map": self.knowledge.get('metadata', {}).get('sources', {}).get('route_map'),
                "schedules": self.knowledge.get('metadata', {}).get('sources', {}).get('schedule_page')
            }
        }
    
    def _query_schedules(self, question: str) -> Dict:
        """Answer schedule-related questions."""
        schedules = self.knowledge.get('schedules', {})
        
        return {
            "type": "schedules",
            "question": question,
            "answer": f"Schedule information is available in the 2025 PDF. {schedules.get('title', '')}",
            "details": {
                "title": schedules.get('title'),
                "pdf_links": schedules.get('pdf_links', []),
                "source": self.knowledge.get('metadata', {}).get('sources', {}).get('schedule_page')
            }
        }
    
    def _query_api(self, question: str) -> Dict:
        """Answer API-related questions."""
        api = self.knowledge.get('api', {})
        
        answer_text = f"Kenosha Transit uses {api.get('vendor', 'N/A')} for real-time data via {api.get('type', 'N/A')}."
        
        # Add more details if available
        if api.get('description'):
            answer_text += f" {api.get('description')}"
        
        if api.get('features'):
            answer_text += f" Features include: {', '.join(api.get('features', []))}."
        
        return {
            "type": "api",
            "question": question,
            "answer": answer_text,
            "details": {
                "vendor": api.get('vendor'),
                "type": api.get('type'),
                "directory": api.get('directory'),
                "description": api.get('description'),
                "features": api.get('features', []),
                "notes": api.get('notes'),
                "feeds": api.get('feeds', [])
            }
        }
    
    def _query_general(self, question: str) -> Dict:
        """Answer general questions."""
        return {
            "type": "general",
            "question": question,
            "answer": "I can help with fares, routes, schedules, and API information. Try asking about specific topics.",
            "available_topics": ["fares", "routes", "schedules", "api", "real-time data"]
        }
    
    def get_fares(self) -> Dict:
        """Get all fare information."""
        return self.knowledge.get('fares', {})
    
    def get_api_info(self) -> Dict:
        """Get API information."""
        return self.knowledge.get('api', {})
    
    def get_sources(self) -> Dict:
        """Get all data sources."""
        return self.knowledge.get('metadata', {}).get('sources', {})

def main():
    """Interactive query interface."""
    brain = KenoshaTransitBrain()
    
    print("=" * 60)
    print("Kenosha Transit Brain - Query Interface")
    print("=" * 60)
    print("\nAsk questions about Kenosha Transit!")
    print("Examples:")
    print("  - What are the fares?")
    print("  - How much does a student ticket cost?")
    print("  - What API does Kenosha Transit use?")
    print("  - Where can I find route schedules?")
    print("\nType 'quit' to exit.\n")
    
    while True:
        try:
            question = input("Query: ").strip()
            if question.lower() in ['quit', 'exit', 'q']:
                break
            
            if not question:
                continue
            
            result = brain.query(question)
            print(f"\nAnswer: {result['answer']}")
            if result.get('details'):
                print(f"Details: {json.dumps(result['details'], indent=2)}")
            print()
        
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}\n")

if __name__ == "__main__":
    main()
