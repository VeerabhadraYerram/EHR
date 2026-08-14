from typing import List, Optional
from sqlalchemy import select, or_, desc
from sqlalchemy.orm import Session
from models import Concept, Term, OntologyEmbedding
from ehr_contracts.terminology.models import SearchCandidate, OntologyConcept, OntologyTerm
from providers import EmbeddingProvider

class CandidateRetriever:
    def __init__(self, db: Session, embedding_provider: EmbeddingProvider):
        self.db = db
        self.embedding_provider = embedding_provider

    def exact_lookup(self, ontology: str, code: str) -> Optional[OntologyConcept]:
        """Fetch an exact concept by ontology and code."""
        concept = self.db.execute(
            select(Concept).where(Concept.ontology == ontology, Concept.code == code)
        ).scalar_one_or_none()
        
        if not concept:
            return None
            
        return self._to_pydantic(concept)

    def search(
        self, 
        query: str, 
        ontology: Optional[str] = None, 
        mode: str = "hybrid", 
        limit: int = 10
    ) -> List[SearchCandidate]:
        """Search concepts using lexical, vector, or hybrid search."""
        
        candidates = []
        
        # 1. Exact Term Match (highest rank)
        if mode in ("lexical", "hybrid"):
            exact_matches = self._exact_term_search(query, ontology, limit)
            candidates.extend(exact_matches)
            
        # 2. Vector Search
        if mode in ("vector", "hybrid"):
            # Determine remaining slots
            remaining = limit - len(candidates)
            if remaining > 0:
                vector_matches = self._vector_search(query, ontology, remaining)
                candidates.extend(vector_matches)
                
        # 3. Deduplicate
        seen_codes = set()
        unique_candidates = []
        for c in candidates:
            key = f"{c.concept.ontology}:{c.concept.code}"
            if key not in seen_codes:
                seen_codes.add(key)
                unique_candidates.append(c)
                
        # 4. Sort by rank (lower is better rank)
        unique_candidates.sort(key=lambda x: x.rank)
        
        return unique_candidates[:limit]

    def _exact_term_search(self, query: str, ontology: Optional[str], limit: int) -> List[SearchCandidate]:
        normalized_query = query.lower().strip()
        
        stmt = select(Term).join(Concept).where(Term.normalized_term == normalized_query)
        if ontology:
            stmt = stmt.where(Concept.ontology == ontology)
            
        stmt = stmt.limit(limit)
        terms = self.db.execute(stmt).scalars().all()
        
        return [
            SearchCandidate(
                concept=self._to_pydantic(t.concept),
                matched_term=t.term,
                match_type="EXACT_TERM",
                similarity=1.0,
                rank=1
            )
            for t in terms
        ]

    def _vector_search(self, query: str, ontology: Optional[str], limit: int) -> List[SearchCandidate]:
        query_embedding = self.embedding_provider.embed_query(query)
        
        # Vector similarity search using pgvector cosine distance operator (<=>)
        stmt = select(OntologyEmbedding).join(Concept)
        if ontology:
            stmt = stmt.where(OntologyEmbedding.ontology == ontology)
            
        # Order by distance (closer = more similar)
        stmt = stmt.order_by(OntologyEmbedding.embedding.cosine_distance(query_embedding))
        stmt = stmt.limit(limit)
        
        embeddings = self.db.execute(stmt).scalars().all()
        
        candidates = []
        for i, emb in enumerate(embeddings):
            # Calculate cosine similarity from distance
            distance = float(emb.embedding.cosine_distance(query_embedding)) # This is pseudo-code for SQLAlchemy
            similarity = 1.0 - distance
            
            candidates.append(
                SearchCandidate(
                    concept=self._to_pydantic(emb.concept),
                    matched_term=emb.concept.preferred_term, # Simplification
                    match_type="VECTOR",
                    similarity=similarity,
                    rank=2 + i # Rank lower than exact matches
                )
            )
            
        return candidates

    def _to_pydantic(self, concept: Concept) -> OntologyConcept:
        return OntologyConcept(
            id=concept.id,
            ontology=concept.ontology,
            code=concept.code,
            preferred_term=concept.preferred_term,
            status=concept.status,
            release_id=concept.release_id,
            terms=[
                OntologyTerm(
                    id=t.id,
                    concept_id=t.concept_id,
                    term=t.term,
                    normalized_term=t.normalized_term,
                    term_type=t.term_type,
                    source=t.source
                ) for t in concept.terms
            ]
        )
