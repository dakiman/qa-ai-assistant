"""Repository for feature and test case link operations."""

from typing import Optional, Sequence
from dataclasses import dataclass
from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from database import get_session
from exceptions import ResourceConflictError
from logging_config import get_logger
from models import (
    Feature,
    TestCase,
    FeatureLink,
    FeatureLinkType,
    FeatureLinkRead,
    TestCaseLink,
    TestCaseLinkRead,
)

logger = get_logger(__name__)


@dataclass
class LinkedFeatureContext:
    """Context from a linked feature for LLM prompts."""
    feature_id: int
    title: str
    link_type: FeatureLinkType
    raw_requirements: str
    notes: Optional[str] = None


@dataclass
class LinkedTestCaseContext:
    """Context from a linked test case for LLM prompts."""
    test_case_id: int
    title: str
    steps: list[str]
    expected_result: str
    feature_title: str
    notes: Optional[str] = None


@dataclass
class AggregatedLinkContext:
    """Aggregated context from all links for LLM prompts."""
    linked_features: list[LinkedFeatureContext]
    linked_test_cases: list[LinkedTestCaseContext]


class LinkRepository:
    """Repository for managing feature and test case links."""
    
    def __init__(self, session: Session):
        """Initialize with database session."""
        self.session = session
    
    # ============== Feature Links ==============
    
    def create_feature_link(
        self,
        source_feature_id: int,
        target_feature_id: int,
        link_type: FeatureLinkType,
        notes: Optional[str] = None
    ) -> FeatureLink:
        """
        Create a feature-to-feature link with bidirectional relationship.
        
        Args:
            source_feature_id: ID of the source feature
            target_feature_id: ID of the target feature
            link_type: Type of relationship
            notes: Optional notes about the relationship
            
        Returns:
            The created link (source -> target direction)
        """
        # Create the primary link
        primary_link = FeatureLink(
            source_feature_id=source_feature_id,
            target_feature_id=target_feature_id,
            link_type=link_type,
            notes=notes
        )

        # Create the inverse link for bidirectionality
        inverse_type = FeatureLinkType.get_inverse(link_type)
        inverse_link = FeatureLink(
            source_feature_id=target_feature_id,
            target_feature_id=source_feature_id,
            link_type=inverse_type,
            notes=notes
        )

        try:
            # A SAVEPOINT (begin_nested), not a full session.rollback(): a
            # duplicate-link 409 must only discard this insert, not the rest
            # of the request's unit of work — a bare session.rollback() here
            # would silently drop everything else the handler had staged in
            # the same transaction (a lost-work hazard, not just this insert).
            with self.session.begin_nested():
                self.session.add(primary_link)
                self.session.add(inverse_link)
                self.session.flush()
        except IntegrityError:
            # The unique (source, target) constraint fired — another request
            # created the same pair between our existence check and this flush
            # (TOCTOU). Surface it as a clean 409 instead of a 500.
            raise ResourceConflictError(
                "Link between these features already exists"
            )
        self.session.refresh(primary_link)

        logger.info(
            "Created feature link: %d -[%s]-> %d (with inverse)",
            source_feature_id, link_type.value, target_feature_id
        )

        return primary_link
    
    def get_feature_link(self, link_id: int) -> Optional[FeatureLink]:
        """Get a feature link by ID."""
        return self.session.get(FeatureLink, link_id)
    
    def get_feature_links(self, feature_id: int) -> list[FeatureLinkRead]:
        """
        Get all feature links where the feature is the source.
        
        Args:
            feature_id: ID of the feature
            
        Returns:
            List of feature links with target feature titles populated
        """
        statement = (
            select(FeatureLink, Feature.title)
            .join(Feature, Feature.id == FeatureLink.target_feature_id)
            .where(FeatureLink.source_feature_id == feature_id)
        )
        results = self.session.exec(statement).all()
        
        return [
            FeatureLinkRead(
                id=link.id,
                source_feature_id=link.source_feature_id,
                target_feature_id=link.target_feature_id,
                link_type=link.link_type,
                notes=link.notes,
                created_at=link.created_at,
                target_feature_title=title
            )
            for link, title in results
        ]
    
    def delete_feature_link(self, link: FeatureLink) -> None:
        """
        Delete a feature link and its inverse.
        
        Args:
            link: The link to delete
        """
        # Find and delete EVERY matching inverse link, not just the first.
        # A pre-constraint duplicate would otherwise leave a dangling inverse row
        # that makes check_feature_link_exists return true forever (M7).
        inverse_type = FeatureLinkType.get_inverse(link.link_type)
        inverse_statement = select(FeatureLink).where(
            FeatureLink.source_feature_id == link.target_feature_id,
            FeatureLink.target_feature_id == link.source_feature_id,
            FeatureLink.link_type == inverse_type
        )
        for inverse_link in self.session.exec(inverse_statement).all():
            self.session.delete(inverse_link)

        # Delete the primary link
        self.session.delete(link)
        self.session.flush()

        logger.info(
            "Deleted feature link: %d -[%s]-> %d (with inverse)",
            link.source_feature_id, link.link_type.value, link.target_feature_id
        )
    
    def check_feature_link_exists(
        self,
        source_feature_id: int,
        target_feature_id: int
    ) -> bool:
        """Check if a link already exists between two features."""
        statement = select(FeatureLink).where(
            FeatureLink.source_feature_id == source_feature_id,
            FeatureLink.target_feature_id == target_feature_id
        )
        return self.session.exec(statement).first() is not None
    
    # ============== Test Case Links ==============
    
    def create_test_case_link(
        self,
        feature_id: int,
        test_case_id: int,
        notes: Optional[str] = None
    ) -> TestCaseLink:
        """
        Create a feature-to-test-case link.
        
        Args:
            feature_id: ID of the feature referencing the test case
            test_case_id: ID of the test case being referenced
            notes: Optional notes about why this test case is relevant
            
        Returns:
            The created link
        """
        link = TestCaseLink(
            feature_id=feature_id,
            test_case_id=test_case_id,
            notes=notes
        )
        try:
            # SAVEPOINT instead of session.rollback() — see create_feature_link
            # for why a full rollback here is a lost-work hazard.
            with self.session.begin_nested():
                self.session.add(link)
                self.session.flush()
        except IntegrityError:
            # Unique (feature, test_case) constraint fired — concurrent create.
            raise ResourceConflictError(
                "Link to this test case already exists"
            )
        self.session.refresh(link)

        logger.info("Created test case link: feature %d -> test case %d", feature_id, test_case_id)

        return link
    
    def get_test_case_link(self, link_id: int) -> Optional[TestCaseLink]:
        """Get a test case link by ID."""
        return self.session.get(TestCaseLink, link_id)
    
    def get_test_case_links(self, feature_id: int) -> list[TestCaseLinkRead]:
        """
        Get all test case links for a feature.
        
        Args:
            feature_id: ID of the feature
            
        Returns:
            List of test case links with test case info populated
        """
        statement = (
            select(TestCaseLink, TestCase, Feature.title)
            .join(TestCase, TestCase.id == TestCaseLink.test_case_id)
            .join(Feature, Feature.id == TestCase.feature_id)
            .where(TestCaseLink.feature_id == feature_id)
        )
        results = self.session.exec(statement).all()
        
        return [
            TestCaseLinkRead(
                id=link.id,
                feature_id=link.feature_id,
                test_case_id=link.test_case_id,
                notes=link.notes,
                created_at=link.created_at,
                test_case_title=test_case.title,
                test_case_feature_id=test_case.feature_id,
                test_case_feature_title=feature_title
            )
            for link, test_case, feature_title in results
        ]
    
    def delete_test_case_link(self, link: TestCaseLink) -> None:
        """Delete a test case link."""
        self.session.delete(link)
        self.session.flush()

        logger.info("Deleted test case link: feature %d -> test case %d", link.feature_id, link.test_case_id)
    
    def check_test_case_link_exists(
        self,
        feature_id: int,
        test_case_id: int
    ) -> bool:
        """Check if a link already exists from feature to test case."""
        statement = select(TestCaseLink).where(
            TestCaseLink.feature_id == feature_id,
            TestCaseLink.test_case_id == test_case_id
        )
        return self.session.exec(statement).first() is not None
    
    # ============== Cascade Cleanup ==============

    def delete_all_for_feature(self, feature_id: int) -> None:
        """
        Delete every link that references a feature, in either direction.

        Called before deleting a feature so no dangling link rows survive
        (SQLite FK cascade is only enabled at runtime via PRAGMA, and it does
        not cover feature-link rows where this feature is the *target*).

        Removes:
        - FeatureLink rows where the feature is source or target
        - TestCaseLink rows owned by the feature
        - TestCaseLink rows referencing any of the feature's own test cases
        """
        feature_links = self.session.exec(
            select(FeatureLink).where(
                (FeatureLink.source_feature_id == feature_id)
                | (FeatureLink.target_feature_id == feature_id)
            )
        ).all()
        for link in feature_links:
            self.session.delete(link)

        owned_tc_links = self.session.exec(
            select(TestCaseLink).where(TestCaseLink.feature_id == feature_id)
        ).all()
        for link in owned_tc_links:
            self.session.delete(link)

        referencing_tc_links = self.session.exec(
            select(TestCaseLink)
            .join(TestCase, TestCase.id == TestCaseLink.test_case_id)
            .where(TestCase.feature_id == feature_id)
        ).all()
        for link in referencing_tc_links:
            self.session.delete(link)

        self.session.flush()

        logger.info("Deleted all links referencing feature %d", feature_id)

    # ============== Context Aggregation for LLM ==============
    
    def get_linked_context(
        self,
        feature_id: int,
        max_features: int = 5,
        max_test_cases: int = 10
    ) -> AggregatedLinkContext:
        """
        Get aggregated context from all links for LLM prompts.
        
        Args:
            feature_id: ID of the feature to get context for
            max_features: Maximum number of linked features to include
            max_test_cases: Maximum number of linked test cases to include
            
        Returns:
            Aggregated context with linked features and test cases
        """
        # Get linked features with their requirements
        feature_statement = (
            select(FeatureLink, Feature)
            .join(Feature, Feature.id == FeatureLink.target_feature_id)
            .where(FeatureLink.source_feature_id == feature_id)
            .limit(max_features)
        )
        feature_results = self.session.exec(feature_statement).all()
        
        linked_features = [
            LinkedFeatureContext(
                feature_id=feature.id,
                title=feature.title,
                link_type=link.link_type,
                raw_requirements=feature.raw_requirements,
                notes=link.notes
            )
            for link, feature in feature_results
        ]
        
        # Get linked test cases with their details
        test_case_statement = (
            select(TestCaseLink, TestCase, Feature.title)
            .join(TestCase, TestCase.id == TestCaseLink.test_case_id)
            .join(Feature, Feature.id == TestCase.feature_id)
            .where(TestCaseLink.feature_id == feature_id)
            .limit(max_test_cases)
        )
        test_case_results = self.session.exec(test_case_statement).all()
        
        linked_test_cases = [
            LinkedTestCaseContext(
                test_case_id=test_case.id,
                title=test_case.title,
                steps=test_case.steps_list,
                expected_result=test_case.expected_result,
                feature_title=feature_title,
                notes=link.notes
            )
            for link, test_case, feature_title in test_case_results
        ]
        
        logger.debug(
            "Retrieved context for feature %d: %d linked features, %d linked test cases",
            feature_id, len(linked_features), len(linked_test_cases)
        )
        
        return AggregatedLinkContext(
            linked_features=linked_features,
            linked_test_cases=linked_test_cases
        )


def get_link_repository(
    session: Session = Depends(get_session)
) -> LinkRepository:
    """FastAPI dependency for LinkRepository."""
    return LinkRepository(session)



