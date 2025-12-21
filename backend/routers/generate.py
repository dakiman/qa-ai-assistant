"""Test case generation endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
import json

from database import get_session
from models import (
    Feature,
    Template,
    TestCase,
    TestCaseStatus,
    GenerateRequest,
    GenerateResponse,
    TestCaseDraft,
    TestCaseRead,
)
from services.llm_service import get_llm_service, LLMService

router = APIRouter(prefix="/generate", tags=["Generation"])


@router.post("/", response_model=GenerateResponse)
def generate_test_cases(
    request: GenerateRequest,
    session: Session = Depends(get_session),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Generate test cases for a feature using AI.
    
    Uses the LLM service (with instructor) to generate structured test cases
    from the feature's requirements. Optionally uses a template for custom
    system instructions.
    """
    # Get the feature
    feature = session.get(Feature, request.feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {request.feature_id} not found"
        )
    
    # Get template if specified
    template_content = None
    if request.template_id:
        template = session.get(Template, request.template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template with id {request.template_id} not found"
            )
        template_content = template.system_instructions
    
    # Generate test cases using LLM
    test_case_drafts = llm_service.generate_initial_test_cases(
        requirements=feature.raw_requirements,
        template_content=template_content
    )
    
    # Save generated test cases to database
    saved_count = 0
    for draft in test_case_drafts:
        db_test_case = TestCase(
            feature_id=feature.id,
            title=draft.title,
            steps=json.dumps(draft.steps),
            expected_result=draft.expected_result,
            is_edge_case=draft.is_edge_case,
            status=TestCaseStatus.DRAFT
        )
        session.add(db_test_case)
        saved_count += 1
    
    session.commit()
    
    return GenerateResponse(
        feature_id=feature.id,
        test_cases=test_case_drafts,
        message=f"Successfully generated {saved_count} test cases"
    )


@router.get("/feature/{feature_id}/test-cases", response_model=list[TestCaseRead])
def get_feature_test_cases(
    feature_id: int,
    session: Session = Depends(get_session)
):
    """Get all test cases for a specific feature."""
    feature = session.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature with id {feature_id} not found"
        )
    
    return [TestCaseRead.from_orm_model(tc) for tc in feature.test_cases]


