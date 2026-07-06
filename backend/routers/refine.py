"""Refinement engine endpoints."""

from fastapi import APIRouter, Depends, Request, status
from sqlmodel import Session

from auth import verify_api_key, verify_api_key_optional
from database import get_session
from exceptions import ResourceNotFoundError, ValidationError
from rate_limit import limiter, refine_limit
from models import (
    TestCaseStatus,
    TestCaseRead,
    RefinementRequest,
    RefinementResponse,
)
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.template_repository import TemplateRepository, get_template_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository
from repositories.link_repository import LinkRepository, get_link_repository
from services.llm_service import get_llm_service, LLMService

router = APIRouter(prefix="/features", tags=["Refinement"])


@router.post("/{feature_id}/refine", response_model=RefinementResponse)
@limiter.limit(refine_limit)
def refine_test_suite(
    request: Request,
    feature_id: int,
    payload: RefinementRequest,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    template_repo: TemplateRepository = Depends(get_template_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    llm_service: LLMService = Depends(get_llm_service),
    session: Session = Depends(get_session),
    _: str = Depends(verify_api_key)
) -> RefinementResponse:
    """
    Refine the test suite for a feature.
    
    This endpoint:
    1. Fetches all accepted and manual test cases for the feature
    2. Fetches linked context from related features and test cases
    3. Sends them to the LLM along with the original requirements
    4. The LLM performs gap analysis and generates new edge cases
    5. New cases are saved to the database with is_edge_case=True
    6. Returns the complete refined test suite
    """
    # The path parameter is authoritative. If the client also puts feature_id
    # in the body, reject a mismatch rather than silently ignoring it.
    if payload.feature_id != feature_id:
        raise ValidationError(
            "feature_id in the request body must match the URL path parameter"
        )

    # Get the feature
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Get template if specified. An invalid template_id is a client error —
    # 404 to match /generate, rather than silently ignoring the user's choice.
    template_content = None
    if payload.template_id:
        template = template_repo.get(payload.template_id)
        if not template:
            raise ResourceNotFoundError("Template", payload.template_id)
        template_content = template.system_instructions
    
    # Get all accepted and manual test cases
    accepted_cases = test_case_repo.get_accepted_and_manual(feature_id)
    
    # Convert to read models for the LLM
    accepted_case_reads = [TestCaseRead.from_orm_model(tc) for tc in accepted_cases]
    
    original_count = len(accepted_case_reads)

    # Get linked context for RAG
    linked_context_data = link_repo.get_linked_context(feature_id)
    linked_context = llm_service.format_linked_context(
        linked_features=linked_context_data.linked_features,
        linked_test_cases=linked_context_data.linked_test_cases
    )

    # Call the refinement service with linked context
    new_cases = llm_service.refine_test_suite(
        requirements=feature.raw_requirements,
        accepted_cases=accepted_case_reads,
        template_content=template_content,
        linked_context=linked_context if linked_context else None,
        max_new_cases=payload.max_new_cases
    )

    # Save new test cases + bump the counter in one transaction (commit=False),
    # so a partial failure can't persist some drafts without the counter update.
    edge_cases_added = 0
    for case_draft in new_cases:
        test_case_repo.create_from_draft(
            feature_id=feature_id,
            title=case_draft.title,
            steps=case_draft.steps,
            expected_result=case_draft.expected_result,
            is_edge_case=True,
            is_manual=False,
            refinement_notes=case_draft.refinement_notes,
            status=TestCaseStatus.DRAFT,
            commit=False,
        )
        edge_cases_added += 1

    # Increment refinement counter. The unit of work (get_session) commits the
    # whole batch atomically when this handler returns; flush here so the
    # refresh below sees the incremented counter.
    feature = feature_repo.increment_refinement_count(feature, commit=False)
    session.flush()
    session.refresh(feature)

    # Fetch all test cases for the feature (including newly added ones)
    all_cases = test_case_repo.get_by_feature(feature_id)
    all_case_reads = [TestCaseRead.from_orm_model(tc) for tc in all_cases]

    response = RefinementResponse(
        feature_id=feature_id,
        original_count=original_count,
        # Number of newly-added cases (the total is derivable from test_cases).
        new_count=edge_cases_added,
        edge_cases_added=edge_cases_added,
        refinement_count=feature.refinement_count,
        test_cases=all_case_reads,
        message=f"Refinement complete! Added {edge_cases_added} new edge cases based on gap analysis."
    )

    return response


@router.get("/{feature_id}/stats")
def get_feature_stats(
    feature_id: int,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    _: str | None = Depends(verify_api_key_optional)
):
    """Get statistics for a feature's test cases."""
    feature = feature_repo.get_with_test_cases(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
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
