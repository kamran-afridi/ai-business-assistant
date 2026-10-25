"use client";

import { useState, type FormEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
    ]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-white md:flex">
      <aside className="border-b border-white/10 bg-[#111827] p-6 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <h1 className="text-xl font-bold">AI Business Assistant</h1>
        <p className="mt-2 text-sm text-gray-400">
          Powered by Ollama
        </p>
        <button
          onClick={() => {
            setMessages([]);
            setError("");
            setInput("");
          }}
          className="mt-8 w-full rounded-lg border border-white/20 p-3 text-left hover:bg-white/10"
        >
          + New conversation
        </button>
        <div className="mt-10 text-sm text-gray-400">
          <p>Model: Llama 3.1</p>
          <p className="mt-2">Environment: Local</p>
        </div>
      </aside>

      <main className="flex min-h-[80vh] flex-1 flex-col">
        <header className="border-b border-white/10 p-5">
          <h2 className="font-semibold">AI Chat</h2>
          <p className="text-xs text-gray-400">
            Private local development workspace
          </p>
        </header>

        <section
          aria-live="polite"
          className="mx-auto w-full max-w-3xl flex-1 space-y-5 p-6"
        >
          {messages.length === 0 && (
            <div className="py-20 text-center">
              <div className="text-5xl">✦</div>
              <h2 className="mt-5 text-3xl font-bold">
                How can I help you today?
              </h2>
              <p className="mt-3 text-gray-400">
                Ask questions, draft emails or explore business ideas.
              </p>
            </div>
          )}

          {messages.map((item, index) => (
            <div
              key={index}
              className={
                item.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl bg-blue-600 p-4"
                  : "mr-auto max-w-[90%] whitespace-pre-wrap rounded-2xl bg-[#1f2937] p-4"
              }
            >
              <p className="mb-2 text-xs font-semibold opacity-70">
                {item.role === "user" ? "You" : "AI Assistant"}
              </p>
              {item.content}
            </div>
          ))}

          {loading && (
            <p className="animate-pulse text-sm text-gray-400">
              AI is thinking...
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </section>

        <form
          onSubmit={sendMessage}
          className="mx-auto flex w-full max-w-3xl gap-3 p-5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={4000}
            placeholder="Message your AI assistant..."
            aria-label="Message your AI assistant"
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-[#1f2937] p-4 outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-blue-600 px-6 font-semibold hover:bg-blue-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
