"""Base repository with common CRUD operations."""

from typing import Generic, TypeVar, Optional, Sequence
from sqlmodel import Session, SQLModel, select

ModelType = TypeVar("ModelType", bound=SQLModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=SQLModel)


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
        statement = select(self.model).offset(skip).limit(limit)
        return self.session.exec(statement).all()
    
    def create(self, obj: ModelType) -> ModelType:
        """
        Create a new entity.
        
        Args:
            obj: Entity instance to create
            
        Returns:
            Created entity with ID populated
        """
        self.session.add(obj)
        self.session.commit()
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




