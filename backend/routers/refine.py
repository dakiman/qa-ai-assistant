"""Refinement engine endpoints."""

from fastapi import APIRouter, Depends, status

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError
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
_dbg_log("refine.py:module", "Module loaded", {"hypothesisId": "test"})
# #endregion

router = APIRouter(prefix="/features", tags=["Refinement"])


@router.post("/{feature_id}/refine", response_model=RefinementResponse)
def refine_test_suite(
    feature_id: int,
    request: RefinementRequest,
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    template_repo: TemplateRepository = Depends(get_template_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    link_repo: LinkRepository = Depends(get_link_repository),
    llm_service: LLMService = Depends(get_llm_service),
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
    # #region agent log
    _dbg_log("refine.py:44", "refine_test_suite START", {"feature_id": feature_id, "hypothesisId": "A"})
    # #endregion
    
    # Get the feature
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Get template if specified
    template_content = None
    if request.template_id:
        template = template_repo.get(request.template_id)
        if template:
            template_content = template.system_instructions
    
    # Get all accepted and manual test cases
    accepted_cases = test_case_repo.get_accepted_and_manual(feature_id)
    
    # Convert to read models for the LLM
    accepted_case_reads = [TestCaseRead.from_orm_model(tc) for tc in accepted_cases]
    
    original_count = len(accepted_case_reads)
    
    # #region agent log
    _dbg_log("refine.py:68", "Before linked context", {"accepted_count": original_count, "hypothesisId": "B"})
    # #endregion
    
    # Get linked context for RAG
    linked_context_data = link_repo.get_linked_context(feature_id)
    linked_context = llm_service.format_linked_context(
        linked_features=linked_context_data.linked_features,
        linked_test_cases=linked_context_data.linked_test_cases
    )
    
    # #region agent log
    _dbg_log("refine.py:79", "Before LLM refine call", {"hypothesisId": "A"})
    # #endregion
    
    # Call the refinement service with linked context
    new_cases = llm_service.refine_test_suite(
        requirements=feature.raw_requirements,
        accepted_cases=accepted_case_reads,
        template_content=template_content,
        linked_context=linked_context if linked_context else None
    )
    
    # #region agent log
    _dbg_log("refine.py:90", "LLM returned", {"new_cases_count": len(new_cases), "hypothesisId": "A"})
    # #endregion
    
    # Save new test cases to database
    edge_cases_added = 0
    for case_draft in new_cases:
        test_case_repo.create_from_draft(
            feature_id=feature_id,
            title=case_draft.title,
            steps=case_draft.steps,
            expected_result=case_draft.expected_result,
            is_edge_case=True,  # All refinement cases are edge cases
            is_manual=False,
            refinement_notes=case_draft.refinement_notes,
            status=TestCaseStatus.DRAFT  # Start as draft for user review
        )
        edge_cases_added += 1
    
    # #region agent log
    _dbg_log("refine.py:108", "DB save complete", {"edge_cases_added": edge_cases_added, "hypothesisId": "B"})
    # #endregion
    
    # Fetch all test cases for the feature (including newly added ones)
    all_cases = test_case_repo.get_by_feature(feature_id)
    
    # #region agent log
    _dbg_log("refine.py:115", "Before from_orm_model conversion", {"all_cases_count": len(all_cases), "hypothesisId": "A,E"})
    # #endregion
    
    all_case_reads = [TestCaseRead.from_orm_model(tc) for tc in all_cases]
    
    # #region agent log
    _dbg_log("refine.py:121", "from_orm_model conversion complete", {"all_case_reads_count": len(all_case_reads), "hypothesisId": "A,E"})
    # #endregion
    
    # #region agent log
    _dbg_log("refine.py:125", "Building RefinementResponse", {"hypothesisId": "A,E"})
    # #endregion
    
    response = RefinementResponse(
        feature_id=feature_id,
        original_count=original_count,
        new_count=len(all_case_reads),
        edge_cases_added=edge_cases_added,
        test_cases=all_case_reads,
        message=f"Refinement complete! Added {edge_cases_added} new edge cases based on gap analysis."
    )
    
    # #region agent log
    _dbg_log("refine.py:138", "Response built, returning", {"hypothesisId": "A,E"})
    # #endregion
    
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
