"""Feature repository for feature data access operations."""

from typing import Optional, Sequence
from fastapi import Depends
from sqlmodel import Session, select

from database import get_session
from models import Feature, FeatureUpdate
from repositories.base import BaseRepository


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
        for key, value in update_dict.items():
            setattr(feature, key, value)
        
        self.session.add(feature)
        self.session.commit()
        self.session.refresh(feature)
        return feature
    
    def increment_generation_count(self, feature: Feature) -> Feature:
        """Increment the generation counter and commit."""
        feature.generation_count += 1
        self.session.add(feature)
        self.session.commit()
        self.session.refresh(feature)
        return feature

    def increment_refinement_count(self, feature: Feature) -> Feature:
        """Increment the refinement counter and commit."""
        feature.refinement_count += 1
        self.session.add(feature)
        self.session.commit()
        self.session.refresh(feature)
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




