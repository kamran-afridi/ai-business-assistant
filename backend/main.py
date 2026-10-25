from adult_links import router as media_router
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="AI Business Assistant")
app.include_router(media_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "chat.db"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
DEFAULT_MODEL = "llama3.1"

SUPPORTED_MODELS = [
    {"id": "stheno-adult", "name": "Stheno Adult 8B", "ollama": "stheno-adult:latest"},
    {"id": "llama3.1", "name": "Llama 3.1", "ollama": "llama3.1:latest"},
    {"id": "mistral", "name": "Mistral", "ollama": "mistral:latest"},
    {"id": "dolphin-mistral", "name": "Dolphin Mistral 7B", "ollama": "dolphin-mistral:7b"},
    {"id": "qwen", "name": "Qwen 3 14B", "ollama": "qwen3:14B"},
    {
        "id": "mistral-unrestricted",
        "name": "Mistral Custom",
        "ollama": "mistral-unrestricted:latest"
    },
]

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[int] = None
    model: str = DEFAULT_MODEL


class ConversationCreateRequest(BaseModel):
    title: Optional[str] = None
    model: str = DEFAULT_MODEL


class ConversationUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConversationMessage(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: str


class ConversationRecord(BaseModel):
    id: int
    title: str
    model: str
    created_at: str
    updated_at: str
    message_count: int = 0
    preview: Optional[str] = None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT 'llama3.1',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()


def normalize_model(value: Optional[str]) -> str:
    candidate = (value or DEFAULT_MODEL).strip().lower()

    for model in SUPPORTED_MODELS:
        if candidate in {
            model["id"].lower(),
            model["ollama"].lower(),
        }:
            return model["id"]

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported AI model: {value}"
    )


def get_conversation_by_id(conversation_id: int):
    with get_db_connection() as connection:
        cursor = connection.execute(
            "SELECT * FROM conversations WHERE id = ?",
            (conversation_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return dict(row)


def get_messages_for_conversation(conversation_id: int):
    with get_db_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, conversation_id, role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY id ASC
            """,
            (conversation_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def title_from_message(message: str) -> str:
    cleaned = " ".join(message.strip().split())
    if not cleaned:
        return "New conversation"
    title = cleaned[:42].strip()
    return title if len(cleaned) <= 42 else f"{title}..."


@app.on_event("startup")
def on_startup() -> None:
    initialize_database()


@app.get("/health")
def health():
    return {"status": "ok", "model": DEFAULT_MODEL, "models": SUPPORTED_MODELS}


@app.get("/models")
def get_models():
    return {"models": SUPPORTED_MODELS}


@app.get("/conversations")
def read_conversations(search: Optional[str] = Query(default=None)):
    with get_db_connection() as connection:
        if search:
            rows = connection.execute(
                """
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count,
                       (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.id DESC LIMIT 1) AS preview
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                WHERE lower(c.title) LIKE lower(?)
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """,
                (f"%{search}%",),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count,
                       (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.id DESC LIMIT 1) AS preview
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """,
            ).fetchall()

    conversations = []
    for row in rows:
        conversations.append(
            {
                "id": row["id"],
                "title": row["title"],
                "model": row["model"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "message_count": row["message_count"],
                "preview": row["preview"],
            }
        )
    return {"conversations": conversations}


@app.get("/conversations/{conversation_id}")
def read_single_conversation(conversation_id: int):
    conversation = get_conversation_by_id(conversation_id)
    messages = get_messages_for_conversation(conversation_id)
    return {**conversation, "messages": messages}


@app.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(conversation_id: int):
    get_conversation_by_id(conversation_id)
    return {"messages": get_messages_for_conversation(conversation_id)}


@app.post("/conversations")
def create_conversation(request: ConversationCreateRequest):
    created_at = utc_now_iso()
    title = request.title.strip() if request.title else "New conversation"
    model = normalize_model(request.model)
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO conversations (title, model, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (title, model, created_at, created_at),
        )
        connection.commit()
        conversation_id = cursor.lastrowid
    return {
        "id": conversation_id,
        "title": title,
        "model": model,
        "created_at": created_at,
        "updated_at": created_at,
    }


@app.patch("/conversations/{conversation_id}")
def update_conversation(conversation_id: int, request: ConversationUpdateRequest):
    conversation = get_conversation_by_id(conversation_id)
    with get_db_connection() as connection:
        connection.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (request.title.strip(), utc_now_iso(), conversation_id),
        )
        connection.commit()
    updated = get_conversation_by_id(conversation_id)
    return updated


@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int):
    get_conversation_by_id(conversation_id)
    with get_db_connection() as connection:
        connection.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        connection.commit()
    return {"deleted_id": conversation_id}



def get_system_prompt(model: str) -> str:
    if model == "stheno-adult":
        return (
            "You are Stheno, an AI assistant for adults aged 18+. "
            "Discuss mature subjects, sexuality, relationships, "
            "psychology, entertainment and fictional roleplay "
            "respectfully and without unnecessary judgement. "
            "Do not invent links or claim internet access. "
            "Maintain appropriate safety boundaries."
        )
    return (
        "You are a versatile general-purpose AI assistant. "
        "Answer questions directly and accurately. "
        "Acknowledge uncertainty and maintain appropriate safety boundaries."
    )


@app.post("/chat")
def chat(request: ChatRequest):
    message = request.message.strip()
    model = normalize_model(request.model)

    if request.conversation_id is not None:
        conversation = get_conversation_by_id(request.conversation_id)
        conversation_id = request.conversation_id
        title = conversation["title"]
    else:
        title = title_from_message(message)
        created_at = utc_now_iso()
        with get_db_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO conversations (title, model, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (title, model, created_at, created_at),
            )
            connection.commit()
            conversation_id = cursor.lastrowid

    with get_db_connection() as connection:
        connection.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, "user", message, utc_now_iso()),
        )
        connection.execute(
            "UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?",
            (model, utc_now_iso(), conversation_id),
        )
        connection.commit()

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": next(
                    item["ollama"]
                    for item in SUPPORTED_MODELS
                    if item["id"] == model
                ),
                "messages": [
                    {
                        "role": "system",
                        "content": get_system_prompt(model),
                    },
                    {"role": "user", "content": message},
                ],
                "stream": False,
            },
            timeout=120,
        )
        response.raise_for_status()
        reply = response.json()["message"]["content"]
    except requests.RequestException:
        reply = "Unable to communicate with Ollama. Please make sure the local Ollama server is running and the selected model is available."

    with get_db_connection() as connection:
        connection.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, "assistant", reply, utc_now_iso()),
        )
        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (utc_now_iso(), conversation_id),
        )
        connection.commit()

    return {
        "reply": reply,
        "conversation_id": conversation_id,
        "title": title,
        "model": model,
        "messages": get_messages_for_conversation(conversation_id),
    }
