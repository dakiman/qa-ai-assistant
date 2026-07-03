"""Feature and test case link management endpoints."""

from fastapi import APIRouter, Depends, status

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError, ResourceConflictError, ValidationError
from models import (
    FeatureLink,
    FeatureLinkCreate,
    FeatureLinkRead,
    TestCaseLink,
    TestCaseLinkCreate,
    TestCaseLinkRead,
    FeatureLinksResponse,
)
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository
from repositories.link_repository import LinkRepository, get_link_repository

router = APIRouter(prefix="/features", tags=["Links"])


@router.get("/{feature_id}/links", response_model=FeatureLinksResponse)
def get_feature_links(
    feature_id: int,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> FeatureLinksResponse:
    """
    Get all links for a feature.
    
    Returns both feature-to-feature and feature-to-test-case links.
    """
    # Verify feature exists
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    feature_links = link_repo.get_feature_links(feature_id)
    test_case_links = link_repo.get_test_case_links(feature_id)
    
    return FeatureLinksResponse(
        feature_id=feature_id,
        feature_links=feature_links,
        test_case_links=test_case_links
    )


@router.post(
    "/{feature_id}/links/feature",
    response_model=FeatureLinkRead,
    status_code=status.HTTP_201_CREATED
)
def create_feature_link(
    feature_id: int,
    link_data: FeatureLinkCreate,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    _: str = Depends(verify_api_key)
) -> FeatureLinkRead:
    """
    Create a feature-to-feature link.
    
    Creates a bidirectional relationship between two features.
    The link type determines the relationship direction:
    - RELATES_TO: symmetric (A relates to B = B relates to A)
    - DEPENDS_ON: A depends on B = B blocks A
    - PARENT_OF: A is parent of B = B is child of A
    """
    # Verify source feature exists
    source_feature = feature_repo.get(feature_id)
    if not source_feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Verify target feature exists
    target_feature = feature_repo.get(link_data.target_feature_id)
    if not target_feature:
        raise ResourceNotFoundError("Feature", link_data.target_feature_id)
    
    # Cannot link to self
    if feature_id == link_data.target_feature_id:
        raise ValidationError("Cannot link a feature to itself")

    # Check if link already exists
    if link_repo.check_feature_link_exists(feature_id, link_data.target_feature_id):
        raise ResourceConflictError("Link between these features already exists")
    
    link = link_repo.create_feature_link(
        source_feature_id=feature_id,
        target_feature_id=link_data.target_feature_id,
        link_type=link_data.link_type,
        notes=link_data.notes
    )
    
    return FeatureLinkRead(
        id=link.id,
        source_feature_id=link.source_feature_id,
        target_feature_id=link.target_feature_id,
        link_type=link.link_type,
        notes=link.notes,
        created_at=link.created_at,
        target_feature_title=target_feature.title
    )


@router.delete(
    "/{feature_id}/links/feature/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_feature_link(
    feature_id: int,
    link_id: int,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    _: str = Depends(verify_api_key)
) -> None:
    """
    Delete a feature-to-feature link.
    
    Also deletes the inverse link to maintain bidirectional consistency.
    """
    # Verify feature exists
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Get the link. Treat a link that belongs to a different feature as
    # not-found (404) rather than 403 so the endpoint doesn't leak the
    # existence of links the caller has no path to.
    link = link_repo.get_feature_link(link_id)
    if not link or link.source_feature_id != feature_id:
        raise ResourceNotFoundError("Feature link", link_id)

    link_repo.delete_feature_link(link)


@router.post(
    "/{feature_id}/links/test-case",
    response_model=TestCaseLinkRead,
    status_code=status.HTTP_201_CREATED
)
def create_test_case_link(
    feature_id: int,
    link_data: TestCaseLinkCreate,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseLinkRead:
    """
    Create a feature-to-test-case link.
    
    Links a feature to a test case from another feature for context.
    The test case must belong to a different feature.
    """
    # Verify feature exists
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Verify test case exists
    test_case = test_case_repo.get(link_data.test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", link_data.test_case_id)
    
    # Cannot link to own test cases
    if test_case.feature_id == feature_id:
        raise ValidationError("Cannot link to test cases from the same feature")

    # Check if link already exists
    if link_repo.check_test_case_link_exists(feature_id, link_data.test_case_id):
        raise ResourceConflictError("Link to this test case already exists")
    
    link = link_repo.create_test_case_link(
        feature_id=feature_id,
        test_case_id=link_data.test_case_id,
        notes=link_data.notes
    )
    
    # Get the test case's feature title
    test_case_feature = feature_repo.get(test_case.feature_id)
    
    return TestCaseLinkRead(
        id=link.id,
        feature_id=link.feature_id,
        test_case_id=link.test_case_id,
        notes=link.notes,
        created_at=link.created_at,
        test_case_title=test_case.title,
        test_case_feature_id=test_case.feature_id,
        test_case_feature_title=test_case_feature.title if test_case_feature else None
    )


@router.delete(
    "/{feature_id}/links/test-case/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_test_case_link(
    feature_id: int,
    link_id: int,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    _: str = Depends(verify_api_key)
) -> None:
    """Delete a feature-to-test-case link."""
    # Verify feature exists
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Get the link. A link belonging to another feature is reported as
    # not-found (404) rather than 403 to avoid leaking its existence.
    link = link_repo.get_test_case_link(link_id)
    if not link or link.feature_id != feature_id:
        raise ResourceNotFoundError("Test case link", link_id)

    link_repo.delete_test_case_link(link)



