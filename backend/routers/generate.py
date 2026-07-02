"""Test case generation endpoints."""

from fastapi import APIRouter, Depends, status

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError, ResourceConflictError
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
def generate_test_cases(
    request: GenerateRequest,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    template_repo: TemplateRepository = Depends(get_template_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    llm_service: LLMService = Depends(get_llm_service),
    validation_service: ValidationService = Depends(get_validation_service),
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
    feature = feature_repo.get(request.feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", request.feature_id)

    # Guard: prevent accidental re-generation
    if feature.generation_count > 0 and not request.force_regenerate:
        raise ResourceConflictError(
            "Test cases have already been generated for this feature. "
            "Set force_regenerate=true to delete existing drafts and regenerate."
        )

    # Validate requirements quality before incurring any LLM cost.
    # NOTE: existing drafts are deliberately NOT deleted yet — if validation
    # raises 422 or the LLM errors below, the feature keeps its current drafts.
    validation_service.validate_requirements(
        feature.raw_requirements,
        skip_llm=request.skip_llm_validation,
    )

    # Get template if specified
    template_content = None
    if request.template_id:
        template = template_repo.get(request.template_id)
        if not template:
            raise ResourceNotFoundError("Template", request.template_id)
        template_content = template.system_instructions

    # Get linked context for RAG
    linked_context_data = link_repo.get_linked_context(request.feature_id)
    linked_context = llm_service.format_linked_context(
        linked_features=linked_context_data.linked_features,
        linked_test_cases=linked_context_data.linked_test_cases
    )

    # Generate test cases using LLM with linked context
    test_case_drafts = llm_service.generate_initial_test_cases(
        requirements=feature.raw_requirements,
        template_content=template_content,
        linked_context=linked_context if linked_context else None,
        target_count=request.target_count
    )

    # Only now that new drafts are in hand, swap out the old ones.
    if request.force_regenerate and feature.generation_count > 0:
        test_case_repo.delete_drafts(feature.id)

    # Save generated test cases to database
    saved_count = 0
    for draft in test_case_drafts:
        test_case_repo.create_from_draft(
            feature_id=feature.id,
            title=draft.title,
            steps=draft.steps,
            expected_result=draft.expected_result,
            is_edge_case=draft.is_edge_case,
            status=TestCaseStatus.DRAFT
        )
        saved_count += 1

    # Increment generation counter
    feature_repo.increment_generation_count(feature)

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
