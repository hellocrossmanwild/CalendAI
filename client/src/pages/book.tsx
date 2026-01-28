import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2, CheckCircle, ArrowLeft, Send, Upload, X, Paperclip, CalendarPlus, ExternalLink, User, Mail, Globe, ChevronDown, FileText, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { EventTypeWithHost } from "@shared/schema";
import { format, addDays, startOfWeek, addWeeks, isSameDay, isToday, isBefore, startOfDay } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";
import { downloadICSFile, generateGoogleCalendarURL } from "@/lib/ics";
import type { ICSEventParams } from "@/lib/ics";

interface TimeSlot {
  time: string;
  available: boolean;
  utc: string;
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

type BookingStep = "calendar" | "time" | "info" | "chat" | "confirm";

interface ExtractedData {
  name?: string;
  email?: string;
  company?: string;
  summary?: string;
  keyPoints?: string[];
  timeline?: string;
  documents?: string[];
}

const ACCEPTED_FILE_TYPES = [".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

// --- SEO Meta Tag Helpers ---

const DEFAULT_TITLE = "CalendAI - AI-First Scheduling Platform";
const DEFAULT_DESCRIPTION =
  "AI-powered scheduling that simplifies setup, enriches leads with web research, conducts conversational pre-qualification, and generates meeting prep briefs.";
const DEFAULT_OG_TITLE = "CalendAI - Smart Scheduling Made Simple";
const DEFAULT_OG_DESCRIPTION =
  "Transform your scheduling workflow with AI-powered lead enrichment, conversational pre-qualification, and automated meeting prep.";

function updateMetaTag(property: string, content: string) {
  const isOg = property.startsWith("og:");
  const selector = isOg
    ? `meta[property="${property}"]`
    : `meta[name="${property}"]`;
  let tag = document.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    if (isOg) {
      tag.setAttribute("property", property);
    } else {
      tag.setAttribute("name", property);
    }
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function resetMetaTags() {
  document.title = DEFAULT_TITLE;
  updateMetaTag("description", DEFAULT_DESCRIPTION);
  updateMetaTag("og:title", DEFAULT_OG_TITLE);
  updateMetaTag("og:description", DEFAULT_OG_DESCRIPTION);
  updateMetaTag("og:type", "website");
}

// --- Timezone Helpers ---

const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Pacific/Midway", label: "Midway Island (UTC-11:00)" },
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10:00)" },
  { value: "America/Anchorage", label: "Alaska (UTC-09:00)" },
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-08:00)" },
  { value: "America/Denver", label: "Mountain Time (UTC-07:00)" },
  { value: "America/Chicago", label: "Central Time (UTC-06:00)" },
  { value: "America/New_York", label: "Eastern Time (UTC-05:00)" },
  { value: "America/Caracas", label: "Venezuela (UTC-04:30)" },
  { value: "America/Halifax", label: "Atlantic Time (UTC-04:00)" },
  { value: "America/St_Johns", label: "Newfoundland (UTC-03:30)" },
  { value: "America/Sao_Paulo", label: "Brasilia (UTC-03:00)" },
  { value: "Atlantic/South_Georgia", label: "Mid-Atlantic (UTC-02:00)" },
  { value: "Atlantic/Azores", label: "Azores (UTC-01:00)" },
  { value: "Europe/London", label: "London (UTC+00:00)" },
  { value: "Europe/Paris", label: "Paris, Berlin (UTC+01:00)" },
  { value: "Europe/Helsinki", label: "Helsinki, Kyiv (UTC+02:00)" },
  { value: "Europe/Moscow", label: "Moscow (UTC+03:00)" },
  { value: "Asia/Tehran", label: "Tehran (UTC+03:30)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+04:00)" },
  { value: "Asia/Kabul", label: "Kabul (UTC+04:30)" },
  { value: "Asia/Karachi", label: "Karachi (UTC+05:00)" },
  { value: "Asia/Kolkata", label: "Mumbai, Kolkata (UTC+05:30)" },
  { value: "Asia/Kathmandu", label: "Kathmandu (UTC+05:45)" },
  { value: "Asia/Dhaka", label: "Dhaka (UTC+06:00)" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+07:00)" },
  { value: "Asia/Shanghai", label: "Beijing, Shanghai (UTC+08:00)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+09:00)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10:00)" },
  { value: "Pacific/Noumea", label: "New Caledonia (UTC+11:00)" },
  { value: "Pacific/Auckland", label: "Auckland (UTC+12:00)" },
];

function getTimezoneLabel(tz: string): string {
  const found = COMMON_TIMEZONES.find((t) => t.value === tz);
  return found ? `${found.label} - ${tz}` : tz.replace(/_/g, " ");
}

export default function BookPage() {
  const [, params] = useRoute("/book/:slug");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<BookingStep>("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTimeUTC, setSelectedTimeUTC] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [chatComplete, setChatComplete] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);
  const timezoneSelectorRef = useRef<HTMLDivElement>(null);
  const [bookingTokens, setBookingTokens] = useState<{ rescheduleToken?: string; cancelToken?: string } | null>(null);

  const { data: eventType, isLoading } = useQuery<EventTypeWithHost>({
    queryKey: ["/api/public/event-types", params?.slug],
    enabled: !!params?.slug,
  });

  // Dynamic SEO: update document title and meta tags when event type data loads
  useEffect(() => {
    if (!eventType) return;

    const hostName = [eventType.host?.firstName, eventType.host?.lastName]
      .filter(Boolean)
      .join(" ");
    const pageTitle = hostName
      ? `Book ${eventType.name} with ${hostName} | CalendAI`
      : `Book ${eventType.name} | CalendAI`;
    const description =
      eventType.description || `Schedule a ${eventType.duration}-minute ${eventType.name} meeting on CalendAI.`;

    document.title = pageTitle;
    updateMetaTag("description", description);
    updateMetaTag("og:title", pageTitle);
    updateMetaTag("og:description", description);
    updateMetaTag("og:type", "website");

    return () => {
      resetMetaTags();
    };
  }, [eventType]);

  // Close timezone selector when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timezoneSelectorRef.current && !timezoneSelectorRef.current.contains(event.target as Node)) {
        setShowTimezoneSelector(false);
      }
    }
    if (showTimezoneSelector) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTimezoneSelector]);

  // --- Iframe Embed Support ---
  // Detect if the booking page is embedded inside an iframe (widget embed).
  // When embedded, we send height updates and booking-confirmed events to the
  // parent window via postMessage so the widget.js script can react.
  const isEmbedded = useRef(
    typeof window !== "undefined" && window !== window.parent
  );

  const sendMessageToParent = useCallback(
    (message: Record<string, unknown>) => {
      if (!isEmbedded.current) return;
      try {
        window.parent.postMessage(
          { source: "calendai", ...message },
          "*"
        );
      } catch {
        // Cross-origin postMessage may silently fail in some edge cases
      }
    },
    []
  );

  // Observe the page height and notify parent iframe when it changes
  useEffect(() => {
    if (!isEmbedded.current) return;

    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      sendMessageToParent({ type: "calendai:resize", height });
    };

    // Send initial height
    sendHeight();

    // Use ResizeObserver for efficient height tracking
    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(() => {
        sendHeight();
      });
      resizeObs.observe(document.documentElement);
    }

    // Also observe DOM mutations (step transitions cause layout changes)
    const mutationObs = new MutationObserver(() => {
      requestAnimationFrame(sendHeight);
    });
    mutationObs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Fallback interval for browsers without ResizeObserver
    const interval = !resizeObs ? setInterval(sendHeight, 500) : undefined;

    return () => {
      resizeObs?.disconnect();
      mutationObs.disconnect();
      if (interval) clearInterval(interval);
    };
  }, [sendMessageToParent]);

  // Send height update whenever the booking step changes
  useEffect(() => {
    if (!isEmbedded.current) return;
    const timer = setTimeout(() => {
      const height = document.documentElement.scrollHeight;
      sendMessageToParent({ type: "calendai:resize", height });
    }, 100);
    return () => clearTimeout(timer);
  }, [step, sendMessageToParent]);


  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["/api/public/availability", params?.slug, selectedDate?.toISOString(), timezone],
    queryFn: async () => {
      const dateParam = selectedDate ? `date=${encodeURIComponent(selectedDate.toISOString())}` : "";
      const tzParam = `timezone=${encodeURIComponent(timezone)}`;
      const query = [dateParam, tzParam].filter(Boolean).join("&");
      const res = await fetch(`/api/public/availability/${params?.slug}?${query}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!params?.slug && !!selectedDate,
  });

  const bookMutation = useMutation({
    mutationFn: async (data: {
      eventTypeSlug: string;
      date: string;
      time: string;
      startTimeUTC?: string;
      name: string;
      email: string;
      phone?: string;
      company?: string;
      notes?: string;
      timezone?: string;
      chatHistory?: ChatMessage[];
      documents?: { name: string; path: string }[];
    }) => {
      const res = await apiRequest("POST", "/api/public/book", data);
      return res.json();
    },
    onSuccess: (data: { rescheduleToken?: string; cancelToken?: string }) => {
      setBookingTokens({ rescheduleToken: data.rescheduleToken, cancelToken: data.cancelToken });
      setStep("confirm");
      // Notify parent window (widget embed) that booking was confirmed
      sendMessageToParent({
        type: "calendai:booking-confirmed",
        booking: {
          slug: params?.slug,
          date: selectedDate?.toISOString(),
          time: selectedTime,
          name: formData.name,
          email: formData.email,
        },
      });
    },
    onError: (error: Error) => {
      const is409 = error.message.startsWith("409");
      if (is409) {
        // Conflict: slot was booked by someone else. Re-fetch availability
        // and send the booker back to the time selection step.
        toast({
          title: "Time slot no longer available",
          description: "This slot was just booked. Please select another time.",
          variant: "destructive",
        });
        setSelectedTime(null);
        setSelectedTimeUTC(null);
        setStep("time");
        queryClient.invalidateQueries({
          queryKey: ["/api/public/availability", params?.slug],
        });
      } else {
        toast({ title: "Booking failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const hostName = eventType?.host
        ? `${eventType.host.firstName || ""} ${eventType.host.lastName || ""}`.trim() || undefined
        : undefined;
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeSlug: params?.slug,
          messages: [...chatMessages, { role: "user", content: message }],
          guestInfo: formData,
          hostName,
        }),
      });
      return response.json();
    },
    onSuccess: (data, message) => {
      const newUserMsg: ChatMessage = { role: "user", content: message };
      const newAssistantMsg: ChatMessage = { role: "assistant", content: data.response };

      setChatMessages((prev) => [...prev, newUserMsg, newAssistantMsg]);

      // Only clear chat input for text messages, not document uploads
      if (!message.startsWith("[Document uploaded:")) {
        setChatInput("");
      }

      if (data.complete) {
        setChatComplete(true);
        setExtractedData(data.extractedData || null);
      }
    },
  });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const handleDateSelect = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return;
    setSelectedDate(date);
    setStep("time");
  };

  const handleTimeSelect = (time: string, utc: string) => {
    setSelectedTime(time);
    setSelectedTimeUTC(utc);
    setStep("info");
  };

  const handleInfoSubmit = () => {
    // Reset validation errors
    setPhoneError("");
    setEmailError("");

    if (!formData.name || !formData.email) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }

    let hasError = false;

    // Email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    }

    // Phone validation (optional field)
    const phoneRegex = /^\+?[\d\s\-()]+$/;
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      setPhoneError("Please enter a valid phone number");
      hasError = true;
    }

    if (hasError) return;

    if (eventType?.questions && eventType.questions.length > 0) {
      setChatMessages([
        { role: "assistant", content: `Hi ${formData.name}! I have a few quick questions to make sure this meeting is a good fit. ${eventType.questions[0]}` },
      ]);
      setChatComplete(false);
      setExtractedData(null);
      setStep("chat");
    } else {
      handleBooking();
    }
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    chatMutation.mutate(chatInput);
  };

  const handleBooking = (chatHistoryOverride?: ChatMessage[]) => {
    if (!selectedDate || !selectedTime || !params?.slug) return;

    bookMutation.mutate({
      eventTypeSlug: params.slug,
      date: selectedDate.toISOString(),
      time: selectedTime,
      startTimeUTC: selectedTimeUTC || undefined,
      name: formData.name,
      email: formData.email,
      phone: formData.phone || undefined,
      company: formData.company,
      notes: formData.notes,
      timezone,
      chatHistory: chatHistoryOverride ?? chatMessages,
      documents: uploadedFiles,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formDataObj = new FormData();
    formDataObj.append("file", file);

    try {
      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      const { uploadURL, objectPath } = await urlResponse.json();
      
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      setUploadedFiles((prev) => [...prev, { name: file.name, path: objectPath }]);
      toast({ title: "File uploaded" });
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChatFileUpload = async (file: File) => {
    // Validate file type
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!ACCEPTED_FILE_TYPES.includes(ext)) {
      toast({
        title: "Invalid file type",
        description: `Accepted types: ${ACCEPTED_FILE_TYPES.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB`,
        variant: "destructive",
      });
      return;
    }

    // Sanitize filename (strip path components)
    const sanitizedName = file.name.replace(/^.*[\\/]/, "");

    try {
      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sanitizedName,
          size: file.size,
          contentType: file.type,
        }),
      });
      const { uploadURL, objectPath } = await urlResponse.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      setUploadedFiles((prev) => [...prev, { name: sanitizedName, path: objectPath }]);

      // Send document notification to AI via chat
      const docMessage = `[Document uploaded: ${sanitizedName}]`;
      chatMutation.mutate(docMessage);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const handleChatFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleChatFileUpload(file);
    // Reset file input so the same file can be uploaded again
    e.target.value = "";
  };

  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleChatFileUpload(file);
  };

  // Brand colors derived from event type settings, falling back to user defaults
  const brandPrimary = eventType?.primaryColor || eventType?.host?.defaultPrimaryColor || eventType?.color || "#6366f1";
  const brandSecondary = eventType?.secondaryColor || eventType?.host?.defaultSecondaryColor || brandPrimary;

  // Host display helpers
  const hostInitials = eventType?.host
    ? `${eventType.host.firstName?.[0] || ""}${eventType.host.lastName?.[0] || ""}`.toUpperCase()
    : "";
  const hostFullName = eventType?.host
    ? `${eventType.host.firstName || ""} ${eventType.host.lastName || ""}`.trim()
    : "";

  // Step progress tracking
  const bookingSteps: BookingStep[] = [
    "calendar",
    "time",
    "info",
    ...(eventType?.questions?.length ? ["chat" as BookingStep] : []),
  ];
  const currentStepIndex = bookingSteps.indexOf(step);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-12 w-12 rounded-md mx-auto" />
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!eventType) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
            <p className="text-muted-foreground">This booking link is not valid or has been disabled.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "confirm") {
    const confirmStartTime = selectedTimeUTC ? new Date(selectedTimeUTC) : null;

    const icsParams: ICSEventParams | null = confirmStartTime
      ? {
          summary: eventType.name,
          description: formData.notes || undefined,
          startTime: confirmStartTime,
          durationMinutes: eventType.duration,
          location: eventType.location || undefined,
          organizerName: eventType.host
            ? [eventType.host.firstName, eventType.host.lastName].filter(Boolean).join(" ") || undefined
            : undefined,
          attendeeEmail: formData.email,
          attendeeName: formData.name,
        }
      : null;

    const handleDownloadICS = () => {
      if (!icsParams || !selectedDate) return;
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const filename = `booking-${params?.slug || "event"}-${dateStr}.ics`;
      downloadICSFile(icsParams, filename);
    };

    const handleOpenGoogleCalendar = () => {
      if (!icsParams) return;
      const url = generateGoogleCalendarURL(icsParams);
      window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card
          className="w-full max-w-md"
          style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
        >
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
                style={{ backgroundColor: `${brandPrimary}15` }}
              >
                <CheckCircle className="h-8 w-8" style={{ color: brandPrimary }} />
              </div>
              <h2 className="text-xl font-semibold mb-2">Booking Confirmed!</h2>
              <p className="text-muted-foreground">
                {hostFullName
                  ? `Your booking with ${hostFullName} is confirmed! You'll find the details below.`
                  : "Your booking is confirmed! You'll find the details below."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                A confirmation email has been sent to <span className="font-medium">{formData.email}</span>.
                {" "}If you don't see it, please check your spam folder.
              </p>
            </div>

            <div
              className="rounded-lg border bg-muted/30 p-4 space-y-3 mb-6"
              style={{ borderColor: `${brandSecondary}30` }}
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{eventType.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {eventType.duration} minutes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")} at {selectedTime}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm">{formData.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm">{formData.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full text-white"
                onClick={handleDownloadICS}
                disabled={!icsParams}
                style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
                data-testid="button-download-ics"
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                Add to Calendar (.ics)
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleOpenGoogleCalendar}
                disabled={!icsParams}
                style={{ borderColor: `${brandSecondary}60`, color: brandSecondary }}
                data-testid="button-google-calendar"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Google Calendar
              </Button>
            </div>

            {/* Reschedule / Cancel links (F12) */}
            {bookingTokens && (bookingTokens.rescheduleToken || bookingTokens.cancelToken) && (
              <div className="pt-4 border-t mt-4">
                <p className="text-xs text-muted-foreground text-center mb-2">Need to make changes?</p>
                <div className="flex gap-2 justify-center">
                  {bookingTokens.rescheduleToken && (
                    <a
                      href={`/booking/reschedule/${bookingTokens.rescheduleToken}`}
                      className="text-xs hover:underline"
                      style={{ color: brandPrimary }}
                      data-testid="link-reschedule"
                    >
                      Reschedule
                    </a>
                  )}
                  {bookingTokens.rescheduleToken && bookingTokens.cancelToken && (
                    <span className="text-xs text-muted-foreground">|</span>
                  )}
                  {bookingTokens.cancelToken && (
                    <a
                      href={`/booking/cancel/${bookingTokens.cancelToken}`}
                      className="text-xs text-muted-foreground hover:underline hover:text-destructive"
                      data-testid="link-cancel"
                    >
                      Cancel booking
                    </a>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{
        "--brand-primary": brandPrimary,
        "--brand-secondary": brandSecondary,
      } as React.CSSProperties}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 text-center">
          {/* Host profile section */}
          {eventType.host && (eventType.host.firstName || eventType.host.lastName) && (
            <div className="flex flex-col items-center mb-4">
              {eventType.host.profileImageUrl ? (
                <img
                  src={eventType.host.profileImageUrl}
                  alt={hostFullName}
                  className="h-16 w-16 rounded-full object-cover border-2"
                  style={{ borderColor: `${brandSecondary}40` }}
                />
              ) : hostInitials ? (
                <div
                  className="h-16 w-16 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                  style={{ backgroundColor: brandPrimary }}
                >
                  {hostInitials}
                </div>
              ) : null}
              <p className="text-sm font-medium text-muted-foreground mt-2">{hostFullName}</p>
            </div>
          )}

          {/* Event logo / icon */}
          <div
            className="inline-flex h-14 w-14 items-center justify-center rounded-lg mb-4 overflow-hidden"
            style={{ backgroundColor: `${brandPrimary}20`, color: brandPrimary }}
          >
            {(eventType.logo || eventType.host?.defaultLogo) ? (
              <img src={eventType.logo || eventType.host?.defaultLogo || ""} alt={eventType.name} className="h-12 w-12 object-contain" />
            ) : (
              <Calendar className="h-7 w-7" />
            )}
          </div>
          <h1 className="text-2xl font-semibold mb-2">{eventType.name}</h1>
          {eventType.description && (
            <p className="text-muted-foreground max-w-md mx-auto">{eventType.description}</p>
          )}
          <Badge
            variant="secondary"
            className="mt-3"
            style={{
              backgroundColor: `${brandPrimary}15`,
              color: brandPrimary,
              borderColor: `${brandSecondary}40`,
            }}
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            {eventType.duration} minutes
          </Badge>

          {/* Step progress indicator */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {bookingSteps.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  i <= currentStepIndex ? "w-8" : "w-4 opacity-40"
                }`}
                style={{
                  backgroundColor: i <= currentStepIndex
                    ? brandPrimary
                    : `${brandSecondary}30`,
                }}
              />
            ))}
          </div>
        </div>

        {step !== "calendar" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === "time") setStep("calendar");
              else if (step === "info") setStep("time");
              else if (step === "chat") setStep("info");
            }}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        )}

        {step === "calendar" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Select a Date</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setWeekStart(addWeeks(weekStart, -1))}
                    data-testid="button-prev-week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[120px] text-center">
                    {format(weekStart, "MMM yyyy")}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                    data-testid="button-next-week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const isPast = isBefore(day, startOfDay(new Date()));
                  const isSelected = selectedDate && isSameDay(day, selectedDate);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateSelect(day)}
                      disabled={isPast}
                      className={`
                        p-4 rounded-lg text-center transition-all
                        ${isPast ? "opacity-40 cursor-not-allowed" : "hover-elevate cursor-pointer"}
                        ${isSelected ? "text-white" : "bg-muted"}
                        ${isToday(day) && !isSelected ? "ring-2 ring-offset-2" : ""}
                      `}
                      style={{
                        ...(isSelected ? { backgroundColor: brandPrimary } : {}),
                        ...(isToday(day) && !isSelected ? { "--tw-ring-color": brandPrimary } as React.CSSProperties : {}),
                      }}
                      data-testid={`button-date-${format(day, "yyyy-MM-dd")}`}
                    >
                      <div className="text-xs text-muted-foreground mb-1">
                        {format(day, "EEE")}
                      </div>
                      <div className="text-lg font-semibold">{format(day, "d")}</div>
                    </button>
                  );
                })}
              </div>

              {/* Timezone display */}
              <div className="relative mt-4 flex items-center justify-center" ref={timezoneSelectorRef}>
                <button
                  onClick={() => setShowTimezoneSelector(!showTimezoneSelector)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-timezone"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Times shown in {getTimezoneLabel(timezone)}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showTimezoneSelector && (
                  <div className="absolute top-full mt-1 z-50 w-80 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md" data-testid="timezone-dropdown">
                    {COMMON_TIMEZONES.map((tz) => (
                      <button
                        key={tz.value}
                        onClick={() => {
                          setTimezone(tz.value);
                          setShowTimezoneSelector(false);
                        }}
                        className={`w-full text-left text-sm px-3 py-2 rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                          timezone === tz.value ? "bg-accent text-accent-foreground font-medium" : ""
                        }`}
                        data-testid={`timezone-option-${tz.value}`}
                      >
                        {tz.label} ({tz.value})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "time" && selectedDate && (
          <Card>
            <CardHeader>
              <CardTitle>Select a Time</CardTitle>
              <CardDescription>{format(selectedDate, "EEEE, MMMM d, yyyy")}</CardDescription>
            </CardHeader>
            <CardContent>
              {slotsLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : !slots || slots.filter((s) => s.available).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No available times on this date. Please select another day.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots
                    .filter((slot) => slot.available)
                    .map((slot) => (
                      <Button
                        key={slot.utc || slot.time}
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        onClick={() => handleTimeSelect(slot.time, slot.utc)}
                        style={selectedTime === slot.time ? { backgroundColor: brandPrimary, borderColor: brandPrimary } : undefined}
                        data-testid={`button-time-${slot.time.replace(":", "")}`}
                      >
                        {slot.time}
                      </Button>
                    ))}
                </div>
              )}

              {/* Timezone indicator on time step */}
              <div className="relative mt-4 flex items-center justify-center" ref={!showTimezoneSelector || step === "time" ? timezoneSelectorRef : undefined}>
                <button
                  onClick={() => setShowTimezoneSelector(!showTimezoneSelector)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-timezone-time"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Times shown in {getTimezoneLabel(timezone)}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showTimezoneSelector && (
                  <div className="absolute top-full mt-1 z-50 w-80 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md" data-testid="timezone-dropdown-time">
                    {COMMON_TIMEZONES.map((tz) => (
                      <button
                        key={tz.value}
                        onClick={() => {
                          setTimezone(tz.value);
                          setShowTimezoneSelector(false);
                        }}
                        className={`w-full text-left text-sm px-3 py-2 rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                          timezone === tz.value ? "bg-accent text-accent-foreground font-medium" : ""
                        }`}
                      >
                        {tz.label} ({tz.value})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "info" && (
          <Card>
            <CardHeader>
              <CardTitle>Your Information</CardTitle>
              <CardDescription>
                {format(selectedDate!, "EEEE, MMMM d")} at {selectedTime}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your full name"
                  data-testid="input-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (emailError) setEmailError("");
                  }}
                  placeholder="you@example.com"
                  data-testid="input-email"
                />
                {emailError && (
                  <p className="text-sm text-destructive mt-1">{emailError}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Phone (optional)</label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (phoneError) setPhoneError("");
                  }}
                  placeholder="+1 (555) 123-4567"
                  data-testid="input-phone"
                />
                {phoneError && (
                  <p className="text-sm text-destructive mt-1">{phoneError}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Company</label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Your company name"
                  data-testid="input-company"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Additional Notes</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Anything you'd like us to know..."
                  rows={3}
                  data-testid="input-notes"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Attachments</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {uploadedFiles.map((file, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      <Paperclip className="h-3 w-3" />
                      {file.name}
                      <button onClick={() => removeFile(i)} className="ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <label className="cursor-pointer">
                  <div
                    className="flex items-center justify-center border-2 border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    style={{ borderColor: `${brandSecondary}40` }}
                  >
                    <Upload className="h-5 w-5 mr-2 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload documents</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    data-testid="input-file"
                  />
                </label>
              </div>

              <Button
                className="w-full text-white"
                onClick={handleInfoSubmit}
                style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
                data-testid="button-continue"
              >
                {eventType.questions && eventType.questions.length > 0 ? "Continue" : "Confirm Booking"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "chat" && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Questions</CardTitle>
              <CardDescription>Help us prepare for your meeting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={handleChatDragOver}
                onDragLeave={handleChatDragLeave}
                onDrop={handleChatDrop}
                className={`relative ${isDragOver ? "ring-2 rounded-lg" : ""}`}
                style={isDragOver ? { "--tw-ring-color": brandPrimary } as React.CSSProperties : undefined}
              >
                {isDragOver && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 rounded-lg border-2 border-dashed"
                    style={{ borderColor: brandPrimary }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8" style={{ color: brandPrimary }} />
                      <p className="text-sm font-medium" style={{ color: brandPrimary }}>
                        Drop file to upload
                      </p>
                    </div>
                  </div>
                )}
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg, i) => {
                      const isDocUpload =
                        msg.role === "user" && msg.content.startsWith("[Document uploaded:");
                      const docName = isDocUpload
                        ? msg.content.replace("[Document uploaded: ", "").replace("]", "")
                        : null;

                      return (
                        <div
                          key={i}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          {isDocUpload ? (
                            <div
                              className="max-w-[80%] rounded-lg px-4 py-2 flex items-center gap-2 text-white"
                              style={{ backgroundColor: brandPrimary }}
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="text-sm truncate">{docName}</span>
                            </div>
                          ) : (
                            <div
                              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                msg.role === "user" ? "text-white" : "bg-muted"
                              }`}
                              style={msg.role === "user" ? { backgroundColor: brandPrimary } : undefined}
                            >
                              {msg.content}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {chatMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg px-4 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Summary Card — shown when AI signals conversation is complete */}
              {chatComplete && extractedData && (
                <div
                  className="rounded-lg border p-4 space-y-3"
                  style={{ borderColor: `${brandPrimary}40` }}
                >
                  <h3 className="font-semibold text-sm" style={{ color: brandPrimary }}>
                    Here&apos;s what we&apos;ve got:
                  </h3>
                  <ul className="space-y-1.5 text-sm">
                    {extractedData.name && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Name:</span>
                        <span>{extractedData.name}</span>
                      </li>
                    )}
                    {extractedData.email && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Email:</span>
                        <span>{extractedData.email}</span>
                      </li>
                    )}
                    {formData.phone && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Phone:</span>
                        <span>{formData.phone}</span>
                      </li>
                    )}
                    {extractedData.company && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Company:</span>
                        <span>{extractedData.company}</span>
                      </li>
                    )}
                    {extractedData.summary && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Looking to:</span>
                        <span>{extractedData.summary}</span>
                      </li>
                    )}
                    {extractedData.timeline && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Timeline:</span>
                        <span>{extractedData.timeline}</span>
                      </li>
                    )}
                    {extractedData.documents && extractedData.documents.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Documents:</span>
                        <span>{extractedData.documents.join(", ")}</span>
                      </li>
                    )}
                  </ul>
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 text-white"
                      onClick={() => handleBooking()}
                      disabled={bookMutation.isPending}
                      style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
                      data-testid="button-confirm-booking"
                    >
                      {bookMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Confirm Booking
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setChatComplete(false);
                        setExtractedData(null);
                        setStep("info");
                      }}
                      style={{ borderColor: `${brandSecondary}60`, color: brandSecondary }}
                      data-testid="button-edit"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )}

              {/* Chat input — hidden when conversation is complete */}
              {!chatComplete && (
                <>
                  <div className="flex gap-2">
                    <input
                      ref={chatFileInputRef}
                      type="file"
                      className="hidden"
                      accept={ACCEPTED_FILE_TYPES.join(",")}
                      onChange={handleChatFileInputChange}
                      data-testid="input-chat-file"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => chatFileInputRef.current?.click()}
                      disabled={chatMutation.isPending}
                      className="shrink-0"
                      data-testid="button-chat-upload"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type your response..."
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                      disabled={chatMutation.isPending}
                      data-testid="input-chat"
                    />
                    <Button
                      onClick={handleChatSend}
                      disabled={!chatInput.trim() || chatMutation.isPending}
                      className="text-white"
                      style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
                      data-testid="button-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleBooking()}
                    disabled={bookMutation.isPending}
                    style={{ borderColor: `${brandSecondary}60`, color: brandSecondary }}
                    data-testid="button-skip-book"
                  >
                    {bookMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Skip & Book Now
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
