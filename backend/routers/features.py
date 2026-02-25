"""Feature CRUD endpoints."""

from fastapi import APIRouter, Depends, status
from typing import Sequence

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError
from models import (
    Feature, 
    FeatureCreate, 
    FeatureRead, 
    FeatureUpdate
)
from repositories.feature_repository import FeatureRepository, get_feature_repository
from services.validation_service import ValidationService, get_validation_service

router = APIRouter(prefix="/features", tags=["Features"])


@router.post("/", response_model=FeatureRead, status_code=status.HTTP_201_CREATED)
def create_feature(
    feature: FeatureCreate, 
    repo: FeatureRepository = Depends(get_feature_repository),
    validation_service: ValidationService = Depends(get_validation_service),
    _: str = Depends(verify_api_key)
) -> Feature:
    """Create a new feature."""
    validation_service.validate_requirements(
        feature.raw_requirements,
        skip_llm=feature.skip_llm_validation,
    )
    db_feature = Feature.model_validate(feature)
    return repo.create(db_feature)


@router.get("/", response_model=list[FeatureRead])
def list_features(
    skip: int = 0, 
    limit: int = 100, 
    repo: FeatureRepository = Depends(get_feature_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> Sequence[Feature]:
    """List all features with pagination."""
    return repo.get_all(skip=skip, limit=limit)


@router.get("/{feature_id}", response_model=FeatureRead)
def get_feature(
    feature_id: int, 
    repo: FeatureRepository = Depends(get_feature_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> Feature:
    """Get a specific feature by ID."""
    feature = repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    return feature


@router.patch("/{feature_id}", response_model=FeatureRead)
def update_feature(
    feature_id: int, 
    feature_update: FeatureUpdate, 
    repo: FeatureRepository = Depends(get_feature_repository),
    validation_service: ValidationService = Depends(get_validation_service),
    _: str = Depends(verify_api_key)
) -> Feature:
    """Update a feature."""
    feature = repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    if feature_update.raw_requirements is not None:
        validation_service.validate_requirements(
            feature_update.raw_requirements,
            skip_llm=feature_update.skip_llm_validation,
        )
    return repo.update(feature, feature_update)


@router.delete("/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feature(
    feature_id: int, 
    repo: FeatureRepository = Depends(get_feature_repository),
    _: str = Depends(verify_api_key)
) -> None:
    """Delete a feature."""
    feature = repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    repo.delete(feature)
