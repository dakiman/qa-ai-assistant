"""Template CRUD endpoints."""

from fastapi import APIRouter, Depends, status
from typing import Sequence

from auth import verify_api_key, verify_api_key_optional
from exceptions import ResourceNotFoundError, ResourceConflictError
from models import (
    Template, 
    TemplateCreate, 
    TemplateRead, 
    TemplateUpdate
)
from repositories.template_repository import TemplateRepository, get_template_repository

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.post("/", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(
    template: TemplateCreate, 
    repo: TemplateRepository = Depends(get_template_repository),
    _: str = Depends(verify_api_key)
) -> Template:
    """Create a new template."""
    # Check if name already exists
    if repo.name_exists(template.name):
        raise ResourceConflictError(f"Template with name '{template.name}' already exists")
    
    db_template = Template.model_validate(template)
    return repo.create(db_template)


@router.get("/", response_model=list[TemplateRead])
def list_templates(
    skip: int = 0, 
    limit: int = 100, 
    repo: TemplateRepository = Depends(get_template_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> Sequence[Template]:
    """List all templates with pagination."""
    return repo.get_all(skip=skip, limit=limit)


@router.get("/{template_id}", response_model=TemplateRead)
def get_template(
    template_id: int, 
    repo: TemplateRepository = Depends(get_template_repository),
    _: str | None = Depends(verify_api_key_optional)
) -> Template:
    """Get a specific template by ID."""
    template = repo.get(template_id)
    if not template:
        raise ResourceNotFoundError("Template", template_id)
    return template


@router.patch("/{template_id}", response_model=TemplateRead)
def update_template(
    template_id: int, 
    template_update: TemplateUpdate, 
    repo: TemplateRepository = Depends(get_template_repository),
    _: str = Depends(verify_api_key)
) -> Template:
    """Update a template."""
    template = repo.get(template_id)
    if not template:
        raise ResourceNotFoundError("Template", template_id)
    
    # Check for name conflict if updating name
    update_data = template_update.model_dump(exclude_unset=True)
    if "name" in update_data and repo.name_exists(update_data["name"], exclude_id=template_id):
        raise ResourceConflictError(f"Template with name '{update_data['name']}' already exists")
    
    return repo.update(template, template_update)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int, 
    repo: TemplateRepository = Depends(get_template_repository),
    _: str = Depends(verify_api_key)
) -> None:
    """Delete a template."""
    template = repo.get(template_id)
    if not template:
        raise ResourceNotFoundError("Template", template_id)
    repo.delete(template)
