"""Template repository for template data access operations."""

from typing import Optional, Sequence
from fastapi import Depends
from sqlmodel import Session, select

from database import get_session
from models import Template, TemplateUpdate
from repositories.base import BaseRepository, reject_null_fields

# Template columns that are NOT NULL.
_TEMPLATE_NON_NULLABLE = {"name", "system_instructions"}


class TemplateRepository(BaseRepository[Template]):
    """Repository for Template entity operations."""
    
    def __init__(self, session: Session):
        """Initialize with Template model and session."""
        super().__init__(Template, session)
    
    def get_by_name(self, name: str) -> Optional[Template]:
        """
        Get a template by name.
        
        Args:
            name: Template name to search for
            
        Returns:
            Template if found, None otherwise
        """
        statement = select(Template).where(Template.name == name)
        return self.session.exec(statement).first()
    
    def name_exists(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """
        Check if a template name already exists.
        
        Args:
            name: Name to check
            exclude_id: Optional ID to exclude from check (for updates)
            
        Returns:
            True if name exists, False otherwise
        """
        statement = select(Template).where(Template.name == name)
        if exclude_id is not None:
            statement = statement.where(Template.id != exclude_id)
        return self.session.exec(statement).first() is not None
    
    def update(self, template: Template, update_data: TemplateUpdate) -> Template:
        """
        Update a template with partial data.
        
        Args:
            template: Template instance to update
            update_data: Partial update schema
            
        Returns:
            Updated template
        """
        update_dict = update_data.model_dump(exclude_unset=True)
        reject_null_fields(update_dict, _TEMPLATE_NON_NULLABLE)
        for key, value in update_dict.items():
            setattr(template, key, value)
        
        self.session.add(template)
        self.session.commit()
        self.session.refresh(template)
        return template


def get_template_repository(
    session: Session = Depends(get_session)
) -> TemplateRepository:
    """FastAPI dependency for TemplateRepository."""
    return TemplateRepository(session)




