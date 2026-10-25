import { NextResponse } from "next/server";

const BACKEND_URL = "http://127.0.0.1:8003";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const model = typeof body?.model === "string" ? body.model : "llama3.1";
    const conversationId = typeof body?.conversation_id === "number" ? body.conversation_id : null;

    if (!message || message.length > 4000) {
      return NextResponse.json(
        { error: "Enter a message under 4000 characters." },
        { status: 400 },
      );
    }

    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, model, conversation_id: conversationId }),
      signal: AbortSignal.timeout(180000),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || "AI request failed." },
        { status: response.status },
      );
    }

    const reply = data?.reply;
    if (typeof reply !== "string") {
      throw new Error(data?.error || "Invalid AI response");
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "AI unavailable. Check FastAPI and Ollama." },
      { status: 502 },
    );
  }
}
