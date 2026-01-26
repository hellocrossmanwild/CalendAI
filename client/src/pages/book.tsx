import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2, CheckCircle, ArrowLeft, Send, Upload, X, Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { EventType } from "@shared/schema";
import { format, addDays, startOfWeek, addWeeks, isSameDay, isToday, isBefore, startOfDay } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

type BookingStep = "calendar" | "time" | "info" | "chat" | "confirm";

export default function BookPage() {
  const [, params] = useRoute("/book/:slug");
  const { toast } = useToast();

  const [step, setStep] = useState<BookingStep>("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    notes: "",
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);

  const { data: eventType, isLoading } = useQuery<EventType>({
    queryKey: ["/api/public/event-types", params?.slug],
    enabled: !!params?.slug,
  });

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["/api/public/availability", params?.slug, selectedDate?.toISOString()],
    enabled: !!params?.slug && !!selectedDate,
  });

  const bookMutation = useMutation({
    mutationFn: async (data: {
      eventTypeSlug: string;
      date: string;
      time: string;
      name: string;
      email: string;
      company?: string;
      notes?: string;
      chatHistory?: ChatMessage[];
      documents?: { name: string; path: string }[];
    }) => {
      return apiRequest("POST", "/api/public/book", data);
    },
    onSuccess: () => {
      setStep("confirm");
    },
    onError: (error: Error) => {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeSlug: params?.slug,
          messages: [...chatMessages, { role: "user", content: message }],
          guestInfo: formData,
        }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatMessages((prev) => [
        ...prev,
        { role: "user", content: chatInput },
        { role: "assistant", content: data.response },
      ]);
      setChatInput("");
      
      if (data.complete) {
        handleBooking();
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

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setStep("info");
  };

  const handleInfoSubmit = () => {
    if (!formData.name || !formData.email) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    
    if (eventType?.questions && eventType.questions.length > 0) {
      setChatMessages([
        { role: "assistant", content: `Hi ${formData.name}! I have a few quick questions to make sure this meeting is a good fit. ${eventType.questions[0]}` },
      ]);
      setStep("chat");
    } else {
      handleBooking();
    }
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    chatMutation.mutate(chatInput);
  };

  const handleBooking = () => {
    if (!selectedDate || !selectedTime || !params?.slug) return;
    
    bookMutation.mutate({
      eventTypeSlug: params.slug,
      date: selectedDate.toISOString(),
      time: selectedTime,
      name: formData.name,
      email: formData.email,
      company: formData.company,
      notes: formData.notes,
      chatHistory: chatMessages,
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Booking Confirmed!</h2>
            <p className="text-muted-foreground mb-4">
              You&apos;re scheduled with {eventType.name} on{" "}
              {selectedDate && format(selectedDate, "EEEE, MMMM d")} at {selectedTime}.
            </p>
            <p className="text-sm text-muted-foreground">
              A confirmation email has been sent to {formData.email}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 text-center">
          <div
            className="inline-flex h-14 w-14 items-center justify-center rounded-lg mb-4 overflow-hidden"
            style={{ backgroundColor: `${eventType.primaryColor || eventType.color}20`, color: eventType.primaryColor || eventType.color || undefined }}
          >
            {eventType.logo ? (
              <img src={eventType.logo} alt={eventType.name} className="h-12 w-12 object-contain" />
            ) : (
              <Calendar className="h-7 w-7" />
            )}
          </div>
          <h1 className="text-2xl font-semibold mb-2">{eventType.name}</h1>
          {eventType.description && (
            <p className="text-muted-foreground max-w-md mx-auto">{eventType.description}</p>
          )}
          <Badge variant="secondary" className="mt-3" style={eventType.primaryColor ? { backgroundColor: `${eventType.primaryColor}15`, color: eventType.primaryColor, borderColor: `${eventType.primaryColor}30` } : undefined}>
            <Clock className="h-3.5 w-3.5 mr-1" />
            {eventType.duration} minutes
          </Badge>
        </div>

        {step !== "calendar" && step !== "confirm" && (
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
                        ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted"}
                        ${isToday(day) && !isSelected ? "ring-2 ring-primary ring-offset-2" : ""}
                      `}
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
                        key={slot.time}
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        onClick={() => handleTimeSelect(slot.time)}
                        style={selectedTime === slot.time && eventType.primaryColor ? { backgroundColor: eventType.primaryColor, borderColor: eventType.primaryColor } : undefined}
                        data-testid={`button-time-${slot.time.replace(":", "")}`}
                      >
                        {slot.time}
                      </Button>
                    ))}
                </div>
              )}
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
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  data-testid="input-email"
                />
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
                  <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors">
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
                className="w-full"
                onClick={handleInfoSubmit}
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
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-4">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
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
                  data-testid="button-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleBooking}
                disabled={bookMutation.isPending}
                data-testid="button-skip-book"
              >
                {bookMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Skip & Book Now
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
