from models import Concept

class ConceptTextBuilder:
    """Builds a semantically rich text representation for a concept to be embedded."""

    @staticmethod
    def build_text(concept: Concept) -> str:
        """
        Constructs a string suitable for vector embedding.
        Example: "Hemoglobin A1c | HbA1c | Glycated hemoglobin"
        """
        parts = []
        
        # Start with the preferred term
        if concept.preferred_term:
            parts.append(concept.preferred_term)
        
        # Add synonyms if available
        if concept.terms:
            synonyms = [t.term for t in concept.terms if t.term_type == 'SYNONYM' and t.term != concept.preferred_term]
            # Remove duplicates while preserving order
            seen = set()
            unique_synonyms = [x for x in synonyms if not (x in seen or seen.add(x))]
            parts.extend(unique_synonyms)
        
        # The resulting text joins the terms with a separator
        return " | ".join(parts)
