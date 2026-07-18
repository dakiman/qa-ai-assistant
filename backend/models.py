"""SQLModel models for QA-Craft."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlalchemy import DateTime, UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from pydantic import field_validator
import json


def _ensure_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Treat naive datetimes as UTC.

    SQLite strips tzinfo on read, so a value stored as aware comes back naive.
    Attaching UTC here guarantees JSON serialization carries a ``+00:00`` offset
    and clients don't render timestamps in their own local timezone.
    """
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


# Timezone-aware column type for every created_at field. On Postgres this maps
# to TIMESTAMP WITH TIME ZONE; on SQLite it is stored as text (tz stripped on
# read, re-attached by _ensure_utc in the read schemas).


class TestCaseStatus(str, Enum):
    """Status of a test case in the curation workflow."""
    DRAFT = "draft"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class FeatureLinkType(str, Enum):
    """Type of relationship between features."""
    RELATES_TO = "relates_to"
    DEPENDS_ON = "depends_on"
    BLOCKS = "blocks"
    PARENT_OF = "parent_of"
    CHILD_OF = "child_of"
    
    @classmethod
    def get_inverse(cls, link_type: "FeatureLinkType") -> "FeatureLinkType":
        """Get the inverse link type for bidirectional relationships."""
        inverse_map = {
            cls.RELATES_TO: cls.RELATES_TO,  # Symmetric
            cls.DEPENDS_ON: cls.BLOCKS,
            cls.BLOCKS: cls.DEPENDS_ON,
            cls.PARENT_OF: cls.CHILD_OF,
            cls.CHILD_OF: cls.PARENT_OF,
        }
        return inverse_map[link_type]


# ============== Feature Models ==============

class FeatureBase(SQLModel):
    """Base Feature model with shared fields."""
    title: str = Field(index=True)
    description: Optional[str] = None
    raw_requirements: str


class Feature(FeatureBase, table=True):
    """Feature database model."""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    generation_count: int = Field(default=0)
    refinement_count: int = Field(default=0)

    # Relationships
    # cascade_delete=True: deleting a Feature removes its TestCases (ORM-level),
    # so DELETE /features/{id} no longer 500s trying to null a NOT NULL FK.
    test_cases: list["TestCase"] = Relationship(
        back_populates="feature",
        cascade_delete=True,
    )


class FeatureCreate(FeatureBase):
    """Schema for creating a Feature."""
    # Length caps on the API schema only (not FeatureBase/Feature) so this
    # doesn't touch the table column type and doesn't need a migration.
    title: str = Field(index=True, max_length=300)
    description: Optional[str] = Field(default=None, max_length=5000)
    raw_requirements: str = Field(max_length=20000)
    skip_llm_validation: bool = False


class FeatureRead(FeatureBase):
    """Schema for reading a Feature."""
    id: int
    created_at: datetime
    generation_count: int = 0
    refinement_count: int = 0

    @field_validator("created_at")
    @classmethod
    def _normalize_created_at(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class FeatureUpdate(SQLModel):
    """Schema for updating a Feature."""
    title: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=5000)
    raw_requirements: Optional[str] = Field(default=None, max_length=20000)
    skip_llm_validation: bool = False


# ============== Feature Link Models ==============

class FeatureLink(SQLModel, table=True):
    """Link between two features with a typed relationship."""
    __tablename__ = "feature_link"
    # One link per ordered (source, target) pair — the app already treats a pair
    # as unique (check_feature_link_exists ignores type), so this makes the DB
    # the source of truth and closes the create TOCTOU (M7).
    __table_args__ = (
        UniqueConstraint(
            "source_feature_id", "target_feature_id", name="uq_feature_link_pair"
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    # ondelete=CASCADE mirrors the migration FK metadata so autogenerate and
    # create_all-based test schemas agree with the deployed schema (M12).
    source_feature_id: int = Field(
        foreign_key="feature.id", index=True, ondelete="CASCADE"
    )
    target_feature_id: int = Field(
        foreign_key="feature.id", index=True, ondelete="CASCADE"
    )
    link_type: FeatureLinkType
    notes: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


class FeatureLinkCreate(SQLModel):
    """Schema for creating a feature link."""
    target_feature_id: int
    link_type: FeatureLinkType
    notes: Optional[str] = Field(default=None, max_length=1000)


class FeatureLinkRead(SQLModel):
    """Schema for reading a feature link."""
    id: int
    source_feature_id: int
    target_feature_id: int
    link_type: FeatureLinkType
    notes: Optional[str]
    created_at: datetime
    # Include target feature info for display
    target_feature_title: Optional[str] = None

    @field_validator("created_at")
    @classmethod
    def _normalize_created_at(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


# ============== Test Case Link Models ==============

class TestCaseLink(SQLModel, table=True):
    """Link from a feature to a test case from another feature."""
    __tablename__ = "test_case_link"
    # One link per (feature, test_case) pair — closes the create TOCTOU (M7).
    __table_args__ = (
        UniqueConstraint(
            "feature_id", "test_case_id", name="uq_test_case_link_pair"
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    # ondelete=CASCADE mirrors the migration FK metadata (M12).
    feature_id: int = Field(
        foreign_key="feature.id", index=True, ondelete="CASCADE"
    )
    test_case_id: int = Field(
        foreign_key="testcase.id", index=True, ondelete="CASCADE"
    )
    notes: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


class TestCaseLinkCreate(SQLModel):
    """Schema for creating a test case link."""
    test_case_id: int
    notes: Optional[str] = Field(default=None, max_length=1000)


class TestCaseLinkRead(SQLModel):
    """Schema for reading a test case link."""
    id: int
    feature_id: int
    test_case_id: int
    notes: Optional[str]
    created_at: datetime
    # Include test case info for display
    test_case_title: Optional[str] = None
    test_case_feature_id: Optional[int] = None
    test_case_feature_title: Optional[str] = None

    @field_validator("created_at")
    @classmethod
    def _normalize_created_at(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


# ============== Combined Links Response ==============

class FeatureLinksResponse(SQLModel):
    """Response containing all links for a feature."""
    feature_id: int
    feature_links: list[FeatureLinkRead]
    test_case_links: list[TestCaseLinkRead]


# ============== Template Models ==============

class TemplateBase(SQLModel):
    """Base Template model with shared fields."""
    name: str = Field(index=True, unique=True, max_length=200)
    # Capped: template instructions become the LLM system prompt, so an
    # unbounded value is both a token-cost and prompt-injection surface (L15).
    system_instructions: str = Field(max_length=10000)


class Template(TemplateBase, table=True):
    """Template database model."""
    id: Optional[int] = Field(default=None, primary_key=True)


class TemplateCreate(TemplateBase):
    """Schema for creating a Template."""
    pass


class TemplateRead(TemplateBase):
    """Schema for reading a Template."""
    id: int


class TemplateUpdate(SQLModel):
    """Schema for updating a Template."""
    # Re-cap to match TemplateBase — a PATCH previously bypassed the caps
    # TemplateBase enforces on create (L15's protection had a PATCH-shaped hole).
    name: Optional[str] = Field(default=None, max_length=200)
    system_instructions: Optional[str] = Field(default=None, max_length=10000)


# ============== TestCase Models ==============

# Bounds for step lists on the API schemas only (the table column stores
# steps as a single JSON-encoded string, so these are enforced in Pydantic,
# not via a column length that would need a migration).
MAX_TEST_CASE_STEPS = 50
MAX_TEST_CASE_STEP_LENGTH = 2000


def _validate_test_case_steps(steps: list[str]) -> list[str]:
    """Shared bounds check for TestCaseCreate/TestCaseUpdate.steps."""
    if len(steps) > MAX_TEST_CASE_STEPS:
        raise ValueError(f"steps cannot exceed {MAX_TEST_CASE_STEPS} items")
    for step in steps:
        if len(step) > MAX_TEST_CASE_STEP_LENGTH:
            raise ValueError(f"each step must be at most {MAX_TEST_CASE_STEP_LENGTH} characters")
    return steps


class TestCaseBase(SQLModel):
    """Base TestCase model with shared fields."""
    title: str
    steps: str = Field(default="[]")  # JSON string for list of steps
    expected_result: str
    is_edge_case: bool = Field(default=False)
    is_manual: bool = Field(default=False)  # Track user-created cases
    refinement_notes: Optional[str] = Field(default=None)  # AI explanation
    status: TestCaseStatus = Field(default=TestCaseStatus.DRAFT)
    
    @property
    def steps_list(self) -> list[str]:
        """Get steps as a Python list."""
        try:
            return json.loads(self.steps)
        except json.JSONDecodeError:
            return []
    
    @steps_list.setter
    def steps_list(self, value: list[str]) -> None:
        """Set steps from a Python list."""
        self.steps = json.dumps(value)


class TestCase(TestCaseBase, table=True):
    """TestCase database model."""
    id: Optional[int] = Field(default=None, primary_key=True)
    # Indexed: this is the hottest FK in the schema — every list/export/refine
    # query filters test cases by feature_id (L7).
    feature_id: int = Field(foreign_key="feature.id", index=True)

    # Relationships
    feature: Optional[Feature] = Relationship(back_populates="test_cases")


class TestCaseCreate(SQLModel):
    """Schema for creating a TestCase."""
    title: str = Field(max_length=500)
    steps: list[str]  # Accept as list, convert to JSON
    expected_result: str = Field(max_length=5000)
    is_edge_case: bool = False
    is_manual: bool = False
    refinement_notes: Optional[str] = None
    status: TestCaseStatus = TestCaseStatus.DRAFT
    feature_id: int

    @field_validator("steps")
    @classmethod
    def _check_steps(cls, v: list[str]) -> list[str]:
        return _validate_test_case_steps(v)


class TestCaseRead(SQLModel):
    """Schema for reading a TestCase."""
    id: int
    title: str
    steps: list[str]  # Return as list
    expected_result: str
    is_edge_case: bool
    is_manual: bool
    refinement_notes: Optional[str]
    status: TestCaseStatus
    feature_id: int
    
    @classmethod
    def from_orm_model(cls, test_case: TestCase) -> "TestCaseRead":
        """Convert ORM model to read schema."""
        return cls(
            id=test_case.id,
            title=test_case.title,
            steps=test_case.steps_list,
            expected_result=test_case.expected_result,
            is_edge_case=test_case.is_edge_case,
            is_manual=test_case.is_manual,
            refinement_notes=test_case.refinement_notes,
            status=test_case.status,
            feature_id=test_case.feature_id
        )


class TestCaseUpdate(SQLModel):
    """Schema for updating a TestCase."""
    title: Optional[str] = Field(default=None, max_length=500)
    steps: Optional[list[str]] = None
    expected_result: Optional[str] = Field(default=None, max_length=5000)
    is_edge_case: Optional[bool] = None
    is_manual: Optional[bool] = None
    refinement_notes: Optional[str] = None
    status: Optional[TestCaseStatus] = None

    @field_validator("steps")
    @classmethod
    def _check_steps(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        return _validate_test_case_steps(v)


# ============== LLM Response Schemas ==============

class TestCaseDraft(SQLModel):
    """Schema for LLM-generated test case drafts."""
    title: str
    steps: list[str]
    expected_result: str
    is_edge_case: bool = False
    refinement_notes: Optional[str] = None


class GenerateRequest(SQLModel):
    """Request schema for test case generation."""
    feature_id: int
    template_id: Optional[int] = None
    skip_llm_validation: bool = False
    target_count: int = Field(default=10, ge=3, le=30)
    force_regenerate: bool = False


class GenerateResponse(SQLModel):
    """Response schema for test case generation."""
    feature_id: int
    test_cases: list[TestCaseDraft]
    message: str


# ============== Refinement Schemas ==============

class RefinementRequest(SQLModel):
    """Request schema for test suite refinement."""
    feature_id: int
    template_id: Optional[int] = None
    max_new_cases: int = Field(default=5, ge=1, le=15)


class RefinementResponse(SQLModel):
    """Response schema for test suite refinement."""
    feature_id: int
    original_count: int
    new_count: int  # Count of newly-added cases (== edge_cases_added)
    edge_cases_added: int
    refinement_count: int = 0
    test_cases: list[TestCaseRead]
    message: str


class BulkStatusUpdate(SQLModel):
    """Schema for bulk status updates."""
    test_case_ids: list[int]
    status: TestCaseStatus
