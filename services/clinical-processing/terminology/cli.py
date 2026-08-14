import argparse
import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from loaders.excel_seed_loader import ExcelSeedLoader
from providers import SentenceTransformersProvider

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ehr_term:ehr_term_pass@localhost:5433/terminology")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def main():
    parser = argparse.ArgumentParser(description="Terminology Service CLI")
    subparsers = parser.add_subparsers(dest="command")

    # Ingest command
    ingest_parser = subparsers.add_parser("ingest", help="Ingest ontology seed data")
    ingest_parser.add_argument("--file", required=True, help="Path to excel seed data")
    ingest_parser.add_argument("--version", required=True, help="Release version string")

    # Search command
    search_parser = subparsers.add_parser("search", help="Search concepts")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--ontology", help="Filter by ontology")
    search_parser.add_argument("--mode", default="hybrid", choices=["lexical", "vector", "hybrid"])

    args = parser.parse_args()

    db = SessionLocal()
    embedding_provider = SentenceTransformersProvider()

    try:
        if args.command == "ingest":
            loader = ExcelSeedLoader(db, embedding_provider)
            loader.ingest(args.file, args.version)
        elif args.command == "search":
            from retriever import CandidateRetriever
            retriever = CandidateRetriever(db, embedding_provider)
            results = retriever.search(args.query, args.ontology, args.mode)
            for r in results:
                print(f"Rank {r.rank} [{r.match_type} {r.similarity:.2f if r.similarity else 0.0}] {r.concept.ontology} {r.concept.code}: {r.concept.preferred_term}")
        else:
            parser.print_help()
    finally:
        db.close()

if __name__ == "__main__":
    main()
