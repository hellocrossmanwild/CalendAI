import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Send, Loader2, Sparkles, Globe, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PreviewEventType {
  name: string;
  slug: string;
  description: string;
  duration: number;
  location?: string;
  questions?: string[];
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface ScanResult {
  businessName?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  [key: string]: unknown;
}

interface ChatResponse {
  response: string;
  action?: {
    type: string;
    url?: string;
  };
  complete?: boolean;
  eventType?: Omit<PreviewEventType, "logo" | "primaryColor" | "secondaryColor"> & {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
}

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hi! Let's create a new event type for your scheduling page. What kind of meeting is this? For example: Discovery Call, Consultation, Intro Chat...",
};

export default function EventTypeAICreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [previewEventType, setPreviewEventType] = useState<PreviewEventType | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages change or scanning state changes
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, scanning]);

  const scanMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/ai/scan-website", { url });
      return res.json() as Promise<ScanResult>;
    },
    onMutate: () => {
      setScanning(true);
    },
    onSuccess: (data) => {
      setScanning(false);
      setScanResult(data);

      const brandingSummary = [
        data.businessName ? `Business: ${data.businessName}` : null,
        data.primaryColor ? `Colors: ${data.primaryColor}` : null,
        data.logo ? "Logo found" : null,
      ]
        .filter(Boolean)
        .join(", ");

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: brandingSummary
          ? `I found your branding! ${brandingSummary}. Let me put together your event type...`
          : "I scanned your website but couldn't extract much branding. Let me continue building your event type with what we have...",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: () => {
      setScanning(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I wasn't able to extract branding from that website, but no worries — we can continue without it. Let me keep building your event type.",
        },
      ]);
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const outgoingMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: userMessage },
      ];

      // If we have scan results, append context so the AI is aware
      if (scanResult) {
        outgoingMessages.push({
          role: "user",
          content: `[System context — website scan results: ${JSON.stringify(scanResult)}]`,
        });
      }

      const res = await apiRequest("POST", "/api/ai/create-event-type", {
        messages: outgoingMessages,
      });
      return res.json() as Promise<ChatResponse>;
    },
    onSuccess: (data, userMessage) => {
      const userMsg: ChatMessage = { role: "user", content: userMessage };
      const assistantMsg: ChatMessage = { role: "assistant", content: data.response };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");

      if (data.action?.type === "scan_website" && data.action.url) {
        scanMutation.mutate(data.action.url);
      }

      if (data.complete && data.eventType) {
        const merged: PreviewEventType = {
          ...data.eventType,
          logo: data.eventType.logo ?? scanResult?.logo,
          primaryColor: data.eventType.primaryColor ?? scanResult?.primaryColor,
          secondaryColor: data.eventType.secondaryColor ?? scanResult?.secondaryColor,
        };
        setPreviewEventType(merged);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Something went wrong",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (eventTypeData: PreviewEventType) => {
      return apiRequest("POST", "/api/event-types", eventTypeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-types"] });
      toast({ title: "Event type created!" });
      setLocation("/event-types");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create event type",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = chatMutation.isPending || scanMutation.isPending;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/event-types" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Create with AI</h1>
            <p className="text-muted-foreground">
              Describe your event type and AI will set it up for you
            </p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <Card>
        <CardHeader>
          <CardTitle>AI Assistant</CardTitle>
          <CardDescription>
            Chat with the assistant to configure your new event type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScrollArea className="h-[400px] pr-4" data-testid="chat-scroll-area">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                    data-testid={`chat-message-${msg.role}-${i}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading bubble while waiting for AI response */}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}

              {/* Scanning website indicator */}
              {scanning && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 animate-pulse text-primary" />
                    <span>Scanning website...</span>
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                </div>
              )}

              {/* Scroll sentinel */}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your event type..."
              disabled={isBusy}
              data-testid="input-chat"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              size="icon"
              data-testid="button-send"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview card */}
      {previewEventType && (
        <Card data-testid="preview-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              <CardTitle>Event Type Preview</CardTitle>
            </div>
            <CardDescription>
              Review the AI-generated event type before creating it
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Logo and name */}
            <div className="flex items-start gap-4">
              {previewEventType.logo && (
                <img
                  src={previewEventType.logo}
                  alt="Logo"
                  className="h-12 w-12 rounded-md object-contain border"
                  data-testid="preview-logo"
                />
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-semibold" data-testid="preview-name">
                  {previewEventType.name}
                </h3>
                {previewEventType.description && (
                  <p
                    className="text-sm text-muted-foreground mt-1"
                    data-testid="preview-description"
                  >
                    {previewEventType.description}
                  </p>
                )}
              </div>
            </div>

            {/* Duration and location badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="preview-duration">
                {previewEventType.duration} min
              </Badge>
              {previewEventType.location && (
                <Badge variant="outline" data-testid="preview-location">
                  {previewEventType.location}
                </Badge>
              )}
              <Badge variant="outline" className="font-mono text-xs" data-testid="preview-slug">
                /book/{previewEventType.slug}
              </Badge>
            </div>

            {/* Branding colors */}
            {(previewEventType.primaryColor || previewEventType.secondaryColor) && (
              <div>
                <p className="text-sm font-medium mb-2">Brand Colors</p>
                <div className="flex items-center gap-3">
                  {previewEventType.primaryColor && (
                    <div className="flex items-center gap-2" data-testid="preview-primary-color">
                      <div
                        className="h-8 w-8 rounded-md border shadow-sm"
                        style={{ backgroundColor: previewEventType.primaryColor }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">
                        {previewEventType.primaryColor}
                      </span>
                    </div>
                  )}
                  {previewEventType.secondaryColor && (
                    <div className="flex items-center gap-2" data-testid="preview-secondary-color">
                      <div
                        className="h-8 w-8 rounded-md border shadow-sm"
                        style={{ backgroundColor: previewEventType.secondaryColor }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">
                        {previewEventType.secondaryColor}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Questions list */}
            {previewEventType.questions && previewEventType.questions.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Pre-qualification Questions</p>
                <ul className="space-y-1" data-testid="preview-questions">
                  {previewEventType.questions.map((q, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => createMutation.mutate(previewEventType)}
                disabled={createMutation.isPending}
                data-testid="button-create"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Create Event Type
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/event-types/new")}
                data-testid="button-edit-manually"
              >
                Edit Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
