"""Test case management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import Sequence
import json

from database import get_session
from models import (
    TestCase,
    TestCaseCreate,
    TestCaseRead,
    TestCaseUpdate,
    TestCaseStatus,
    BulkStatusUpdate,
)

router = APIRouter(prefix="/test-cases", tags=["Test Cases"])


@router.post("/", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED)
def create_test_case(test_case: TestCaseCreate, session: Session = Depends(get_session)):
    """Create a new test case (for manual entry)."""
    db_test_case = TestCase(
        title=test_case.title,
        steps=json.dumps(test_case.steps),
        expected_result=test_case.expected_result,
        is_edge_case=test_case.is_edge_case,
        is_manual=test_case.is_manual,
        refinement_notes=test_case.refinement_notes,
        status=test_case.status,
        feature_id=test_case.feature_id
    )
    session.add(db_test_case)
    session.commit()
    session.refresh(db_test_case)
    return TestCaseRead.from_orm_model(db_test_case)


@router.get("/{test_case_id}", response_model=TestCaseRead)
def get_test_case(test_case_id: int, session: Session = Depends(get_session)):
    """Get a specific test case by ID."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    return TestCaseRead.from_orm_model(test_case)


@router.patch("/{test_case_id}", response_model=TestCaseRead)
def update_test_case(
    test_case_id: int,
    test_case_update: TestCaseUpdate,
    session: Session = Depends(get_session)
):
    """Update a test case."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    
    update_data = test_case_update.model_dump(exclude_unset=True)
    
    # Handle steps conversion from list to JSON
    if "steps" in update_data and update_data["steps"] is not None:
        update_data["steps"] = json.dumps(update_data["steps"])
    
    for key, value in update_data.items():
        setattr(test_case, key, value)
    
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return TestCaseRead.from_orm_model(test_case)


@router.delete("/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(test_case_id: int, session: Session = Depends(get_session)):
    """Delete a test case."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    session.delete(test_case)
    session.commit()
    return None


@router.post("/{test_case_id}/accept", response_model=TestCaseRead)
def accept_test_case(test_case_id: int, session: Session = Depends(get_session)):
    """Accept a test case (shortcut for status update)."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    
    test_case.status = TestCaseStatus.ACCEPTED
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return TestCaseRead.from_orm_model(test_case)


@router.post("/{test_case_id}/reject", response_model=TestCaseRead)
def reject_test_case(test_case_id: int, session: Session = Depends(get_session)):
    """Reject a test case (shortcut for status update)."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    
    test_case.status = TestCaseStatus.REJECTED
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return TestCaseRead.from_orm_model(test_case)


@router.post("/{test_case_id}/reset", response_model=TestCaseRead)
def reset_test_case(test_case_id: int, session: Session = Depends(get_session)):
    """Reset a test case to draft status."""
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case with id {test_case_id} not found"
        )
    
    test_case.status = TestCaseStatus.DRAFT
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return TestCaseRead.from_orm_model(test_case)


@router.post("/bulk-status", response_model=list[TestCaseRead])
def bulk_update_status(
    bulk_update: BulkStatusUpdate,
    session: Session = Depends(get_session)
):
    """Update status for multiple test cases at once."""
    updated_cases = []
    
    for tc_id in bulk_update.test_case_ids:
        test_case = session.get(TestCase, tc_id)
        if test_case:
            test_case.status = bulk_update.status
            session.add(test_case)
            updated_cases.append(test_case)
    
    session.commit()
    
    # Refresh all updated cases
    for tc in updated_cases:
        session.refresh(tc)
    
    return [TestCaseRead.from_orm_model(tc) for tc in updated_cases]

