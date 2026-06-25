from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_create_then_get_item() -> None:
    created = client.post("/items", json={"name": "Widget", "price": 9.5})
    assert created.status_code == 201
    item_id = created.json()["id"]

    fetched = client.get(f"/items/{item_id}")
    assert fetched.status_code == 200
    assert fetched.json() == {"id": item_id, "name": "Widget", "price": 9.5}


def test_get_missing_item_is_404() -> None:
    response = client.get("/items/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_create_item_rejects_invalid_price() -> None:
    response = client.post("/items", json={"name": "Widget", "price": 0})
    assert response.status_code == 422
