import { NextResponse } from "next/server";

const BACKEND_URL = "http://127.0.0.1:8000";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = new URL(`${BACKEND_URL}/conversations`);
    const search = searchParams.get("search");
    if (search) url.searchParams.set("search", search);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ conversations: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: typeof body?.title === "string" ? body.title : "New conversation",
        model: typeof body?.model === "string" ? body.model : "llama3.1",
      }),
      cache: "no-store",
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Unable to create a conversation." }, { status: 500 });
  }
}
