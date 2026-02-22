"""Repository pattern implementation for data access layer."""

from repositories.base import BaseRepository
from repositories.feature_repository import FeatureRepository, get_feature_repository
from repositories.test_case_repository import TestCaseRepository, get_test_case_repository
from repositories.template_repository import TemplateRepository, get_template_repository

__all__ = [
    "BaseRepository",
    "FeatureRepository",
    "get_feature_repository",
    "TestCaseRepository",
    "get_test_case_repository",
    "TemplateRepository",
    "get_template_repository",
]




