"""LLM Service for generating and refining test cases using instructor library."""

import instructor
from instructor.core import InstructorRetryException
from openai import OpenAI, OpenAIError
from anthropic import Anthropic, APIError as AnthropicAPIError
from pydantic import BaseModel
from typing import Optional

from config import get_settings
from exceptions import LLMServiceError, LLMConfigurationError
from logging_config import get_logger
from models import TestCaseDraft, TestCaseRead, FeatureLinkType

logger = get_logger(__name__)


# Maximum characters for linked context to prevent prompt overflow
MAX_LINKED_REQUIREMENTS_CHARS = 2000
MAX_LINKED_TEST_CASE_CHARS = 1500


def sanitize_for_prompt(text: str, max_length: int = 10000) -> str:
    """
    Sanitize user input before including in LLM prompts.
    
    Protections:
    - Truncate to prevent token overflow
    - Escape markdown code blocks
    - Log potential prompt injection attempts
    """
    if not text:
        return ""
    
    # Truncate
    text = text[:max_length]
    
    # Escape code blocks that might confuse the LLM
    text = text.replace("```", "'''")
    
    # Log potential prompt injection attempts
    injection_markers = [
        "ignore previous instructions",
        "disregard above",
        "new instructions:",
        "system:",
        "assistant:",
    ]
    text_lower = text.lower()
    for marker in injection_markers:
        if marker in text_lower:
            logger.warning("Potential prompt injection detected: %s", marker)
    
    return text.strip()


class TestCaseList(BaseModel):
    """Pydantic model for strict LLM response validation."""
    test_cases: list[TestCaseDraft]


class RefinedTestCase(BaseModel):
    """Schema for refined test cases with notes."""
    title: str
    steps: list[str]
    expected_result: str
    is_edge_case: bool = False
    refinement_notes: Optional[str] = None
    is_new: bool = False  # Flag to indicate if this is a newly generated case


class RefinedTestCaseList(BaseModel):
    """Pydantic model for refined test suite response."""
    test_cases: list[RefinedTestCase]
    gap_analysis: str  # Summary of gaps found
    recommendations: list[str]  # Additional recommendations


class LLMService:
    """Service for AI-powered test case generation and refinement."""
    
    def __init__(self):
        self.settings = get_settings()
        self.provider = self.settings.llm_provider
        self._client = None
    
    @property
    def client(self):
        """Lazy-load the appropriate LLM client."""
        if self._client is None:
            if self.provider == "openai" and self.settings.openai_api_key:
                self._client = instructor.from_openai(
                    OpenAI(api_key=self.settings.openai_api_key, timeout=45.0)
                )
            elif self.provider == "anthropic" and self.settings.anthropic_api_key:
                self._client = instructor.from_anthropic(
                    Anthropic(api_key=self.settings.anthropic_api_key, timeout=45.0)
                )
            elif self.provider == "openrouter" and self.settings.openrouter_api_key:
                self._client = instructor.from_openai(
                    OpenAI(
                        api_key=self.settings.openrouter_api_key,
                        base_url="https://openrouter.ai/api/v1",
                        timeout=45.0,
                    )
                )
        return self._client
    
    def generate_initial_test_cases(
        self,
        requirements: str,
        template_content: Optional[str] = None,
        linked_context: Optional[str] = None,
        target_count: int = 10
    ) -> list[TestCaseDraft]:
        """
        Generate initial test cases from requirements using LLM.

        Args:
            requirements: Raw requirements text to analyze
            template_content: Optional template with system instructions
            linked_context: Optional formatted context from linked features/test cases
            target_count: Approximate number of test cases to generate (3-30)

        Returns:
            List of TestCaseDraft objects
        """
        logger.info("Generating test cases (provider: %s, target_count: %d)", self.provider, target_count)
        logger.debug("Requirements length: %d characters", len(requirements))
        if linked_context:
            logger.debug("Including linked context: %d characters", len(linked_context))

        # Use mock if no API key or explicitly set to mock
        if self.provider == "mock" or self.client is None:
            logger.info("Using mock test case generation")
            return self._generate_mock_test_cases(requirements, target_count=target_count)
        
        # Build the system prompt
        system_prompt = template_content or self._get_default_system_prompt()
        
        # Sanitize user inputs
        sanitized_requirements = sanitize_for_prompt(requirements)
        sanitized_context = sanitize_for_prompt(linked_context) if linked_context else ""
        
        # Build the user prompt with optional linked context
        context_section = ""
        if sanitized_context:
            context_section = f"""
{sanitized_context}

Use the above related context to inform your test case generation, but focus primarily on the requirements below.

---

"""
        
        user_prompt = f"""{context_section}Analyze the following requirements and generate approximately {target_count} comprehensive test cases.

Requirements:
{sanitized_requirements}

Generate test cases that cover:
1. Happy path scenarios (normal expected usage)
2. Edge cases (boundary conditions, empty inputs, etc.)
3. Error handling scenarios

For each test case, provide:
- A clear, descriptive title
- Step-by-step instructions
- Expected result

Mark edge cases with is_edge_case=True."""

        try:
            if self.provider in ("openai", "openrouter"):
                model = self.settings.openrouter_model if self.provider == "openrouter" else self.settings.openai_model
                response = self.client.chat.completions.create(
                    model=model,
                    response_model=TestCaseList,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ]
                )
            elif self.provider == "anthropic":
                response = self.client.messages.create(
                    model=self.settings.anthropic_model,
                    max_tokens=4096,
                    response_model=TestCaseList,
                    messages=[
                        {"role": "user", "content": f"{system_prompt}\n\n{user_prompt}"}
                    ]
                )
            else:
                # Should not reach here since we check for mock above
                raise LLMConfigurationError(f"Unknown LLM provider: {self.provider}")

            logger.info("Generated %d test cases via LLM", len(response.test_cases))
            return response.test_cases
            
        except (OpenAIError, AnthropicAPIError) as e:
            logger.error("LLM API error during test case generation: %s", e, exc_info=True)
            raise LLMServiceError(f"LLM API error: {type(e).__name__}") from e
        except InstructorRetryException as e:
            logger.error("LLM failed to produce valid response structure: %s", e, exc_info=True)
            raise LLMServiceError("AI failed to generate valid test case structure") from e
        except Exception as e:
            logger.error("Unexpected error during test case generation: %s", e, exc_info=True)
            raise LLMServiceError("Unexpected error during test case generation") from e

    def refine_test_suite(
        self,
        requirements: str,
        accepted_cases: list[TestCaseRead],
        template_content: Optional[str] = None,
        linked_context: Optional[str] = None,
        max_new_cases: int = 5
    ) -> list[TestCaseDraft]:
        """
        Refine an existing test suite by finding gaps and adding edge cases.

        Args:
            requirements: Original requirements text
            accepted_cases: List of accepted/manual test cases
            template_content: Optional template for styling consistency
            linked_context: Optional formatted context from linked features/test cases
            max_new_cases: Maximum number of new test cases to generate (1-15)

        Returns:
            List of new TestCaseDraft objects to add (edge cases and gap fillers)
        """
        logger.info("Refining test suite (provider: %s, existing cases: %d, max_new: %d)",
                    self.provider, len(accepted_cases), max_new_cases)
        if linked_context:
            logger.debug("Including linked context: %d characters", len(linked_context))

        # Use mock if no API key or explicitly set to mock
        if self.provider == "mock" or self.client is None:
            logger.info("Using mock refinement generation")
            return self._generate_mock_refinements(requirements, accepted_cases, max_new_cases=max_new_cases)
        
        # Format existing cases for the prompt
        existing_cases_text = self._format_existing_cases(accepted_cases)
        
        # Sanitize user inputs
        sanitized_requirements = sanitize_for_prompt(requirements)
        sanitized_context = sanitize_for_prompt(linked_context) if linked_context else ""
        
        # Build linked context section if available
        context_section = ""
        if sanitized_context:
            context_section = f"""
{sanitized_context}

Consider the above related context when identifying gaps, but focus primarily on the requirements below.

---

"""
        
        # Build the refinement system prompt
        system_prompt = """You are a Senior QA Lead specializing in test suite completeness and edge case discovery.

Your role is to analyze requirements against an existing test suite and identify gaps.

You must perform three critical tasks:

1. **Gap Analysis**: Find logic paths in the requirements that are NOT covered by the current test cases.

2. **Edge Case Injection**: Generate test cases for:
   - Boundary values (min/max limits, zero, negative numbers)
   - Empty states (empty strings, null values, empty arrays)
   - Network interruptions (timeout, connection loss, slow response)
   - Unauthorized access (missing auth, expired tokens, wrong permissions)
   - Concurrent operations (race conditions, duplicate submissions)

3. **Consistency Check**: Ensure all generated cases follow professional QA standards with:
   - Clear, action-oriented titles
   - Numbered, reproducible steps
   - Specific, measurable expected results

ONLY generate NEW test cases that are NOT already covered. Mark all new cases as edge cases (is_edge_case=true) and include a refinement_notes field explaining why this case is important."""

        user_prompt = f"""{context_section}## Original Requirements:
{sanitized_requirements}

## Currently Accepted Test Cases:
{existing_cases_text}

## Your Task:
Analyze the requirements and existing test cases. Generate at most {max_new_cases} new test cases covering the missing edge cases and gap-filling test cases. Do NOT duplicate existing coverage.

For each new test case:
- Set is_edge_case=true
- Include refinement_notes explaining why this case was added (e.g., "Covers boundary condition for maximum input length" or "Tests unauthorized access scenario")"""

        try:
            if self.provider in ("openai", "openrouter"):
                model = self.settings.openrouter_model if self.provider == "openrouter" else self.settings.openai_model
                response = self.client.chat.completions.create(
                    model=model,
                    response_model=TestCaseList,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ]
                )
            elif self.provider == "anthropic":
                response = self.client.messages.create(
                    model=self.settings.anthropic_model,
                    max_tokens=4096,
                    response_model=TestCaseList,
                    messages=[
                        {"role": "user", "content": f"{system_prompt}\n\n{user_prompt}"}
                    ]
                )
            else:
                # Should not reach here since we check for mock above
                raise LLMConfigurationError(f"Unknown LLM provider: {self.provider}")

            logger.info("Generated %d refinement cases via LLM", len(response.test_cases))
            return response.test_cases
            
        except (OpenAIError, AnthropicAPIError) as e:
            logger.error("LLM API error during test suite refinement: %s", e, exc_info=True)
            raise LLMServiceError(f"LLM API error: {type(e).__name__}") from e
        except InstructorRetryException as e:
            logger.error("LLM failed to produce valid response for refinement: %s", e, exc_info=True)
            raise LLMServiceError("AI failed to generate valid refinement structure") from e
        except Exception as e:
            logger.error("Unexpected error during test suite refinement: %s", e, exc_info=True)
            raise LLMServiceError("Unexpected error during test suite refinement") from e

    def _format_existing_cases(self, cases: list[TestCaseRead]) -> str:
        """Format existing test cases for the refinement prompt."""
        if not cases:
            return "No test cases currently exist."
        
        formatted = []
        for i, case in enumerate(cases, 1):
            steps_text = "\n".join(f"   {j}. {step}" for j, step in enumerate(case.steps, 1))
            case_text = f"""### Test Case {i}: {case.title}
**Steps:**
{steps_text}
**Expected Result:** {case.expected_result}
**Type:** {"Edge Case" if case.is_edge_case else "Standard"} | {"Manual" if case.is_manual else "AI-Generated"}
"""
            formatted.append(case_text)
        
        return "\n".join(formatted)
    
    def _get_default_system_prompt(self) -> str:
        """Get the default system prompt for test case generation."""
        return """You are an expert QA Engineer specializing in creating comprehensive test cases.
Your goal is to analyze requirements and generate well-structured test cases that:
- Cover all functional requirements
- Include edge cases and boundary conditions
- Consider error handling and negative scenarios
- Are clear, actionable, and reproducible

Always structure your response as a list of test cases with clear titles, steps, and expected results."""

    def format_linked_context(
        self,
        linked_features: list | None = None,
        linked_test_cases: list | None = None
    ) -> str:
        """
        Format linked features and test cases as context for LLM prompts.
        
        Args:
            linked_features: List of LinkedFeatureContext objects
            linked_test_cases: List of LinkedTestCaseContext objects
            
        Returns:
            Formatted string to append to prompts, or empty string if no context
        """
        if not linked_features and not linked_test_cases:
            return ""
        
        sections = []
        
        # Format linked features
        if linked_features:
            feature_parts = ["## Related Features Context\n"]
            feature_parts.append("The following features are related and may provide useful context:\n")
            
            for lf in linked_features:
                link_type_display = self._get_link_type_display(lf.link_type)
                requirements = lf.raw_requirements
                
                # Truncate if too long
                if len(requirements) > MAX_LINKED_REQUIREMENTS_CHARS:
                    requirements = requirements[:MAX_LINKED_REQUIREMENTS_CHARS] + "... [truncated]"
                
                feature_parts.append(f"### {lf.title} ({link_type_display})")
                if lf.notes:
                    feature_parts.append(f"*Relationship notes: {lf.notes}*")
                feature_parts.append(f"```\n{requirements}\n```\n")
            
            sections.append("\n".join(feature_parts))
        
        # Format linked test cases
        if linked_test_cases:
            tc_parts = ["## Referenced Test Cases\n"]
            tc_parts.append("The following test cases from other features may be relevant:\n")
            
            for ltc in linked_test_cases:
                steps_text = "\n".join(f"   {i}. {step}" for i, step in enumerate(ltc.steps, 1))
                
                # Truncate if too long
                if len(steps_text) > MAX_LINKED_TEST_CASE_CHARS:
                    steps_text = steps_text[:MAX_LINKED_TEST_CASE_CHARS] + "\n   ... [truncated]"
                
                tc_parts.append(f"### {ltc.title}")
                tc_parts.append(f"*From feature: {ltc.feature_title}*")
                if ltc.notes:
                    tc_parts.append(f"*Notes: {ltc.notes}*")
                tc_parts.append(f"**Steps:**\n{steps_text}")
                tc_parts.append(f"**Expected Result:** {ltc.expected_result}\n")
            
            sections.append("\n".join(tc_parts))
        
        return "\n\n".join(sections)
    
    def _get_link_type_display(self, link_type: FeatureLinkType) -> str:
        """Get a human-readable display name for a link type."""
        display_map = {
            FeatureLinkType.RELATES_TO: "relates to",
            FeatureLinkType.DEPENDS_ON: "depends on",
            FeatureLinkType.BLOCKS: "blocks",
            FeatureLinkType.PARENT_OF: "parent of",
            FeatureLinkType.CHILD_OF: "child of",
        }
        return display_map.get(link_type, link_type.value)

    def _generate_mock_test_cases(self, requirements: str, target_count: int = 10) -> list[TestCaseDraft]:
        """Generate mock test cases for development without API key."""

        # Parse requirements to generate contextual mocks
        req_lower = requirements.lower()
        test_cases = []

        # Generate contextual test cases based on keywords
        if "login" in req_lower or "auth" in req_lower:
            test_cases.extend([
                TestCaseDraft(
                    title="Verify successful login with valid credentials",
                    steps=[
                        "Navigate to the login page",
                        "Enter valid username in the username field",
                        "Enter valid password in the password field",
                        "Click the 'Login' button"
                    ],
                    expected_result="User is successfully logged in and redirected to the dashboard",
                    is_edge_case=False
                ),
                TestCaseDraft(
                    title="Verify error message with invalid credentials",
                    steps=[
                        "Navigate to the login page",
                        "Enter invalid username",
                        "Enter invalid password",
                        "Click the 'Login' button"
                    ],
                    expected_result="Error message 'Invalid credentials' is displayed",
                    is_edge_case=False
                ),
                TestCaseDraft(
                    title="Verify login with empty fields",
                    steps=[
                        "Navigate to the login page",
                        "Leave username field empty",
                        "Leave password field empty",
                        "Click the 'Login' button"
                    ],
                    expected_result="Validation error messages appear for both fields",
                    is_edge_case=True
                ),
            ])

        if "search" in req_lower:
            test_cases.extend([
                TestCaseDraft(
                    title="Verify search with valid query returns results",
                    steps=[
                        "Navigate to the search page",
                        "Enter a valid search term",
                        "Click the 'Search' button"
                    ],
                    expected_result="Search results matching the query are displayed",
                    is_edge_case=False
                ),
                TestCaseDraft(
                    title="Verify search with no matching results",
                    steps=[
                        "Navigate to the search page",
                        "Enter a search term with no matching results",
                        "Click the 'Search' button"
                    ],
                    expected_result="'No results found' message is displayed",
                    is_edge_case=True
                ),
            ])

        if "form" in req_lower or "submit" in req_lower:
            test_cases.extend([
                TestCaseDraft(
                    title="Verify form submission with valid data",
                    steps=[
                        "Navigate to the form page",
                        "Fill in all required fields with valid data",
                        "Click the 'Submit' button"
                    ],
                    expected_result="Form is submitted successfully and confirmation is shown",
                    is_edge_case=False
                ),
                TestCaseDraft(
                    title="Verify form validation for required fields",
                    steps=[
                        "Navigate to the form page",
                        "Leave required fields empty",
                        "Click the 'Submit' button"
                    ],
                    expected_result="Validation errors are displayed for empty required fields",
                    is_edge_case=True
                ),
            ])

        # Default generic test cases if no keywords matched
        if not test_cases:
            test_cases = [
                TestCaseDraft(
                    title="Verify primary functionality works as expected",
                    steps=[
                        "Navigate to the main feature page",
                        "Perform the primary action described in requirements",
                        "Observe the system response"
                    ],
                    expected_result="System behaves according to the specified requirements",
                    is_edge_case=False
                ),
                TestCaseDraft(
                    title="Verify system handles invalid input gracefully",
                    steps=[
                        "Navigate to the input area",
                        "Enter invalid or unexpected data",
                        "Attempt to proceed with the action"
                    ],
                    expected_result="System displays appropriate error message without crashing",
                    is_edge_case=True
                ),
                TestCaseDraft(
                    title="Verify boundary conditions are handled",
                    steps=[
                        "Identify the boundary values for inputs",
                        "Test with minimum allowed values",
                        "Test with maximum allowed values"
                    ],
                    expected_result="System correctly handles boundary values",
                    is_edge_case=True
                ),
                TestCaseDraft(
                    title="Verify UI elements are correctly displayed",
                    steps=[
                        "Navigate to the feature page",
                        "Verify all UI elements are visible",
                        "Check element labels and placeholders"
                    ],
                    expected_result="All UI elements are correctly displayed with proper labels",
                    is_edge_case=False
                ),
            ]

        return test_cases[:target_count]

    def _generate_mock_refinements(
        self,
        requirements: str,
        accepted_cases: list[TestCaseRead],
        max_new_cases: int = 5
    ) -> list[TestCaseDraft]:
        """Generate mock refinement cases for development without API key."""
        
        req_lower = requirements.lower()
        refinements = []
        
        # Always add some edge cases based on the requirements
        refinements.append(TestCaseDraft(
            title="Verify behavior with network timeout",
            steps=[
                "Simulate a network timeout condition",
                "Attempt to perform the main action",
                "Observe error handling"
            ],
            expected_result="System displays a user-friendly timeout message and allows retry",
            is_edge_case=True,
            refinement_notes="Gap Analysis: Network failure scenarios were not covered in the original test suite."
        ))
        
        refinements.append(TestCaseDraft(
            title="Verify unauthorized access is blocked",
            steps=[
                "Attempt to access the feature without authentication",
                "Try to bypass authentication using direct URL",
                "Observe system response"
            ],
            expected_result="System redirects to login page or shows 'Access Denied' message",
            is_edge_case=True,
            refinement_notes="Security: Unauthorized access scenarios must be tested for all protected features."
        ))
        
        # Add context-specific refinements
        if "password" in req_lower or "login" in req_lower:
            refinements.extend([
                TestCaseDraft(
                    title="Verify account lockout after maximum failed attempts",
                    steps=[
                        "Navigate to login page",
                        "Enter incorrect password 5 times consecutively",
                        "Attempt to login with correct password"
                    ],
                    expected_result="Account is locked and user is informed of the lockout duration",
                    is_edge_case=True,
                    refinement_notes="Security: Brute force protection is critical for authentication systems."
                ),
                TestCaseDraft(
                    title="Verify SQL injection prevention in login fields",
                    steps=[
                        "Navigate to login page",
                        "Enter SQL injection payload in username field: ' OR '1'='1",
                        "Enter any password and submit"
                    ],
                    expected_result="Login fails with generic error message; no database error exposed",
                    is_edge_case=True,
                    refinement_notes="Security: SQL injection is a critical vulnerability that must be tested."
                ),
            ])
        
        if "input" in req_lower or "field" in req_lower or "form" in req_lower:
            refinements.extend([
                TestCaseDraft(
                    title="Verify maximum input length is enforced",
                    steps=[
                        "Navigate to the input field",
                        "Paste text exceeding the maximum allowed characters",
                        "Attempt to submit"
                    ],
                    expected_result="Input is truncated or validation error is shown",
                    is_edge_case=True,
                    refinement_notes="Boundary Analysis: Maximum length boundaries must be tested."
                ),
                TestCaseDraft(
                    title="Verify special characters are handled correctly",
                    steps=[
                        "Enter special characters: <script>alert('xss')</script>",
                        "Submit the form",
                        "View the stored/displayed data"
                    ],
                    expected_result="Special characters are escaped; no script execution occurs",
                    is_edge_case=True,
                    refinement_notes="Security: XSS prevention testing is mandatory for all user inputs."
                ),
            ])
        
        # Add concurrent operation test if not obviously covered
        if len(accepted_cases) > 0:
            refinements.append(TestCaseDraft(
                title="Verify concurrent operation handling",
                steps=[
                    "Open the feature in two browser tabs",
                    "Perform the same action simultaneously in both tabs",
                    "Check the final state of the data"
                ],
                expected_result="System handles concurrent operations gracefully without data corruption",
                is_edge_case=True,
                refinement_notes="Race Condition: Concurrent operations must be tested to prevent data integrity issues."
            ))

        # Trim to max_new_cases
        return refinements[:max_new_cases]


from functools import lru_cache


@lru_cache
def get_llm_service() -> LLMService:
    """Get cached LLM service instance."""
    logger.debug("Initializing LLM service with provider: %s", get_settings().llm_provider)
    return LLMService()
