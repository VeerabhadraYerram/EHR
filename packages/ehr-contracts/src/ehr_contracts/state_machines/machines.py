from enum import Enum, auto
from typing import Optional

class IdentityState(Enum):
    RECEIVED = "RECEIVED"
    IDENTITY_PENDING = "IDENTITY_PENDING"
    HIGH_CONFIDENCE_LINKED = "HIGH_CONFIDENCE_LINKED"
    MEDIUM_CONFIDENCE_REVIEW = "MEDIUM_CONFIDENCE_REVIEW"
    LOW_CONFIDENCE_MANUAL_QUEUE = "LOW_CONFIDENCE_MANUAL_QUEUE"
    LINKED = "LINKED"
    REJECTED = "REJECTED"

class IdentityStateMachine:
    def __init__(self, initial_state: IdentityState = IdentityState.RECEIVED):
        self._state = initial_state

    @property
    def current_state(self) -> IdentityState:
        return self._state

    def transition_to_pending(self):
        if self._state != IdentityState.RECEIVED:
            raise ValueError(f"Invalid transition from {self._state} to IDENTITY_PENDING")
        self._state = IdentityState.IDENTITY_PENDING

    def process_match(self, confidence: str):
        if self._state != IdentityState.IDENTITY_PENDING:
            raise ValueError("Must be in IDENTITY_PENDING to process match")
        
        if confidence == "HIGH":
            self._state = IdentityState.HIGH_CONFIDENCE_LINKED
        elif confidence == "MEDIUM":
            self._state = IdentityState.MEDIUM_CONFIDENCE_REVIEW
        elif confidence == "LOW":
            self._state = IdentityState.LOW_CONFIDENCE_MANUAL_QUEUE
        else:
            raise ValueError("Unknown confidence level")

    def doctor_review(self, action: str):
        if self._state not in (IdentityState.MEDIUM_CONFIDENCE_REVIEW, IdentityState.LOW_CONFIDENCE_MANUAL_QUEUE):
            raise ValueError(f"Invalid state for doctor review: {self._state}")
        
        if action == "ACCEPT":
            self._state = IdentityState.LINKED
        elif action == "REJECT":
            self._state = IdentityState.REJECTED
        else:
            raise ValueError("Unknown doctor action")

class RecordState(Enum):
    PROCESSING = "PROCESSING"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    VERIFICATION_IN_PROGRESS = "VERIFICATION_IN_PROGRESS"
    VERIFIED = "VERIFIED"
    FHIR_VALIDATION = "FHIR_VALIDATION"
    PERSISTED = "PERSISTED"

class RecordStateMachine:
    def __init__(self, initial_state: RecordState = RecordState.PROCESSING):
        self._state = initial_state

    @property
    def current_state(self) -> RecordState:
        return self._state

    def flag_for_review(self):
        if self._state != RecordState.PROCESSING:
            raise ValueError(f"Invalid transition from {self._state} to REVIEW_REQUIRED")
        self._state = RecordState.REVIEW_REQUIRED
        
    def start_verification(self):
        if self._state != RecordState.REVIEW_REQUIRED:
            raise ValueError(f"Invalid transition to VERIFICATION_IN_PROGRESS")
        self._state = RecordState.VERIFICATION_IN_PROGRESS

    def verify(self):
        if self._state not in (RecordState.PROCESSING, RecordState.VERIFICATION_IN_PROGRESS):
            raise ValueError("Invalid transition to VERIFIED")
        self._state = RecordState.VERIFIED

    def validate_fhir(self):
        if self._state != RecordState.VERIFIED:
            raise ValueError("Must be VERIFIED before FHIR validation")
        self._state = RecordState.FHIR_VALIDATION

    def persist(self):
        if self._state != RecordState.FHIR_VALIDATION:
            raise ValueError("Must be FHIR_VALIDATION before PERSISTED")
        self._state = RecordState.PERSISTED
