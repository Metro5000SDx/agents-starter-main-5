/** Updated Chat app to use Workers AI + AI Gateway instead of OpenAI */
import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { isToolUIPart } from "ai";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "./tools";

import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { Toggle } from "@/components/toggle/Toggle";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

import {
  Bug,
  Moon,
  Robot,
  Sun,
  Trash,
  PaperPlaneTilt,
  Stop
} from "@phosphor-icons/react";

const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation"
];

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  // Updated agent initialization to use Workers AI
  const agent = useAgent({
    agent: "chat",
    model: "@cf/meta/llama-3-8b-instruct", // Example Workers AI model
    baseUrl: "https://gateway.ai.cloudflare.com/v1/cc60c390100c540a30060970c4689b9a/llm-chat-app/workers-ai", // Custom route that proxies to Cloudflare AI Gateway
  });

  const [agentInput, setAgentInput] = useState("");

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const pendingToolCallConfirmation = agentMessages.some((m) =>
    m.parts?.some(
      (part) =>
        isToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }]
    });
  };

  return (
    <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <HasWorkersAIKey />
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 sticky top-0 z-10">
          <div className="flex-1">
            <h2 className="font-semibold text-base">Workers AI Chat Agent</h2>
          </div>

          <div className="flex items-center gap-2 mr-2">
            <Bug size={16} />
            <Toggle toggled={showDebug} onClick={() => setShowDebug(!showDebug)} />
          </div>

          <Button variant="ghost" size="md" shape="square" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </Button>

          <Button variant="ghost" size="md" shape="square" onClick={clearHistory}>
            <Trash size={20} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
          {agentMessages.length === 0 && (
            <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900 text-center">
              <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex mb-2">
                <Robot size={24} />
              </div>
              <h3 className="font-semibold text-lg">Welcome to Workers AI Chat</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Start chatting using Cloudflare Workers AI via AI Gateway.
              </p>
            </Card>
          )}

          {agentMessages.map((m, index) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  {!isUser && <Avatar username="AI" />}
                  <Card className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-900">
                    {m.parts?.map((part, i) =>
                      part.type === "text" ? (
                        <MemoizedMarkdown key={i} id={`${m.id}-${i}`} content={part.text} />
                      ) : isToolUIPart(part) ? (
                        <ToolInvocationCard
                          key={`${part.toolCallId}-${i}`}
                          toolUIPart={part}
                          toolCallId={part.toolCallId}
                          needsConfirmation={toolsRequiringConfirmation.includes(
                            part.type.replace("tool-", "") as keyof typeof tools
                          )}
                          onSubmit={({ toolCallId, result }) => {
                            addToolResult({
                              tool: part.type.replace("tool-", ""),
                              toolCallId,
                              output: result
                            });
                          }}
                        />
                      ) : null
                    )}
                  </Card>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleAgentSubmit} className="p-3 bg-neutral-50 absolute bottom-0 left-0 right-0 border-t dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <Textarea
              disabled={pendingToolCallConfirmation}
              placeholder="Send a message..."
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              rows={2}
              className="flex-1 border rounded-2xl px-3 py-2 dark:bg-neutral-900"
            />
            {status === "submitted" || status === "streaming" ? (
              <Button variant="primary" onClick={stop}>
                <Stop size={16} />
              </Button>
            ) : (
              <Button variant="primary" type="submit" disabled={!agentInput.trim()}>
                <PaperPlaneTilt size={16} />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// Replaced OpenAI key checker with Workers AI binding check
async function HasWorkersAIKey() {
  const res = await fetch("/check-workers-ai-key");
  const hasKey = await res.json();
  if (!hasKey.success) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-red-500/10 p-4 text-center">
        <p className="text-red-600 dark:text-red-400 font-semibold">
          Workers AI API Key or Gateway Binding Missing – configure in your Worker environment.
        </p>
      </div>
    );
  }
  return null;
}
