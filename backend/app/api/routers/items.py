from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/items", tags=["items"])


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(gt=0)


class Item(ItemCreate):
    id: UUID


# SCAFFOLD: in-memory stand-in for a repository. Replace with a real
# repository backed by the DB pool. UUID keys mirror the DB schema convention.
_items: dict[UUID, Item] = {}


@router.post("", response_model=Item, status_code=201)
async def create_item(payload: ItemCreate) -> Item:
    item = Item(id=uuid4(), **payload.model_dump())
    _items[item.id] = item
    return item


@router.get("/{item_id}", response_model=Item)
async def get_item(item_id: UUID) -> Item:
    item = _items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
