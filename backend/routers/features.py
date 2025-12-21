"""Feature CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import Sequence

from database import get_session
from models import (
    Feature, 
    FeatureCreate, 
    FeatureRead, 
    FeatureUpdate
)

router = APIRouter(prefix="/features", tags=["Features"])


@router.post("/", response_model=FeatureRead, status_code=status.HTTP_201_CREATED)
def create_feature(feature: FeatureCreate, session: Session = Depends(get_session)):
    """Create a new feature."""
    db_feature = Feature.model_validate(feature)
    session.add(db_feature)
    session.commit()
    session.refresh(db_feature)
    return db_feature


@router.get("/", response_model=list[FeatureRead])
def list_features(
    skip: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session)
) -> Sequence[Feature]:
    """List all features with pagination."""
    statement = select(Feature).offset(skip).limit(limit)
    features = session.exec(statement).all()
    return features


@router.get("/{feature_id}", response_model=FeatureRead)
def get_feature(feature_id: int, session: Session = Depends(get_session)):
    """Get a specific feature by ID."""
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    return feature


@router.patch("/{feature_id}", response_model=FeatureRead)
def update_feature(
    feature_id: int, 
    feature_update: FeatureUpdate, 
    session: Session = Depends(get_session)
):
    """Update a feature."""
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    
    feature_data = feature_update.model_dump(exclude_unset=True)
    for key, value in feature_data.items():
        setattr(feature, key, value)
    
    session.add(feature)
    session.commit()
    session.refresh(feature)
    return feature


@router.delete("/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feature(feature_id: int, session: Session = Depends(get_session)):
    """Delete a feature."""
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    session.delete(feature)
    session.commit()
    return None


