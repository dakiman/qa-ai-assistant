"""Test case repository for test case data access operations."""

from typing import Optional, Sequence
from fastapi import Depends
from sqlmodel import Session, select
import json

from database import get_session
from models import TestCase, TestCaseCreate, TestCaseUpdate, TestCaseStatus
from repositories.base import BaseRepository, reject_null_fields

# TestCase columns that are NOT NULL — a PATCH may omit them but must not null them.
_TEST_CASE_NON_NULLABLE = {
    "title", "steps", "expected_result", "is_edge_case", "is_manual", "status",
}


class TestCaseRepository(BaseRepository[TestCase]):
    """Repository for TestCase entity operations."""
    
    def __init__(self, session: Session):
        """Initialize with TestCase model and session."""
        super().__init__(TestCase, session)
    
    def create_from_schema(self, test_case_create: TestCaseCreate) -> TestCase:
        """
        Create a test case from a creation schema.
        
        Handles the conversion of steps list to JSON string.
        
        Args:
            test_case_create: Creation schema with list steps
            
        Returns:
            Created test case
        """
        db_test_case = TestCase(
            title=test_case_create.title,
            steps=json.dumps(test_case_create.steps),
            expected_result=test_case_create.expected_result,
            is_edge_case=test_case_create.is_edge_case,
            is_manual=test_case_create.is_manual,
            refinement_notes=test_case_create.refinement_notes,
            status=test_case_create.status,
            feature_id=test_case_create.feature_id
        )
        return self.create(db_test_case)
    
    def update(self, test_case: TestCase, update_data: TestCaseUpdate) -> TestCase:
        """
        Update a test case with partial data.
        
        Handles the conversion of steps list to JSON string if present.
        
        Args:
            test_case: TestCase instance to update
            update_data: Partial update schema
            
        Returns:
            Updated test case
        """
        update_dict = update_data.model_dump(exclude_unset=True)
        reject_null_fields(update_dict, _TEST_CASE_NON_NULLABLE)

        # Handle steps conversion from list to JSON
        if "steps" in update_dict and update_dict["steps"] is not None:
            update_dict["steps"] = json.dumps(update_dict["steps"])
        
        for key, value in update_dict.items():
            setattr(test_case, key, value)
        
        self.session.add(test_case)
        self.session.commit()
        self.session.refresh(test_case)
        return test_case
    
    def update_status(self, test_case: TestCase, status: TestCaseStatus) -> TestCase:
        """
        Update the status of a test case.
        
        Args:
            test_case: TestCase instance to update
            status: New status value
            
        Returns:
            Updated test case
        """
        test_case.status = status
        self.session.add(test_case)
        self.session.commit()
        self.session.refresh(test_case)
        return test_case
    
    def get_by_feature(
        self, 
        feature_id: int,
        status: Optional[TestCaseStatus] = None,
        is_edge_case: Optional[bool] = None,
        is_manual: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> Sequence[TestCase]:
        """
        Get all test cases for a feature with optional filters.
        
        Args:
            feature_id: Feature ID to filter by
            status: Optional status filter (draft/accepted/rejected)
            is_edge_case: Optional edge case filter
            is_manual: Optional manual case filter
            search: Optional search term for title
            
        Returns:
            Sequence of test cases for the feature
        """
        statement = select(TestCase).where(TestCase.feature_id == feature_id)
        
        if status is not None:
            statement = statement.where(TestCase.status == status)
        
        if is_edge_case is not None:
            statement = statement.where(TestCase.is_edge_case == is_edge_case)
        
        if is_manual is not None:
            statement = statement.where(TestCase.is_manual == is_manual)
        
        if search:
            statement = statement.where(TestCase.title.contains(search))
        
        return self.session.exec(statement).all()
    
    def get_accepted_and_manual(self, feature_id: int) -> Sequence[TestCase]:
        """
        Get all accepted and manual test cases for a feature.
        
        Used for refinement operations.
        
        Args:
            feature_id: Feature ID to filter by
            
        Returns:
            Sequence of accepted or manual test cases
        """
        statement = select(TestCase).where(
            TestCase.feature_id == feature_id,
            (TestCase.status == TestCaseStatus.ACCEPTED) | (TestCase.is_manual == True)
        )
        return self.session.exec(statement).all()
    
    def bulk_update_status(
        self, 
        test_case_ids: list[int], 
        status: TestCaseStatus
    ) -> Sequence[TestCase]:
        """
        Update status for multiple test cases at once.
        
        Args:
            test_case_ids: List of test case IDs to update
            status: New status for all test cases
            
        Returns:
            Sequence of updated test cases
        """
        updated_cases = []
        
        for tc_id in test_case_ids:
            test_case = self.session.get(TestCase, tc_id)
            if test_case:
                test_case.status = status
                self.session.add(test_case)
                updated_cases.append(test_case)
        
        self.session.commit()
        
        # Refresh all updated cases
        for tc in updated_cases:
            self.session.refresh(tc)
        
        return updated_cases
    
    def delete_drafts(self, feature_id: int, commit: bool = True) -> int:
        """
        Delete AI-generated DRAFT test cases for a feature.

        Used when force-regenerating test cases. Manually added cases are also
        created as DRAFT, so they are explicitly excluded here — regeneration
        must never destroy the engineer's hand-written work.

        Args:
            feature_id: Feature ID whose drafts to delete
            commit: When False, defer the commit so the delete and the
                replacement inserts land in one transaction.

        Returns:
            Number of drafts deleted
        """
        statement = select(TestCase).where(
            TestCase.feature_id == feature_id,
            TestCase.status == TestCaseStatus.DRAFT,
            TestCase.is_manual == False  # noqa: E712 — SQLAlchemy needs ==, not `is`
        )
        drafts = self.session.exec(statement).all()
        count = len(drafts)
        for draft in drafts:
            self.session.delete(draft)
        if count > 0 and commit:
            self.session.commit()
        return count

    def create_from_draft(
        self,
        feature_id: int,
        title: str,
        steps: list[str],
        expected_result: str,
        is_edge_case: bool = False,
        is_manual: bool = False,
        refinement_notes: Optional[str] = None,
        status: TestCaseStatus = TestCaseStatus.DRAFT,
        commit: bool = True,
    ) -> TestCase:
        """
        Create a test case from individual fields.

        Useful for creating from LLM-generated drafts.

        Args:
            feature_id: Parent feature ID
            title: Test case title
            steps: List of test steps
            expected_result: Expected result
            is_edge_case: Whether this is an edge case
            is_manual: Whether this was manually created
            refinement_notes: Optional notes from refinement
            status: Initial status
            commit: When False, defer the commit so a batch of drafts and the
                feature counter update commit together in one transaction.

        Returns:
            Created test case
        """
        db_test_case = TestCase(
            feature_id=feature_id,
            title=title,
            steps=json.dumps(steps),
            expected_result=expected_result,
            is_edge_case=is_edge_case,
            is_manual=is_manual,
            refinement_notes=refinement_notes,
            status=status
        )
        return self.create(db_test_case, commit=commit)


def get_test_case_repository(
    session: Session = Depends(get_session)
) -> TestCaseRepository:
    """FastAPI dependency for TestCaseRepository."""
    return TestCaseRepository(session)

