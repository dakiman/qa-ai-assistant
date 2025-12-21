"""Refinement engine endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import json

from database import get_session
from models import (
    Feature,
    Template,
    TestCase,
    TestCaseStatus,
    TestCaseRead,
    RefinementRequest,
    RefinementResponse,
)
from services.llm_service import get_llm_service, LLMService

router = APIRouter(prefix="/features", tags=["Refinement"])


@router.post("/{feature_id}/refine", response_model=RefinementResponse)
def refine_test_suite(
    feature_id: int,
    request: RefinementRequest,
    session: Session = Depends(get_session),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Refine the test suite for a feature.
    
    This endpoint:
    1. Fetches all accepted and manual test cases for the feature
    2. Sends them to the LLM along with the original requirements
    3. The LLM performs gap analysis and generates new edge cases
    4. New cases are saved to the database with is_edge_case=True
    5. Returns the complete refined test suite
    """
    # Get the feature
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    
    # Get template if specified
    template_content = None
    if request.template_id:
        template = session.get(Template, request.template_id)
        if template:
            template_content = template.system_instructions
    
    # Get all accepted and manual test cases
    statement = select(TestCase).where(
        TestCase.feature_id == feature_id,
        (TestCase.status == TestCaseStatus.ACCEPTED) | (TestCase.is_manual == True)
    )
    accepted_cases = session.exec(statement).all()
    
    # Convert to read models for the LLM
    accepted_case_reads = [TestCaseRead.from_orm_model(tc) for tc in accepted_cases]
    
    original_count = len(accepted_case_reads)
    
    # Call the refinement service
    new_cases = llm_service.refine_test_suite(
        requirements=feature.raw_requirements,
        accepted_cases=accepted_case_reads,
        template_content=template_content
    )
    
    # Save new test cases to database
    edge_cases_added = 0
    for case_draft in new_cases:
        db_test_case = TestCase(
            feature_id=feature_id,
            title=case_draft.title,
            steps=json.dumps(case_draft.steps),
            expected_result=case_draft.expected_result,
            is_edge_case=True,  # All refinement cases are edge cases
            is_manual=False,
            refinement_notes=case_draft.refinement_notes,
            status=TestCaseStatus.DRAFT  # Start as draft for user review
        )
        session.add(db_test_case)
        edge_cases_added += 1
    
    session.commit()
    
    # Fetch all test cases for the feature (including newly added ones)
    all_cases_statement = select(TestCase).where(TestCase.feature_id == feature_id)
    all_cases = session.exec(all_cases_statement).all()
    
    all_case_reads = [TestCaseRead.from_orm_model(tc) for tc in all_cases]
    
    return RefinementResponse(
        feature_id=feature_id,
        original_count=original_count,
        new_count=len(all_case_reads),
        edge_cases_added=edge_cases_added,
        test_cases=all_case_reads,
        message=f"Refinement complete! Added {edge_cases_added} new edge cases based on gap analysis."
    )


@router.get("/{feature_id}/stats")
def get_feature_stats(
    feature_id: int,
    session: Session = Depends(get_session)
):
    """Get statistics for a feature's test cases."""
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    
    all_cases = feature.test_cases
    
    stats = {
        "feature_id": feature_id,
        "total": len(all_cases),
        "draft": sum(1 for tc in all_cases if tc.status == TestCaseStatus.DRAFT),
        "accepted": sum(1 for tc in all_cases if tc.status == TestCaseStatus.ACCEPTED),
        "rejected": sum(1 for tc in all_cases if tc.status == TestCaseStatus.REJECTED),
        "edge_cases": sum(1 for tc in all_cases if tc.is_edge_case),
        "manual": sum(1 for tc in all_cases if tc.is_manual),
        "ready_for_refinement": sum(
            1 for tc in all_cases 
            if tc.status == TestCaseStatus.ACCEPTED or tc.is_manual
        ),
    }
    
    return stats

