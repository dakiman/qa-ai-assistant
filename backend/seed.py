"""Database seeding functions for QA-Craft."""

from sqlmodel import Session, select

from database import engine
from models import Template


def seed_default_templates() -> bool:
    """
    Seed default templates if none exist in the database.
    
    Uses proper context management for session handling.
    
    Returns:
        bool: True if templates were seeded, False if they already existed.
    """
    with Session(engine) as session:
        existing_template = session.exec(select(Template)).first()
        
        if existing_template:
            return False
        
        default_templates = [
            Template(
                name="Standard Test Case",
                system_instructions="""You are an expert QA Engineer. Generate comprehensive test cases that:
- Cover all functional requirements
- Include positive and negative scenarios
- Have clear, numbered steps
- Specify exact expected results"""
            ),
            Template(
                name="API Testing",
                system_instructions="""You are an API testing specialist. Generate test cases that cover:
- HTTP methods and status codes
- Request/response validation
- Authentication and authorization
- Error handling and edge cases
- Rate limiting and performance"""
            ),
            Template(
                name="UI/UX Testing",
                system_instructions="""You are a UI/UX testing expert. Generate test cases that cover:
- User interface elements and layouts
- User workflows and navigation
- Form validation and error messages
- Accessibility requirements
- Responsive design across devices"""
            ),
        ]
        
        for template in default_templates:
            session.add(template)
        
        session.commit()
        return True

