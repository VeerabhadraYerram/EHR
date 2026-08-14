from typing import Protocol, List, Optional
from models import Concept

class TerminologyProvider(Protocol):
    """Protocol for fetching concepts and terminology search."""

    def get_concept(self, ontology: str, code: str) -> Optional[Concept]:
        """Fetch exact concept by ontology and code."""
        ...

    def search(self, ontology: Optional[str], query: str, limit: int = 10) -> List[Concept]:
        """Search concepts using lexical or hybrid search."""
        ...

class EmbeddingProvider(Protocol):
    """Protocol for generating text embeddings."""

    @property
    def model_name(self) -> str:
        ...

    @property
    def dimension(self) -> int:
        ...

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        ...

    def embed_query(self, text: str) -> List[float]:
        ...

class SentenceTransformersProvider(EmbeddingProvider):
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        from sentence_transformers import SentenceTransformer
        self._model_name = model_name
        # Load model lazily or at init depending on usage
        self._model = SentenceTransformer(self._model_name)
    
    @property
    def model_name(self) -> str:
        return self._model_name
    
    @property
    def dimension(self) -> int:
        return self._model.get_sentence_embedding_dimension()
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = self._model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
    
    def embed_query(self, text: str) -> List[float]:
        embedding = self._model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
