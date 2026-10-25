import { NextResponse } from "next/server";

const BACKEND_URL = "http://127.0.0.1:8000";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/models`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        models: [
          { id: "llama3.1", name: "Llama 3.1", ollama: "llama3.1" },
          { id: "mistral", name: "Mistral", ollama: "mistral" },
          { id: "dolphin-mistral", name: "Dolphin Mistral", ollama: "dolphin-mistral" },
          { id: "qwen", name: "Qwen", ollama: "qwen" },
        ],
      },
      { status: 200 },
    );
  }
}
