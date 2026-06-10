"""Validation service for user-provided requirements content.

Runs a two-stage gate before any LLM generation call:

Stage 1 - Rule-based (always runs, zero cost):
  - Minimum length and word count
  - Alphabetic content ratio
  - Code-pattern detection

Stage 2 - LLM semantic check (skipped in mock mode):
  - Uses a cheap/fast model (gpt-4o-mini / claude-3-haiku) via instructor
  - Classifies whether the text is genuinely software requirements
  - Returns actionable issues and suggestions on failure
"""

import re
from functools import lru_cache
from typing import Literal, Optional

import instructor
from instructor.core import InstructorRetryException
from anthropic import Anthropic, APIError as AnthropicAPIError
from openai import OpenAI, OpenAIError
from pydantic import BaseModel

from config import get_settings
from exceptions import RequirementsValidationException, LLMServiceError
from logging_config import get_logger

logger = get_logger(__name__)

# Common code-file patterns that strongly suggest the input is source code
_CODE_LINE_PREFIXES = (
    "def ",
    "class ",
    "import ",
    "from ",
    "function ",
    "const ",
    "let ",
    "var ",
    "return ",
    "if (",
    "for (",
    "while (",
    "export ",
    "module.",
    "require(",
    "SELECT ",
    "INSERT ",
    "UPDATE ",
    "DELETE ",
    "#include",
    "public ",
    "private ",
    "protected ",
)

_VALIDATION_SYSTEM_PROMPT = """You are a requirements quality validator for a QA test-case generation tool.

Your job is to decide whether the provided text constitutes valid software or product requirements suitable for generating test cases.

Valid input includes:
- User stories ("As a user, I want to...")
- Acceptance criteria
- Feature descriptions in plain language
- Functional specifications
- API or behaviour descriptions

Invalid input includes:
- Raw source code (Python, JS, SQL, etc.)
- Random or gibberish text
- Off-topic content (recipes, essays, etc.)
- Content too vague to derive any test case from (e.g. "make it work")
- Placeholder text (lorem ipsum, etc.)

Return a structured assessment. Write issues and suggestions in plain, user-friendly language. Keep each issue and suggestion concise (one sentence).
"""

_VALIDATION_USER_TEMPLATE = """Assess the following text and determine whether it is valid software requirements:

---
{text}
---
"""


class RequirementsValidation(BaseModel):
    """Instructor response model for LLM-based requirements validation."""

    is_valid: bool
    input_type: Literal["requirements", "code", "random_text", "off_topic", "too_vague", "other"]
    issues: list[str]
    suggestions: list[str]


class ValidationService:
    """Two-stage validator for user-provided requirements text."""

    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[object] = None

    @property
    def client(self):
        """Lazy-load the instructor-wrapped LLM client for the cheap validation model."""
        if self._client is None:
            provider = self.settings.llm_provider
            if provider == "openai" and self.settings.openai_api_key:
                self._client = instructor.from_openai(
                    OpenAI(api_key=self.settings.openai_api_key, timeout=30.0)
                )
            elif provider == "anthropic" and self.settings.anthropic_api_key:
                self._client = instructor.from_anthropic(
                    Anthropic(api_key=self.settings.anthropic_api_key, timeout=30.0)
                )
            elif provider == "openrouter" and self.settings.openrouter_api_key:
                self._client = instructor.from_openai(
                    OpenAI(
                        api_key=self.settings.openrouter_api_key,
                        base_url="https://openrouter.ai/api/v1",
                        timeout=30.0,
                    )
                )
        return self._client

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def validate_requirements(self, text: str, skip_llm: bool = False) -> None:
        """Validate requirements text through both stages.

        Args:
            text: The raw requirements text to validate.
            skip_llm: When True, bypasses Stage 2 (LLM semantic check) but
                still enforces Stage 1 (rule-based checks). Useful when a user
                explicitly chooses to proceed despite the AI quality gate.

        Raises:
            RequirementsValidationException: if the text fails either stage,
                carrying user-friendly issues and suggestions.
        """
        if not self.settings.validation_enabled:
            logger.debug("Requirements validation disabled, skipping")
            return

        # Stage 1: rule-based checks (always enforced, never bypassable)
        rule_issues = self._check_rules(text)
        if rule_issues:
            logger.warning("Requirements failed rule-based validation: %s", rule_issues)
            raise RequirementsValidationException(
                issues=rule_issues,
                suggestions=self._rule_suggestions(rule_issues),
            )

        # Stage 2: LLM semantic check — can be bypassed by the caller
        if skip_llm:
            logger.info("LLM semantic validation skipped by request flag")
            return

        if self.settings.llm_provider == "mock" or self.client is None:
            logger.debug(
                "Skipping LLM validation (provider=%s, client=%s)",
                self.settings.llm_provider,
                "none" if self.client is None else "present",
            )
            return

        result = self._llm_validate(text)
        if not result.is_valid:
            logger.warning(
                "Requirements failed LLM semantic validation (type=%s): %s",
                result.input_type,
                result.issues,
            )
            raise RequirementsValidationException(
                issues=result.issues,
                suggestions=result.suggestions,
            )

    # ------------------------------------------------------------------
    # Stage 1: rule-based checks
    # ------------------------------------------------------------------

    def _check_rules(self, text: str) -> list[str]:
        """Run lightweight, free rule-based checks. Returns a list of issue strings."""
        issues: list[str] = []
        stripped = text.strip()

        if len(stripped) < self.settings.validation_min_chars:
            issues.append(
                f"Requirements are too short (minimum {self.settings.validation_min_chars} characters)."
            )

        words = stripped.split()
        if len(words) < self.settings.validation_min_words:
            issues.append(
                f"Requirements contain too few words (minimum {self.settings.validation_min_words} words)."
            )

        if stripped:
            alpha_ratio = sum(c.isalpha() for c in stripped) / len(stripped)
            if alpha_ratio < 0.3:
                issues.append(
                    "Input contains mostly non-text characters — requirements should be written in plain language."
                )

        if self._looks_like_code(stripped):
            issues.append(
                "Input appears to be source code rather than requirements — please describe the feature behaviour instead."
            )

        return issues

    def _looks_like_code(self, text: str) -> bool:
        """Return True if the majority of non-blank lines resemble code."""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if not lines:
            return False
        code_lines = sum(
            1 for ln in lines
            if any(ln.startswith(prefix) for prefix in _CODE_LINE_PREFIXES)
            or re.match(r"^[\w.]+\s*[=({\[<]", ln)  # assignment / function call patterns
        )
        return (code_lines / len(lines)) > 0.3

    def _rule_suggestions(self, issues: list[str]) -> list[str]:
        """Map rule issues to generic, actionable suggestions."""
        suggestions: list[str] = []
        combined = " ".join(issues).lower()
        if "too short" in combined or "too few words" in combined:
            suggestions.append(
                "Describe what the feature should do in plain language, including expected behaviour and any constraints."
            )
        if "non-text" in combined:
            suggestions.append(
                "Use natural language instead of symbols, numbers, or special characters."
            )
        if "source code" in combined:
            suggestions.append(
                "Write requirements in plain language — for example: 'The system should allow users to reset their password via email.'"
            )
        return suggestions or ["Provide clear, plain-language requirements that describe the expected feature behaviour."]

    # ------------------------------------------------------------------
    # Stage 2: LLM semantic check
    # ------------------------------------------------------------------

    def _llm_validate(self, text: str) -> RequirementsValidation:
        """Call a cheap LLM to semantically classify the requirements text."""
        model = {
            "openai": self.settings.openai_validation_model,
            "anthropic": self.settings.anthropic_validation_model,
            "openrouter": self.settings.openrouter_validation_model,
        }.get(self.settings.llm_provider, self.settings.openai_validation_model)
        logger.debug("Running LLM validation with model=%s", model)

        user_prompt = _VALIDATION_USER_TEMPLATE.format(text=text[:5000])

        try:
            if self.settings.llm_provider in ("openai", "openrouter"):
                return self.client.chat.completions.create(
                    model=model,
                    response_model=RequirementsValidation,
                    messages=[
                        {"role": "system", "content": _VALIDATION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_retries=2,
                )
            else:
                return self.client.messages.create(
                    model=model,
                    response_model=RequirementsValidation,
                    max_tokens=512,
                    messages=[
                        {"role": "user", "content": user_prompt},
                    ],
                    system=_VALIDATION_SYSTEM_PROMPT,
                )
        except InstructorRetryException as exc:
            logger.error("LLM validation failed to return valid structure: %s", exc)
            raise LLMServiceError("Validation service could not assess the requirements") from exc
        except (OpenAIError, AnthropicAPIError) as exc:
            logger.error("LLM validation API error: %s", exc, exc_info=True)
            raise LLMServiceError("Validation service temporarily unavailable") from exc


@lru_cache
def get_validation_service() -> ValidationService:
    """Cached ValidationService instance for dependency injection."""
    return ValidationService()
