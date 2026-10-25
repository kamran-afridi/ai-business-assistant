"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
};

type ModelOption = {
  id: string;
  name: string;
  ollama: string;
};

type Conversation = {
  id: number;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string | null;
};

const DEFAULT_MODEL = "llama3.1";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [activeModel, setActiveModel] = useState(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([
    { id: "llama3.1", name: "Llama 3.1", ollama: "llama3.1" },
    { id: "mistral", name: "Mistral", ollama: "mistral" },
    { id: "dolphin-mistral", name: "Dolphin Mistral", ollama: "dolphin-mistral" },
    { id: "qwen", name: "Qwen", ollama: "qwen" },
  ]);

  const activeModelLabel = useMemo(
    () =>
      availableModels.find((model) => model.id === activeModel)?.name || "Llama 3.1",
    [activeModel, availableModels],
  );

  const loadModels = useCallback(async () => {
    try {
      const response = await fetch("/api/models", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && Array.isArray(data.models)) {
        setAvailableModels(data.models);
      }
    } catch {
      // Keep the default model list if the backend is temporarily unavailable.
    }
  }, []);

  const loadConversations = useCallback(
    async (query = search) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(
        `/api/conversations${params.toString() ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setConversations(data.conversations ?? []);
    },
    [search],
  );

  const openConversation = useCallback(async (conversationId: number) => {
    setCurrentConversationId(conversationId);
    const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
    if (!response.ok) {
      setError("Unable to open this conversation.");
      return;
    }

    const data = await response.json();
    const messagesFromServer: Array<{
      id: number;
      role: string;
      content: string;
    }> = Array.isArray(data.messages) ? data.messages : [];

    setMessages(
      messagesFromServer.map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    );
    setError("");
    if (data.model) setActiveModel(data.model);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await loadModels();
      await loadConversations();
    };

    void initialize();
  }, [loadModels, loadConversations]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConversations(search);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search, loadConversations]);

  async function createNewConversation() {
    setCurrentConversationId(null);
    setMessages([]);
    setError("");
    setInput("");
  }

  async function handleRename(conversationId: number) {
    const target = conversations.find((item) => item.id === conversationId);
    if (!target) return;

    const nextTitle = window.prompt("Rename conversation", target.title);
    if (!nextTitle || !nextTitle.trim()) return;

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle.trim() }),
    });

    if (!response.ok) {
      setError("Unable to rename this chat.");
      return;
    }

    setError("");
    await loadConversations(search);
    if (currentConversationId === conversationId) {
      await openConversation(conversationId);
    }
  }

  async function handleDelete(conversationId: number) {
    const target = conversations.find((item) => item.id === conversationId);
    if (!target) return;

    const confirmed = window.confirm(`Delete "${target.title}"? This cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Unable to delete this chat.");
      return;
    }

    setError("");
    if (currentConversationId === conversationId) {
      setCurrentConversationId(null);
      setMessages([]);
    }
    await loadConversations(search);
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const message = input.trim();
    if (!message || loading) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          model: activeModel,
          conversation_id: currentConversationId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to send the message.");
      }

      setCurrentConversationId(data.conversation_id ?? currentConversationId);
      setMessages(data.messages ?? []);
      setInput("");
      await loadConversations(search);
      if (data.model) {
        setActiveModel(data.model);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100">
      <div className="flex min-h-screen">
        <aside
          className={`border-r border-white/10 bg-[#0b1220]/90 backdrop-blur-xl transition-all duration-200 ${
            sidebarOpen ? "w-full max-w-[340px]" : "w-[88px]"
          }`}
        >
          <div className="flex h-full flex-col p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen((value) => !value)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 transition hover:bg-white/10"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? "←" : "→"}
              </button>

              {sidebarOpen && (
                <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs font-medium text-violet-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Local AI
                </div>
              )}
            </div>

            {sidebarOpen && (
              <>
                <button
                  type="button"
                  onClick={createNewConversation}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110"
                >
                  <span className="text-lg">＋</span>
                  New chat
                </button>

                <label className="mb-3 block">
                  <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                    Search chats
                  </span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search conversations"
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400"
                  />
                </label>
              </>
            )}

            <div className="hidden-scrollbar flex-1 space-y-2 overflow-y-auto pb-3">
              {conversations.length === 0 && sidebarOpen && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No saved chats yet.
                </div>
              )}

              {conversations.map((conversation) => {
                const isActive = conversation.id === currentConversationId;
                return (
                  <div
                    key={conversation.id}
                    className={`group rounded-2xl border p-3 transition ${
                      isActive
                        ? "border-violet-500/40 bg-violet-500/10 shadow-lg shadow-violet-950/20"
                        : "border-white/5 bg-slate-900/40 hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openConversation(conversation.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-100">
                            {conversation.title}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                            {conversation.preview || "No messages yet."}
                          </p>
                        </div>
                      </div>
                    </button>

                    {sidebarOpen && (
                      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-slate-500">
                        <span>{conversation.model}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRename(conversation.id)}
                            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:border-violet-400 hover:text-white"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(conversation.id)}
                            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200 transition hover:bg-rose-500/20"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <header className="border-b border-white/10 bg-[#0b1220]/70 px-4 py-3 backdrop-blur-sm sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-violet-300">
                  Chat Library
                </p>
                <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                  {currentConversationId ? "Conversation" : "AI Business Assistant"}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                  <span className="hidden text-slate-400 sm:inline">Model</span>
                  <select
                    value={activeModel}
                    onChange={(event) => setActiveModel(event.target.value)}
                    className="bg-transparent pr-2 text-sm text-slate-100 outline-none"
                  >
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id} className="bg-slate-900 text-slate-100">
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </header>

          <section className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="mx-auto max-w-4xl space-y-4">
                {messages.length === 0 && (
                  <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="max-w-xl text-center">
                      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-3xl shadow-lg shadow-violet-900/30">
                        ✦
                      </div>
                      <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                        How can I help you today?
                      </h2>
                      <p className="mt-3 text-sm text-slate-400 sm:text-base">
                        Ask about business strategy, drafting, research, or planning while keeping everything local.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-7 shadow-lg sm:max-w-[75%] ${
                        message.role === "user"
                          ? "border-violet-500/40 bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
                          : "border-white/10 bg-slate-900/80 text-slate-200"
                      }`}
                    >
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-current/70">
                        {message.role === "user" ? "You" : activeModelLabel}
                      </p>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                        AI is thinking...
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 bg-[#0b1220]/80 px-4 py-4 backdrop-blur-sm sm:px-6">
              <form onSubmit={sendMessage} className="mx-auto max-w-4xl">
                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:items-end">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    rows={1}
                    maxLength={4000}
                    placeholder="Message your AI assistant..."
                    aria-label="Message your AI assistant"
                    className="max-h-36 min-h-[56px] flex-1 resize-none rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const form = event.currentTarget.form;
                        if (form) form.requestSubmit();
                      }
                    }}
                  />

                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="inline-flex min-h-[56px] items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
