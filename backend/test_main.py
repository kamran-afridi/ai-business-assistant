from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_and_supported_models():
    health = client.get("/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert "models" in body

    models = client.get("/models")
    assert models.status_code == 200
    payload = models.json()
    assert isinstance(payload["models"], list)
    assert len(payload["models"]) >= 4


def test_conversation_lifecycle_and_search():
    list_response = client.get("/conversations")
    assert list_response.status_code == 200
    conversations = list_response.json()["conversations"]

    create_response = client.post(
        "/conversations",
        json={"title": "Quarterly planning"},
    )
    assert create_response.status_code == 200
    created = create_response.json()
    conversation_id = created["id"]
    assert created["title"] == "Quarterly planning"

    search_response = client.get("/conversations", params={"search": "quarterly"})
    assert search_response.status_code == 200
    items = search_response.json()["conversations"]
    assert any(item["id"] == conversation_id for item in items)

    rename_response = client.patch(
        f"/conversations/{conversation_id}",
        json={"title": "Updated planning"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["title"] == "Updated planning"

    delete_response = client.delete(f"/conversations/{conversation_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted_id"] == conversation_id


def test_chat_accepts_model_and_message():
    response = client.post(
        "/chat",
        json={"message": "Summarize this business idea.", "model": "llama3.1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "reply" in payload or "error" in payload
