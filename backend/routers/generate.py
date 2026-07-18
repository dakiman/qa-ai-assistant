"""Test case generation endpoints."""

from fastapi import APIRouter, Depends, Request, status
from sqlmodel import Session

from auth import verify_api_key, verify_api_key_optional
from database import get_session
from exceptions import ResourceNotFoundError, ResourceConflictError
from rate_limit import limiter, generate_limit
from models import (
    GenerateRequest,
    GenerateResponse,
    TestCaseRead,
    TestCaseStatus,
)
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.template_repository import TemplateRepository, get_template_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository
from repositories.link_repository import LinkRepository, get_link_repository
from services.llm_service import get_llm_service, LLMService
from services.validation_service import ValidationService, get_validation_service

router = APIRouter(prefix="/generate", tags=["Generation"])


@router.post("/", response_model=GenerateResponse)
@limiter.limit(generate_limit)
def generate_test_cases(
    request: Request,
    payload: GenerateRequest,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    template_repo: TemplateRepository = Depends(get_template_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    llm_service: LLMService = Depends(get_llm_service),
    validation_service: ValidationService = Depends(get_validation_service),
    session: Session = Depends(get_session),
    _: str = Depends(verify_api_key)
) -> GenerateResponse:
    """
    Generate test cases for a feature using AI.

    Uses the LLM service (with instructor) to generate structured test cases
    from the feature's requirements. Optionally uses a template for custom
    system instructions.

    If the feature has linked features or test cases, their context is included
    in the LLM prompt for more informed test case generation.
    """
    # Get the feature
    feature = feature_repo.get(payload.feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", payload.feature_id)

    # Fast pre-check to avoid LLM cost on an obvious re-generate. The
    # authoritative, race-free guard is the atomic claim below.
    already_generated = feature.generation_count > 0
    if already_generated and not payload.force_regenerate:
        raise ResourceConflictError(
            "Test cases have already been generated for this feature. "
            "Set force_regenerate=true to delete existing drafts and regenerate."
        )

    # Validate requirements quality before incurring any LLM cost.
    # NOTE: existing drafts are deliberately NOT deleted yet — if validation
    # raises 422 or the LLM errors below, the feature keeps its current drafts.
    validation_service.validate_requirements(
        feature.raw_requirements,
        skip_llm=payload.skip_llm_validation,
    )

    # Get template if specified
    template_content = None
    if payload.template_id:
        template = template_repo.get(payload.template_id)
        if not template:
            raise ResourceNotFoundError("Template", payload.template_id)
        template_content = template.system_instructions

    # Get linked context for RAG
    linked_context_data = link_repo.get_linked_context(payload.feature_id)
    linked_context = llm_service.format_linked_context(
        linked_features=linked_context_data.linked_features,
        linked_test_cases=linked_context_data.linked_test_cases
    )

    # Generate test cases using LLM with linked context (no DB writes yet).
    test_case_drafts = llm_service.generate_initial_test_cases(
        requirements=feature.raw_requirements,
        template_content=template_content,
        linked_context=linked_context if linked_context else None,
        target_count=payload.target_count
    )

    # --- Single transaction: claim + swap drafts + insert + counter ---
    # Everything below is deferred (commit=False) and committed once at the end,
    # so a partial failure never leaves drafts persisted with a stale counter
    # (which used to cause a second suite to be appended on the next generate).
    if not payload.force_regenerate:
        # Race-free guard: only one concurrent initial-generate wins the 0->1
        # claim. The loser did the (wasted) LLM call but must not double-insert.
        if not feature_repo.claim_initial_generation(feature.id):
            session.rollback()
            raise ResourceConflictError(
                "Test cases have already been generated for this feature. "
                "Set force_regenerate=true to delete existing drafts and regenerate."
            )
    else:
        # Force path: swap the old AI drafts for the new suite and bump the
        # counter atomically. Two concurrent force_regenerate=true requests
        # both pass the pre-check above, but only one wins this
        # compare-and-swap (guarded against the count observed at the top of
        # this handler) — the loser must not double-insert a second suite or
        # silently lose the counter update.
        if already_generated:
            test_case_repo.delete_drafts(feature.id, commit=False)
        if not feature_repo.claim_generation(feature.id, observed_count=feature.generation_count):
            session.rollback()
            raise ResourceConflictError(
                "Test case generation is already in progress for this feature. Please retry."
            )
        session.refresh(feature)

    saved_count = 0
    for draft in test_case_drafts:
        test_case_repo.create_from_draft(
            feature_id=feature.id,
            title=draft.title,
            steps=draft.steps,
            expected_result=draft.expected_result,
            is_edge_case=draft.is_edge_case,
            status=TestCaseStatus.DRAFT,
            commit=False,
        )
        saved_count += 1

    # The unit of work (get_session) commits once when this handler returns.

    response = GenerateResponse(
        feature_id=feature.id,
        test_cases=test_case_drafts,
        message=f"Successfully generated {saved_count} test cases"
    )

    return response


@router.get("/feature/{feature_id}/test-cases", response_model=list[TestCaseRead])
def get_feature_test_cases(
    feature_id: int,
    status: TestCaseStatus | None = None,
    is_edge_case: bool | None = None,
    is_manual: bool | None = None,
    search: str | None = None,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> list[TestCaseRead]:
    """
    Get all test cases for a specific feature.
    
    Supports filtering by:
    - **status**: Filter by status (draft, accepted, rejected)
    - **is_edge_case**: Filter by edge case flag (true/false)
    - **is_manual**: Filter by manual flag (true/false)
    - **search**: Search by title (case-insensitive contains)
    """
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    test_cases = test_case_repo.get_by_feature(
        feature_id,
        status=status,
        is_edge_case=is_edge_case,
        is_manual=is_manual,
        search=search,
    )
    return [TestCaseRead.from_orm_model(tc) for tc in test_cases]
