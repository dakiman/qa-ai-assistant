"""Test case management endpoints."""

from fastapi import APIRouter, Depends, status
from typing import Sequence

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError
from models import (
    TestCase,
    TestCaseCreate,
    TestCaseRead,
    TestCaseUpdate,
    TestCaseStatus,
    BulkStatusUpdate,
)
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository

router = APIRouter(prefix="/test-cases", tags=["Test Cases"])


@router.post("/", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED)
def create_test_case(
    test_case: TestCaseCreate,
    repo: TestCaseRepository = Depends(get_test_case_repository),
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseRead:
    """Create a new test case (for manual entry)."""
    feature = feature_repo.get(test_case.feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", test_case.feature_id)

    # This endpoint is the manual-entry path — the only client (Add Test Case
    # dialog) always means "a human wrote this," so force is_manual=True
    # server-side rather than trusting the client-supplied value (workflow
    # integrity: manual/AI-generated provenance must not be spoofable).
    test_case.is_manual = True

    db_test_case = repo.create_from_schema(test_case)
    return TestCaseRead.from_orm_model(db_test_case)


@router.get("/{test_case_id}", response_model=TestCaseRead)
def get_test_case(
    test_case_id: int, 
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> TestCaseRead:
    """Get a specific test case by ID."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    return TestCaseRead.from_orm_model(test_case)


@router.patch("/{test_case_id}", response_model=TestCaseRead)
def update_test_case(
    test_case_id: int,
    test_case_update: TestCaseUpdate,
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseRead:
    """Update a test case."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    updated = repo.update(test_case, test_case_update)
    return TestCaseRead.from_orm_model(updated)


@router.delete("/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    test_case_id: int, 
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> None:
    """Delete a test case."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    repo.delete(test_case)


@router.post("/{test_case_id}/accept", response_model=TestCaseRead)
def accept_test_case(
    test_case_id: int, 
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseRead:
    """Accept a test case (shortcut for status update)."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    updated = repo.update_status(test_case, TestCaseStatus.ACCEPTED)
    return TestCaseRead.from_orm_model(updated)


@router.post("/{test_case_id}/reject", response_model=TestCaseRead)
def reject_test_case(
    test_case_id: int, 
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseRead:
    """Reject a test case (shortcut for status update)."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    updated = repo.update_status(test_case, TestCaseStatus.REJECTED)
    return TestCaseRead.from_orm_model(updated)


@router.post("/{test_case_id}/reset", response_model=TestCaseRead)
def reset_test_case(
    test_case_id: int, 
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> TestCaseRead:
    """Reset a test case to draft status."""
    test_case = repo.get(test_case_id)
    if not test_case:
        raise ResourceNotFoundError("Test case", test_case_id)
    updated = repo.update_status(test_case, TestCaseStatus.DRAFT)
    return TestCaseRead.from_orm_model(updated)


@router.post("/bulk-status", response_model=list[TestCaseRead])
def bulk_update_status(
    bulk_update: BulkStatusUpdate,
    repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str = Depends(verify_api_key)
) -> list[TestCaseRead]:
    """Update status for multiple test cases at once."""
    updated_cases = repo.bulk_update_status(
        bulk_update.test_case_ids, 
        bulk_update.status
    )
    return [TestCaseRead.from_orm_model(tc) for tc in updated_cases]
