"""Template CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import Sequence

from database import get_session
from models import (
    Template, 
    TemplateCreate, 
    TemplateRead, 
    TemplateUpdate
)

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.post("/", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(template: TemplateCreate, session: Session = Depends(get_session)):
    """Create a new template."""
    # Check if name already exists
    existing = session.exec(
        select(Template).where(Template.name == template.name)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template with name '{template.name}' already exists"
        )
    
    db_template = Template.model_validate(template)
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    return db_template


@router.get("/", response_model=list[TemplateRead])
def list_templates(
    skip: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session)
) -> Sequence[Template]:
    """List all templates with pagination."""
    statement = select(Template).offset(skip).limit(limit)
    templates = session.exec(statement).all()
    return templates


@router.get("/{template_id}", response_model=TemplateRead)
def get_template(template_id: int, session: Session = Depends(get_session)):
    """Get a specific template by ID."""
    template = session.get(Template, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found"
        )
    return template


@router.patch("/{template_id}", response_model=TemplateRead)
def update_template(
    template_id: int, 
    template_update: TemplateUpdate, 
    session: Session = Depends(get_session)
):
    """Update a template."""
    template = session.get(Template, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found"
        )
    
    template_data = template_update.model_dump(exclude_unset=True)
    
    # Check for name conflict if updating name
    if "name" in template_data:
        existing = session.exec(
            select(Template).where(
                Template.name == template_data["name"],
                Template.id != template_id
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template with name '{template_data['name']}' already exists"
            )
    
    for key, value in template_data.items():
        setattr(template, key, value)
    
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, session: Session = Depends(get_session)):
    """Delete a template."""
    template = session.get(Template, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found"
        )
    session.delete(template)
    session.commit()
    return None


