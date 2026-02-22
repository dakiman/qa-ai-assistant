"""Test case generation endpoints."""

from fastapi import APIRouter, Depends, status

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError
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

router = APIRouter(prefix="/generate", tags=["Generation"])


# #region agent log
import json as _json_dbg
from datetime import datetime as _dt_dbg
_DBG_LOG_PATH = r"C:\Users\User\Projects\qa-ai-tool\debug-a8936c.log"
def _dbg_log(location: str, message: str, data: dict = None):
    try:
        with open(_DBG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(_json_dbg.dumps({"sessionId": "a8936c", "location": location, "message": message, "data": data or {}, "timestamp": _dt_dbg.now().isoformat()}) + "\n")
    except Exception as e:
        print(f"DBG LOG ERROR: {e}", flush=True)
_dbg_log("generate.py:module", "Module loaded", {"hypothesisId": "test"})
# #endregion

@router.post("/", response_model=GenerateResponse)
def generate_test_cases(
    request: GenerateRequest,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    template_repo: TemplateRepository = Depends(get_template_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    llm_service: LLMService = Depends(get_llm_service),
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
    # #region agent log
    _dbg_log("generate.py:43", "generate_test_cases START", {"feature_id": request.feature_id, "hypothesisId": "A"})
    # #endregion
    
    # Get the feature
    feature = feature_repo.get(request.feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", request.feature_id)
    
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
    
    # #region agent log
    _dbg_log("generate.py:64", "Before LLM call", {"hypothesisId": "A"})
    # #endregion
    
    # Generate test cases using LLM with linked context
    test_case_drafts = llm_service.generate_initial_test_cases(
        requirements=feature.raw_requirements,
        template_content=template_content,
        linked_context=linked_context if linked_context else None
    )
    
    # #region agent log
    _dbg_log("generate.py:74", "LLM returned", {"drafts_count": len(test_case_drafts), "hypothesisId": "A"})
    # #endregion
    
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
    
    # #region agent log
    _dbg_log("generate.py:91", "DB save complete", {"saved_count": saved_count, "hypothesisId": "B"})
    # #endregion
    
    # #region agent log
    _dbg_log("generate.py:95", "Building response object", {"hypothesisId": "A,E"})
    # #endregion
    
    response = GenerateResponse(
        feature_id=feature.id,
        test_cases=test_case_drafts,
        message=f"Successfully generated {saved_count} test cases"
    )
    
    # #region agent log
    _dbg_log("generate.py:105", "Response object built, returning", {"test_cases_count": len(response.test_cases), "hypothesisId": "A,E"})
    # #endregion
    
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
