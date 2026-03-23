"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useConversations, useSendMessage } from "@/hooks/useApi";
import { formatPhone, timeAgo, cn } from "@/lib/utils";

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  aiGenerated: boolean;
  status: string;
  createdAt: string;
}

interface Conversation {
  customerId: string;
  customerName: string;
  phone: string;
  tier: string;
  tags: string[];
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  messages: Message[];
}

const tierColors: Record<string, string> = {
  vip: "bg-brand text-surface-950",
  gold: "bg-yellow-600 text-surface-950",
  silver: "bg-surface-400 text-surface-950",
  bronze: "bg-orange-700 text-surface-100",
};

export default function SmsPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const { data, isLoading } = useConversations(storeId);
  const sendMessage = useSendMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversations = (data as Conversation[]) || [];
  const selected = conversations.find((c) => c.customerId === selectedId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages?.length]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileShowChat(true);
  }

  function handleBack() {
    setMobileShowChat(false);
  }

  function handleSend() {
    if (!messageInput.trim() || !selectedId) return;
    sendMessage.mutate({ customerId: selectedId, message: messageInput.trim() });
    setMessageInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-surface-600 bg-surface-950">
      <div
        className={cn(
          "w-full flex-shrink-0 border-r border-surface-600 bg-surface-900 md:w-80 lg:w-96",
          mobileShowChat ? "hidden md:flex md:flex-col" : "flex flex-col"
        )}
      >
        <div className="border-b border-surface-600 px-4 py-4">
          <h1 className="font-display text-lg font-bold text-surface-100">Messages</h1>
          <p className="font-body text-xs text-surface-400">
            {conversations.length} conversation{conversations.length !== 1 && "s"}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-600 border-t-brand" />
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="font-body text-sm text-surface-400">No conversations yet</p>
            </div>
          )}
          {conversations.map((convo) => (
            <button
              key={convo.customerId}
              onClick={() => handleSelect(convo.customerId)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-surface-600/50 px-4 py-3 text-left transition-colors hover:bg-surface-800",
                selectedId === convo.customerId && "bg-surface-800"
              )}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-700 font-display text-sm font-bold text-surface-100">
                {convo.customerName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-sm font-semibold text-surface-100">
                    {convo.customerName}
                  </span>
                  <span className="flex-shrink-0 font-mono text-[10px] text-surface-400">
                    {convo.lastMessageAt ? timeAgo(convo.lastMessageAt) : ""}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {convo.tier && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase",
                        tierColors[convo.tier.toLowerCase()] || "bg-surface-700 text-surface-300"
                      )}
                    >
                      {convo.tier}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-surface-400">
                    {formatPhone(convo.phone)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate font-body text-xs text-surface-300">
                    {convo.lastMessage || "No messages"}
                  </p>
                  {convo.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold text-surface-950">
                      {convo.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col bg-surface-950",
          !mobileShowChat ? "hidden md:flex" : "flex"
        )}
      >
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <svg
              className="mb-4 h-16 w-16 text-surface-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="font-display text-lg font-semibold text-surface-300">
              Select a conversation
            </p>
            <p className="mt-1 font-body text-sm text-surface-400">
              Choose a customer to view messages
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-surface-600 px-4 py-3">
              <button
                onClick={handleBack}
                className="flex-shrink-0 rounded-xl p-1.5 text-surface-300 transition-colors hover:bg-surface-800 hover:text-surface-100 md:hidden"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-700 font-display text-sm font-bold text-surface-100">
                {selected.customerName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-sm font-semibold text-surface-100">
                    {selected.customerName}
                  </span>
                  {selected.tier && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase",
                        tierColors[selected.tier.toLowerCase()] || "bg-surface-700 text-surface-300"
                      )}
                    >
                      {selected.tier}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-surface-400">{formatPhone(selected.phone)}</p>
              </div>
              {selected.tags.length > 0 && (
                <div className="ml-auto hidden items-center gap-1.5 lg:flex">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-surface-600 px-2 py-0.5 font-body text-[10px] text-surface-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {selected.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col",
                      msg.direction === "outbound" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5",
                        msg.direction === "outbound"
                          ? "bg-brand text-surface-950"
                          : "bg-surface-800 text-surface-100"
                      )}
                    >
                      <p className="font-body text-sm leading-relaxed">{msg.body}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-1">
                      {msg.aiGenerated && (
                        <span className="rounded bg-surface-700 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-brand">
                          AI
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-surface-400">
                        {timeAgo(msg.createdAt)}
                      </span>
                      {msg.direction === "outbound" && msg.status && (
                        <span
                          className={cn(
                            "font-mono text-[10px]",
                            msg.status === "delivered" ? "text-success" : "text-surface-400"
                          )}
                        >
                          {msg.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-surface-600 px-4 py-3">
              <div className="mx-auto flex max-w-2xl items-end gap-2">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-body text-sm text-surface-100 placeholder-surface-400 outline-none transition-colors focus:border-brand"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMessage.isPending}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-surface-950 transition-opacity disabled:opacity-40"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
