"""Test case export endpoints."""

import csv
import io
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth import verify_api_key_optional
from exceptions import ResourceNotFoundError
from models import TestCase, TestCaseStatus, TestCaseRead
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository


class ExportFormat(str, Enum):
    """Supported export formats."""
    JSON = "json"
    CSV = "csv"


router = APIRouter(prefix="/features", tags=["Export"])


# Characters that trigger formula evaluation when a CSV cell is opened in
# Excel/LibreOffice — the primary consumption path for exported test suites.
_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_cell(value: object) -> object:
    """Neutralize CSV/spreadsheet formula injection.

    LLM- and user-authored fields (titles, steps, notes) are written verbatim,
    so a payload like ``=HYPERLINK("http://evil","click")`` would execute on
    open. Prefix a leading formula trigger with a single quote so the cell is
    treated as text. Non-string values are returned unchanged.
    """
    if isinstance(value, str) and value.startswith(_CSV_INJECTION_PREFIXES):
        return "'" + value
    return value


@router.get("/{feature_id}/export")
def export_test_cases(
    feature_id: int,
    format: ExportFormat = Query(default=ExportFormat.JSON, description="Export format (json or csv)"),
    status: Optional[TestCaseStatus] = Query(default=None, description="Filter by status"),
    feature_repo: FeatureRepository = Depends(get_feature_repository),
    test_case_repo: TestCaseRepository = Depends(get_test_case_repository),
    _: str | None = Depends(verify_api_key_optional)
):
    """
    Export test cases for a feature.
    
    Supports JSON and CSV formats. Optionally filter by status (draft, accepted, rejected).
    
    - **feature_id**: ID of the feature to export test cases from
    - **format**: Export format - json or csv (default: json)
    - **status**: Optional filter by test case status
    """
    # Verify feature exists
    feature = feature_repo.get(feature_id)
    if not feature:
        raise ResourceNotFoundError("Feature", feature_id)
    
    # Get test cases
    test_cases = test_case_repo.get_by_feature(feature_id)
    
    # Filter by status if provided
    if status:
        test_cases = [tc for tc in test_cases if tc.status == status]
    
    # Convert to read schemas
    test_case_reads = [TestCaseRead.from_orm_model(tc) for tc in test_cases]
    
    # Generate filename
    status_suffix = f"_{status.value}" if status else ""
    filename = f"feature_{feature_id}_test_cases{status_suffix}"
    
    if format == ExportFormat.CSV:
        return _export_csv(test_case_reads, filename)
    else:
        return _export_json(test_case_reads, filename)


def _export_json(test_cases: list[TestCaseRead], filename: str) -> StreamingResponse:
    """Export test cases as JSON."""
    import json
    
    # Convert to JSON-serializable format
    export_data = {
        "test_cases": [
            {
                "id": tc.id,
                "title": tc.title,
                "steps": tc.steps,
                "expected_result": tc.expected_result,
                "is_edge_case": tc.is_edge_case,
                "is_manual": tc.is_manual,
                "status": tc.status.value if isinstance(tc.status, Enum) else tc.status,
                "refinement_notes": tc.refinement_notes,
            }
            for tc in test_cases
        ],
        "total": len(test_cases)
    }
    
    json_content = json.dumps(export_data, indent=2)
    
    return StreamingResponse(
        iter([json_content]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.json"'
        }
    )


def _export_csv(test_cases: list[TestCaseRead], filename: str) -> StreamingResponse:
    """Export test cases as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "ID",
        "Title",
        "Steps",
        "Expected Result",
        "Is Edge Case",
        "Is Manual",
        "Status",
        "Refinement Notes"
    ])
    
    # Write data rows
    for tc in test_cases:
        # Join steps with numbered format for readability
        steps_text = "\n".join(f"{i+1}. {step}" for i, step in enumerate(tc.steps))
        status_value = tc.status.value if isinstance(tc.status, Enum) else tc.status
        
        writer.writerow([
            tc.id,
            _sanitize_csv_cell(tc.title),
            _sanitize_csv_cell(steps_text),
            _sanitize_csv_cell(tc.expected_result),
            "Yes" if tc.is_edge_case else "No",
            "Yes" if tc.is_manual else "No",
            status_value,
            _sanitize_csv_cell(tc.refinement_notes or "")
        ])
    
    # Get the CSV content
    csv_content = output.getvalue()
    output.close()
    
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.csv"'
        }
    )




