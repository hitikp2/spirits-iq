"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  useConversations, useSendMessage, useSmsCampaigns,
  useCreateCampaign, useSendCampaign,
} from "@/hooks/useApi";
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

interface Campaign {
  id: string;
  name: string;
  messageBody: string;
  status: string;
  targetTier: string | null;
  targetTags: string[];
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  scheduledFor: string | null;
  createdAt: string;
}

const TIERS = ["", "VIP", "GOLD", "SILVER", "BRONZE"];

const campaignStatusColors: Record<string, string> = {
  DRAFT: "bg-surface-700 text-surface-300",
  SCHEDULED: "bg-blue-500/20 text-blue-400",
  SENDING: "bg-brand/20 text-brand",
  SENT: "bg-success/20 text-success",
  FAILED: "bg-danger/20 text-danger",
};

const tierColors: Record<string, string> = {
  vip: "bg-brand text-surface-950",
  gold: "bg-yellow-600 text-surface-950",
  silver: "bg-surface-400 text-surface-950",
  bronze: "bg-orange-700 text-surface-100",
};

export default function SmsPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const [activeTab, setActiveTab] = useState<"messages" | "campaigns">("messages");

  const { data, isLoading } = useConversations(storeId);
  const sendMessage = useSendMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New Conversation compose modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePhone, setComposePhone] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState("");

  // Campaigns
  const { data: campaignsData, isLoading: campaignsLoading } = useSmsCampaigns(storeId);
  const createCampaign = useCreateCampaign();
  const sendCampaignMutation = useSendCampaign();
  const campaigns = (campaignsData as Campaign[]) || [];
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignTier, setCampaignTier] = useState("");
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);

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

  async function handleComposeSend() {
    if (!composePhone.trim() || !composeMessage.trim() || !storeId) return;
    setComposeSending(true);
    setComposeError("");
    try {
      // Look up or create the customer by phone
      const lookupRes = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", storeId, phone: composePhone.trim() }),
      });
      const lookupJson = await lookupRes.json();
      let customerId: string;

      if (lookupJson.success && lookupJson.data?.id) {
        customerId = lookupJson.data.id;
      } else {
        // Create customer if not found
        const createRes = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            storeId,
            phone: composePhone.trim(),
            firstName: "New",
            lastName: "Customer",
          }),
        });
        const createJson = await createRes.json();
        if (!createJson.success || !createJson.data?.id) {
          setComposeError("Failed to create customer");
          setComposeSending(false);
          return;
        }
        customerId = createJson.data.id;
      }

      // Send the message
      sendMessage.mutate(
        { customerId, message: composeMessage.trim() },
        {
          onSuccess: () => {
            setComposeOpen(false);
            setComposePhone("");
            setComposeMessage("");
            setSelectedId(customerId);
            setMobileShowChat(true);
          },
          onError: () => {
            setComposeError("Failed to send message");
          },
          onSettled: () => {
            setComposeSending(false);
          },
        }
      );
    } catch {
      setComposeError("Something went wrong");
      setComposeSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center gap-2 px-1 pb-3">
        <button
          onClick={() => setActiveTab("messages")}
          className={cn(
            "rounded-xl px-4 py-2 font-body text-sm font-medium transition-colors",
            activeTab === "messages"
              ? "bg-brand text-surface-950"
              : "bg-surface-900 text-surface-400 hover:text-surface-100"
          )}
        >
          Messages
        </button>
        <button
          onClick={() => setActiveTab("campaigns")}
          className={cn(
            "rounded-xl px-4 py-2 font-body text-sm font-medium transition-colors",
            activeTab === "campaigns"
              ? "bg-brand text-surface-950"
              : "bg-surface-900 text-surface-400 hover:text-surface-100"
          )}
        >
          Campaigns
        </button>
      </div>

      {/* Messages Tab */}
      {activeTab === "messages" && (
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-2xl border border-surface-600 bg-surface-950">
      <div
        className={cn(
          "w-full flex-shrink-0 border-r border-surface-600 bg-surface-900 md:w-80 lg:w-96",
          mobileShowChat ? "hidden md:flex md:flex-col" : "flex flex-col"
        )}
      >
        <div className="border-b border-surface-600 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-lg font-bold text-surface-100">Messages</h1>
              <p className="font-body text-xs text-surface-400">
                {conversations.length} conversation{conversations.length !== 1 && "s"}
              </p>
            </div>
            <button
              onClick={() => setComposeOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-surface-950 transition-opacity hover:opacity-90"
              title="New Message"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          </div>
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
      )}

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-surface-600 bg-surface-950 p-4">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-surface-100">SMS Campaigns</h2>
                <p className="font-body text-xs text-surface-400">Send broadcast messages to your customers</p>
              </div>
              <button
                onClick={() => setShowCreateCampaign(true)}
                className="rounded-xl bg-brand px-4 py-2.5 font-display text-sm font-bold text-surface-950 transition-opacity hover:opacity-90"
              >
                New Campaign
              </button>
            </div>

            {/* Create Campaign Form */}
            {showCreateCampaign && (
              <div className="rounded-2xl border border-brand/30 bg-surface-900 p-5 space-y-4">
                <h3 className="font-display text-sm font-bold text-surface-100">Create Campaign</h3>
                <div>
                  <label className="mb-1.5 block font-body text-xs font-medium text-surface-400">Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Weekend Special, New Arrivals..."
                    className="w-full rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-body text-sm text-surface-100 placeholder-surface-500 outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-body text-xs font-medium text-surface-400">Message</label>
                  <textarea
                    value={campaignBody}
                    onChange={(e) => setCampaignBody(e.target.value)}
                    placeholder="Type your broadcast message..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-body text-sm text-surface-100 placeholder-surface-500 outline-none focus:border-brand"
                  />
                  <p className="mt-1 font-mono text-[10px] text-surface-500">{campaignBody.length}/320 characters</p>
                </div>
                <div>
                  <label className="mb-1.5 block font-body text-xs font-medium text-surface-400">Target Tier (optional)</label>
                  <select
                    value={campaignTier}
                    onChange={(e) => setCampaignTier(e.target.value)}
                    className="w-full rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-body text-sm text-surface-100 outline-none focus:border-brand"
                  >
                    <option value="">All Customers</option>
                    {TIERS.filter(Boolean).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (!campaignName.trim() || !campaignBody.trim() || !storeId) return;
                      createCampaign.mutate(
                        {
                          storeId,
                          name: campaignName.trim(),
                          messageBody: campaignBody.trim(),
                          targetTier: campaignTier || undefined,
                        },
                        {
                          onSuccess: () => {
                            setShowCreateCampaign(false);
                            setCampaignName("");
                            setCampaignBody("");
                            setCampaignTier("");
                          },
                        }
                      );
                    }}
                    disabled={createCampaign.isPending || !campaignName.trim() || !campaignBody.trim()}
                    className="rounded-xl bg-brand px-5 py-2.5 font-display text-sm font-bold text-surface-950 transition-opacity disabled:opacity-40"
                  >
                    {createCampaign.isPending ? "Creating..." : "Create Draft"}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateCampaign(false);
                      setCampaignName("");
                      setCampaignBody("");
                      setCampaignTier("");
                    }}
                    className="font-body text-sm text-surface-400 hover:text-surface-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Campaign List */}
            {campaignsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-600 border-t-brand" />
              </div>
            ) : campaigns.length === 0 && !showCreateCampaign ? (
              <div className="py-16 text-center">
                <svg className="mx-auto mb-3 h-12 w-12 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                </svg>
                <p className="font-body text-sm text-surface-400">No campaigns yet</p>
                <p className="mt-1 font-body text-xs text-surface-500">Create one to broadcast to your SMS subscribers</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-2xl border border-surface-600 bg-surface-900 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-sm font-bold text-surface-100 truncate">{campaign.name}</h3>
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase",
                            campaignStatusColors[campaign.status] || "bg-surface-700 text-surface-300"
                          )}>
                            {campaign.status}
                          </span>
                        </div>
                        <p className="mt-1 font-body text-xs text-surface-300 line-clamp-2">{campaign.messageBody}</p>
                        <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-surface-400">
                          <span>{campaign.recipientCount} recipients</span>
                          {campaign.sentCount > 0 && <span>{campaign.sentCount} sent</span>}
                          {campaign.deliveredCount > 0 && <span>{campaign.deliveredCount} delivered</span>}
                          {campaign.targetTier && <span>Tier: {campaign.targetTier}</span>}
                          <span>{timeAgo(campaign.createdAt)}</span>
                        </div>
                      </div>
                      {campaign.status === "DRAFT" && (
                        <div className="shrink-0">
                          {confirmSendId === campaign.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  sendCampaignMutation.mutate(campaign.id, {
                                    onSettled: () => setConfirmSendId(null),
                                  });
                                }}
                                disabled={sendCampaignMutation.isPending}
                                className="rounded-lg bg-success px-3 py-1.5 font-display text-xs font-bold text-surface-950"
                              >
                                {sendCampaignMutation.isPending ? "Sending..." : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmSendId(null)}
                                className="font-body text-xs text-surface-400 hover:text-surface-100"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmSendId(campaign.id)}
                              className="rounded-lg bg-brand/10 px-3 py-1.5 font-display text-xs font-bold text-brand hover:bg-brand/20 transition-colors"
                            >
                              Send Now
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose New Message Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-600 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-surface-100">New Message</h2>
              <button
                onClick={() => {
                  setComposeOpen(false);
                  setComposePhone("");
                  setComposeMessage("");
                  setComposeError("");
                }}
                className="rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block font-body text-xs font-medium text-surface-400">Phone Number</label>
                <input
                  type="tel"
                  value={composePhone}
                  onChange={(e) => setComposePhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-mono text-sm text-surface-100 placeholder-surface-500 outline-none transition-colors focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-body text-xs font-medium text-surface-400">Message</label>
                <textarea
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder="Type your message..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 font-body text-sm text-surface-100 placeholder-surface-500 outline-none transition-colors focus:border-brand"
                />
                <p className="mt-1 font-mono text-[10px] text-surface-500">
                  {composeMessage.length}/320 characters
                </p>
              </div>
              {composeError && (
                <p className="font-body text-xs text-danger">{composeError}</p>
              )}
              <button
                onClick={handleComposeSend}
                disabled={composeSending || !composePhone.trim() || !composeMessage.trim()}
                className="w-full rounded-xl bg-brand py-3 font-display text-sm font-bold text-surface-950 transition-opacity disabled:opacity-40"
              >
                {composeSending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
