import uuid
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from models import OntologyRelease, Concept, Term, OntologyEmbedding
from providers import EmbeddingProvider
from text_builder import ConceptTextBuilder
import hashlib

class ExcelSeedLoader:
    """Loads the Ontology Seed Data workbook into the database."""
    
    def __init__(self, db: Session, embedding_provider: EmbeddingProvider):
        self.db = db
        self.embedding_provider = embedding_provider

    def ingest(self, file_path: str, version: str):
        print(f"Ingesting seed data from {file_path} version {version}")
        xls = pd.ExcelFile(file_path)
        
        # We will parse Labs -> LOINC, Diagnoses -> SNOMED/ICD-10, Pharma -> RxNorm
        sheet_mapping = {
            'Labs': 'LOINC',
            'Diagnoses': 'SNOMED_CT', # Or ICD-10 depending on code, treating as SNOMED for seed
            'Pharma': 'RXNORM'
        }
        
        for sheet_name, ontology in sheet_mapping.items():
            if sheet_name not in xls.sheet_names:
                continue
                
            print(f"Loading {sheet_name} as {ontology}...")
            
            # Create Release
            release = OntologyRelease(
                ontology=ontology,
                version=version,
                release_date=datetime.utcnow().date(),
                source="Seed Workbook",
                status="LOADING"
            )
            self.db.add(release)
            self.db.flush()
            
            df = pd.read_excel(xls, sheet_name=sheet_name, skiprows=3)
            
            concepts_created = 0
            
            for _, row in df.iterrows():
                if 'Code' not in row or pd.isna(row['Code']):
                    continue
                    
                code = str(row['Code']).strip()
                preferred_term = str(row['Standard_Name']).strip()
                synonym = str(row['Raw_Text_Variant']).strip() if 'Raw_Text_Variant' in row and not pd.isna(row['Raw_Text_Variant']) else None
                
                # Check if concept exists
                concept = self.db.query(Concept).filter_by(ontology=ontology, code=code).first()
                
                if not concept:
                    concept = Concept(
                        ontology=ontology,
                        code=code,
                        preferred_term=preferred_term,
                        release_id=release.id
                    )
                    self.db.add(concept)
                    self.db.flush()
                    
                    # Add preferred term
                    term = Term(
                        concept_id=concept.id,
                        term=preferred_term,
                        normalized_term=preferred_term.lower(),
                        term_type='PREFERRED'
                    )
                    self.db.add(term)
                    concepts_created += 1
                
                # Add synonym if provided and not already present
                if synonym and synonym.lower() != preferred_term.lower():
                    existing_syn = self.db.query(Term).filter_by(concept_id=concept.id, normalized_term=synonym.lower()).first()
                    if not existing_syn:
                        syn_term = Term(
                            concept_id=concept.id,
                            term=synonym,
                            normalized_term=synonym.lower(),
                            term_type='SYNONYM'
                        )
                        self.db.add(syn_term)

            print(f"Loaded {concepts_created} concepts for {ontology}. Generating embeddings...")
            
            # Generate Embeddings for the new concepts
            concepts = self.db.query(Concept).filter_by(release_id=release.id).all()
            for concept in concepts:
                text_to_embed = ConceptTextBuilder.build_text(concept)
                text_hash = hashlib.sha256(text_to_embed.encode()).hexdigest()
                
                embedding_val = self.embedding_provider.embed_query(text_to_embed)
                
                emb_record = OntologyEmbedding(
                    concept_id=concept.id,
                    ontology=ontology,
                    embedding=embedding_val,
                    embedding_model=self.embedding_provider.model_name,
                    source_text_hash=text_hash
                )
                self.db.add(emb_record)
            
            # Commit and mark ready
            release.status = "READY"
            self.db.commit()
            print(f"Completed {ontology}.")
