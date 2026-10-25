import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body?.message;

    if (typeof message !== "string" ||
        !message.trim() ||
        message.length > 4000) {
      return NextResponse.json(
        { error: "Enter a message under 4000 characters." },
        { status: 400 }
      );
    }

    const response = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(180000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();

    if (typeof data.reply !== "string") {
      throw new Error(data.error || "Invalid AI response");
    }

    return NextResponse.json({ reply: data.reply });
  } catch {
    return NextResponse.json(
      { error: "AI unavailable. Check FastAPI and Ollama." },
      { status: 502 }
    );
  }
}
