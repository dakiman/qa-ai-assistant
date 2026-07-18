"""Feature repository for feature data access operations."""

from typing import Optional, Sequence
from fastapi import Depends
from sqlalchemy import update
from sqlmodel import Session, select

from database import get_session
from models import Feature, FeatureUpdate
from repositories.base import BaseRepository, reject_null_fields

# Feature columns that are NOT NULL (description is nullable).
_FEATURE_NON_NULLABLE = {"title", "raw_requirements"}


class FeatureRepository(BaseRepository[Feature]):
    """Repository for Feature entity operations."""
    
    def __init__(self, session: Session):
        """Initialize with Feature model and session."""
        super().__init__(Feature, session)
    
    def update(self, feature: Feature, update_data: FeatureUpdate) -> Feature:
        """
        Update a feature with partial data.
        
        Args:
            feature: Feature instance to update
            update_data: Partial update schema
            
        Returns:
            Updated feature
        """
        # skip_llm_validation is a request-only flag, not a Feature column —
        # setattr'ing it onto the ORM instance raises ValueError.
        update_dict = update_data.model_dump(
            exclude={"skip_llm_validation"}, exclude_unset=True
        )
        reject_null_fields(update_dict, _FEATURE_NON_NULLABLE)
        for key, value in update_dict.items():
            setattr(feature, key, value)
        
        self.session.add(feature)
        self.session.flush()
        self.session.refresh(feature)
        return feature

    def claim_generation(self, feature_id: int, observed_count: int) -> bool:
        """Atomically bump generation_count iff it still equals observed_count.

        Runs ``UPDATE feature SET generation_count = observed_count + 1 WHERE
        id = ? AND generation_count = observed_count`` and reports whether a
        row was affected. This is the compare-and-swap primitive behind both
        the initial 0->1 claim and the force_regenerate claim (any N -> N+1):
        two concurrent requests that both observed the same count can't both
        win — the loser's UPDATE affects zero rows and must be treated as a
        conflict rather than silently double-inserting a second suite and
        stomping the counter. Does not commit; the caller commits the whole
        generate transaction once.
        """
        result = self.session.execute(
            update(Feature)
            .where(Feature.id == feature_id, Feature.generation_count == observed_count)
            .values(generation_count=observed_count + 1)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1

    def claim_initial_generation(self, feature_id: int) -> bool:
        """Atomically claim the first generation for a feature (0 -> 1).

        Two concurrent (or double-clicked) initial-generate requests both pass
        the earlier ``generation_count > 0`` pre-check, but only one wins this
        conditional update — the loser gets rowcount 0 and can be rejected,
        preventing a duplicate suite.
        """
        return self.claim_generation(feature_id, observed_count=0)

    def increment_generation_count(self, feature: Feature, commit: bool = True) -> Feature:
        """Increment the generation counter.

        The UoW (get_session) owns the commit; ``commit`` is ignored.
        """
        feature.generation_count += 1
        self.session.add(feature)
        self.session.flush()
        return feature

    def increment_refinement_count(self, feature: Feature, commit: bool = True) -> Feature:
        """Increment the refinement counter.

        The UoW (get_session) owns the commit; ``commit`` is ignored.
        """
        feature.refinement_count += 1
        self.session.add(feature)
        self.session.flush()
        return feature

    def get_with_test_cases(self, id: int) -> Optional[Feature]:
        """
        Get a feature with its test cases eagerly loaded.
        
        Args:
            id: Feature ID
            
        Returns:
            Feature with test_cases populated, or None
        """
        # SQLModel's get() already loads relationships via Relationship definition
        # For more complex eager loading, use selectinload from sqlalchemy
        return self.session.get(Feature, id)


def get_feature_repository(
    session: Session = Depends(get_session)
) -> FeatureRepository:
    """FastAPI dependency for FeatureRepository."""
    return FeatureRepository(session)




