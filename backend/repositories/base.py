"""Base repository with common CRUD operations."""

from typing import Generic, TypeVar, Optional, Sequence
from sqlmodel import Session, SQLModel, select

from exceptions import ValidationError

ModelType = TypeVar("ModelType", bound=SQLModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=SQLModel)


def reject_null_fields(update_dict: dict, non_nullable: set[str]) -> None:
    """Raise a 400 if a PATCH explicitly sets a NOT NULL column to null.

    ``{"steps": null}`` passes Pydantic (the update schemas make every field
    Optional) but violates the DB NOT NULL constraint at commit, surfacing as a
    500. Reject it up front as a client error instead (M8).
    """
    nulls = sorted(k for k in non_nullable if update_dict.get(k) is None and k in update_dict)
    if nulls:
        raise ValidationError(
            f"These fields cannot be set to null: {', '.join(nulls)}"
        )


class BaseRepository(Generic[ModelType]):
    """
    Base repository implementing common CRUD operations.
    
    Subclass this for entity-specific repositories that may need
    custom queries or business logic.
    """
    
    def __init__(self, model: type[ModelType], session: Session):
        """
        Initialize repository with model type and database session.
        
        Args:
            model: The SQLModel class this repository manages
            session: Database session for operations
        """
        self.model = model
        self.session = session
    
    def get(self, id: int) -> Optional[ModelType]:
        """
        Get a single entity by ID.
        
        Args:
            id: Primary key of the entity
            
        Returns:
            The entity if found, None otherwise
        """
        return self.session.get(self.model, id)
    
    def get_all(self, skip: int = 0, limit: int = 100) -> Sequence[ModelType]:
        """
        Get all entities with pagination.

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Sequence of entities
        """
        # Order by primary key for a stable, deterministic page order —
        # without ORDER BY, row order is engine-dependent (notably on Postgres)
        # and pages can overlap or skip rows between requests.
        statement = (
            select(self.model)
            .order_by(self.model.id)
            .offset(skip)
            .limit(limit)
        )
        return self.session.exec(statement).all()
    
    def create(self, obj: ModelType, commit: bool = True) -> ModelType:
        """
        Create a new entity.

        Args:
            obj: Entity instance to create
            commit: When False, flush (to populate the PK) but leave the
                transaction open so the caller can commit several writes
                atomically. Defaults to True for standalone callers.

        Returns:
            Created entity with ID populated
        """
        self.session.add(obj)
        if commit:
            self.session.commit()
        else:
            # flush assigns the primary key without ending the transaction
            self.session.flush()
        self.session.refresh(obj)
        return obj
    
    def update(self, obj: ModelType, update_data: UpdateSchemaType) -> ModelType:
        """
        Update an existing entity.
        
        Args:
            obj: Entity instance to update
            update_data: Pydantic model with update fields
            
        Returns:
            Updated entity
        """
        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(obj, key, value)
        
        self.session.add(obj)
        self.session.commit()
        self.session.refresh(obj)
        return obj
    
    def delete(self, obj: ModelType) -> None:
        """
        Delete an entity.
        
        Args:
            obj: Entity instance to delete
        """
        self.session.delete(obj)
        self.session.commit()




