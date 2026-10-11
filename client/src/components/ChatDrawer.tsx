import React, { useState } from 'react';
import { api, ChatMessage } from '../api/client';

export const ChatDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'Kaizen QA Orchestrator',
      role: 'assistant',
      agentBadge: 'Multi-Agent Bus',
      text: 'Hello! I am connected to the Gemini Reasoning Engine, Playwright Replay Runner, and Deterministic Invariant Oracles. How can I assist with your test suite?',
      timestamp: 'Just now',
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const starterPrompts = [
    'Analyze selector drift for cart checkout',
    'Generate resilient Playwright patch code',
    'Diagnose 500 error on checkout submission',
    'Verify backend order database invariants',
  ];

  const handleSend = async (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'Lead QA',
      role: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const resp = await api.sendChatMessage(promptText);
      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: resp.agent || 'Selector Healing Agent',
        role: 'assistant',
        agentBadge: 'Gemini Engine',
        text: resp.reply || 'Analysis completed with verified confidence.',
        codeSnippet: resp.patchCode,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'System Alert',
          role: 'assistant',
          text: `Unable to contact reasoning engine: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="ai-chat-fab"
        className="chat-fab"
        aria-label="Open AI Assistant"
        title="Open AI Assistant"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="fab-icon">✦</span>
        <span className="fab-text">Ask AI</span>
      </button>

      {/* Floating Drawer */}
      <div
        id="chat-drawer"
        className={`chat-drawer ${isOpen ? 'chat-drawer--open' : ''}`}
        aria-hidden={!isOpen}
      >
        <div className="chat-drawer-header">
          <div className="flex items-center gap-2">
            <span className="crest-icon">✦</span>
            <div>
              <h3 className="chat-drawer-title font-bold text-sm">Kaizen Multi-Agent QA</h3>
              <span className="mono text-xs text-muted">Gemini • Sarvam • Invariant Oracle</span>
            </div>
          </div>
          <button
            className="btn-icon-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close Assistant"
          >
            ✕
          </button>
        </div>

        {/* Message Stream */}
        <div id="chat-messages" className="chat-messages-container">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-message-bubble ${m.role === 'user' ? 'chat-message--user' : 'chat-message--assistant'}`}
            >
              <div className="chat-message-meta">
                <span className="font-semibold">{m.sender}</span>
                {m.agentBadge && <span className="agent-badge">{m.agentBadge}</span>}
                <span className="text-muted text-xs">{m.timestamp}</span>
              </div>
              <div className="chat-message-body">{m.text}</div>
              {m.codeSnippet && (
                <pre className="chat-code-block">
                  <code>{m.codeSnippet}</code>
                </pre>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="chat-typing-indicator">
              <span>Reasoning across 4 cooperating agents...</span>
            </div>
          )}

          {/* Starter Pills */}
          <div className="chat-prompt-starters">
            {starterPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="prompt-starter-pill"
                data-prompt={p}
                onClick={() => handleSend(p)}
              >
                ✦ {p}
              </button>
            ))}
          </div>
        </div>

        {/* Floating Input Capsule */}
        <form
          id="chat-form"
          className="chat-input-capsule-wrapper"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <div className="chat-input-capsule">
            <span className="capsule-sparkle-icon" aria-hidden="true">✦</span>
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="chat-prompt-input"
              placeholder="Ask anything about tests, selectors, or healing..."
              autoComplete="off"
            />
            <button
              type="submit"
              id="chat-send-btn"
              className="capsule-send-btn"
              aria-label="Send message"
              title="Send message"
            >
              ➔
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
