import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Calendar,
  Clock,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sun,
  Plus,
  Minus,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

type OnboardingStep = "welcome" | "analysis" | "availability" | "confirmation";

interface TimeBlock {
  start: string;
  end: string;
}

interface DaySchedule {
  enabled: boolean;
  blocks: TimeBlock[];
}

type WeekSchedule = Record<string, DaySchedule>;

interface AnalysisSuggestions {
  weeklyHours?: Record<string, { start: string; end: string }[] | null>;
  timezone?: string;
  minNotice?: number;
  maxAdvance?: number;
  defaultBufferBefore?: number;
  defaultBufferAfter?: number;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const MIN_NOTICE_OPTIONS = [
  { label: "None", value: 0 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
  { label: "48 hours", value: 2880 },
];

const MAX_ADVANCE_OPTIONS = [
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "1 month", value: 30 },
  { label: "2 months", value: 60 },
  { label: "3 months", value: 90 },
];

function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 22 && m > 0) break;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const minute = m.toString().padStart(2, "0");
      times.push(`${hour12}:${minute} ${ampm}`);
    }
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

/** Convert 12-hour "9:00 AM" to 24-hour "09:00" */
function to24Hour(time12: string): string {
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

/** Convert 24-hour "09:00" to 12-hour "9:00 AM" */
function to12Hour(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  let hours = parseInt(hourStr, 10);
  const period = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minuteStr} ${period}`;
}

/** Convert internal WeekSchedule to API weeklyHours format */
function scheduleToWeeklyHours(
  sched: WeekSchedule
): Record<string, { start: string; end: string }[] | null> {
  const result: Record<string, { start: string; end: string }[] | null> = {};
  for (const [day, config] of Object.entries(sched)) {
    if (!config.enabled) {
      result[day] = null;
    } else {
      result[day] = config.blocks.map((b) => ({
        start: to24Hour(b.start),
        end: to24Hour(b.end),
      }));
    }
  }
  return result;
}

/** Snap a 24-hour HH:MM time to the nearest 30-minute mark within 06:00-22:00 */
function snapTo30MinGrid(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  let totalMins = h * 60 + m;
  // Round to nearest 30
  totalMins = Math.round(totalMins / 30) * 30;
  // Clamp to valid range: 06:00 (360) to 22:00 (1320)
  totalMins = Math.max(360, Math.min(1320, totalMins));
  const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
  const mm = String(totalMins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Convert API weeklyHours to internal WeekSchedule format */
function weeklyHoursToSchedule(
  wh: Record<string, { start: string; end: string }[] | null>
): WeekSchedule {
  const base = getDefaultSchedule();
  for (const [day, blocks] of Object.entries(wh)) {
    if (base[day]) {
      if (blocks === null || blocks === undefined) {
        base[day] = { enabled: false, blocks: [{ start: "9:00 AM", end: "5:00 PM" }] };
      } else {
        base[day] = {
          enabled: true,
          blocks: blocks.map((b) => ({
            start: to12Hour(snapTo30MinGrid(b.start)),
            end: to12Hour(snapTo30MinGrid(b.end)),
          })),
        };
      }
    }
  }
  return base;
}

function getDefaultSchedule(): WeekSchedule {
  const schedule: WeekSchedule = {};
  for (const day of DAY_ORDER) {
    const isWeekday = !["saturday", "sunday"].includes(day);
    schedule[day] = {
      enabled: isWeekday,
      blocks: [{ start: "9:00 AM", end: "5:00 PM" }],
    };
  }
  return schedule;
}

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];
  }
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export default function OnboardingPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [schedule, setSchedule] = useState<WeekSchedule>(getDefaultSchedule());
  const [timezone, setTimezone] = useState(detectTimezone());
  const [minNotice, setMinNotice] = useState(60);
  const [maxAdvance, setMaxAdvance] = useState(30);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [analysisSuggestions, setAnalysisSuggestions] = useState<AnalysisSuggestions | null>(null);

  const timezones = getTimezones();

  // Check calendar connection status
  const { data: calendarStatus, isLoading: calendarLoading } = useQuery<{
    connected: boolean;
    email?: string;
  }>({
    queryKey: ["/api/calendar/status"],
  });

  // Handle calendar callback (e.g., redirected back from Google OAuth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      setCalendarConnected(true);
      toast({ title: "Google Calendar connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/status"] });
      window.history.replaceState({}, "", "/onboarding");
    } else if (params.get("error") === "calendar_auth_failed") {
      toast({ title: "Failed to connect calendar", variant: "destructive" });
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [toast]);

  // Sync calendar connection status from query
  useEffect(() => {
    if (calendarStatus?.connected) {
      setCalendarConnected(true);
    }
  }, [calendarStatus]);

  // Connect calendar mutation
  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/calendar/auth", { credentials: "include" });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
    onError: () => {
      toast({ title: "Failed to connect calendar", variant: "destructive" });
    },
  });

  // AI analysis mutation
  const analyseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/availability-rules/analyse");
      return response.json();
    },
    onSuccess: (data: { suggestions: AnalysisSuggestions; message?: string }) => {
      setAnalysisSuggestions(data.suggestions);

      // Apply suggestions to schedule (API returns 24h weeklyHours, convert to internal 12h format)
      if (data.suggestions?.weeklyHours) {
        setSchedule(weeklyHoursToSchedule(data.suggestions.weeklyHours));
      }

      if (data.suggestions?.timezone) {
        setTimezone(data.suggestions.timezone);
      }
      if (data.suggestions?.minNotice !== undefined) {
        setMinNotice(data.suggestions.minNotice);
      }
      if (data.suggestions?.maxAdvance !== undefined) {
        setMaxAdvance(data.suggestions.maxAdvance);
      }

      setStep("availability");
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: "We'll use default availability instead.",
        variant: "destructive",
      });
      setStep("availability");
    },
  });

  // Save availability rules mutation
  const saveRulesMutation = useMutation({
    mutationFn: async (data: {
      schedule: WeekSchedule;
      timezone: string;
      minNotice: number;
      maxAdvance: number;
    }) => {
      // Convert internal 12h schedule to API 24h weeklyHours format
      const weeklyHours = scheduleToWeeklyHours(data.schedule);
      return apiRequest("PUT", "/api/availability-rules", {
        weeklyHours,
        timezone: data.timezone,
        minNotice: data.minNotice,
        maxAdvance: data.maxAdvance,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability-rules"] });
      setStep("confirmation");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save availability", description: error.message, variant: "destructive" });
    },
  });

  const handleConnectCalendar = () => {
    connectCalendarMutation.mutate();
  };

  const handleSkipCalendar = () => {
    setStep("availability");
  };

  const handleProceedFromWelcome = () => {
    if (calendarConnected) {
      setStep("analysis");
      analyseMutation.mutate();
    } else {
      setStep("availability");
    }
  };

  const handleSaveAvailability = () => {
    saveRulesMutation.mutate({
      schedule,
      timezone,
      minNotice,
      maxAdvance,
    });
  };

  const toggleDay = useCallback((day: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
  }, []);

  const updateBlockTime = useCallback(
    (day: string, blockIndex: number, field: "start" | "end", value: string) => {
      setSchedule((prev) => ({
        ...prev,
        [day]: {
          ...prev[day],
          blocks: prev[day].blocks.map((block, i) =>
            i === blockIndex ? { ...block, [field]: value } : block
          ),
        },
      }));
    },
    []
  );

  const addBreak = useCallback((day: string) => {
    setSchedule((prev) => {
      const daySchedule = prev[day];
      if (daySchedule.blocks.length >= 2) return prev;

      const currentBlock = daySchedule.blocks[0];
      // Calculate a midpoint for the break rather than hardcoding noon
      const startH24 = to24Hour(currentBlock.start);
      const endH24 = to24Hour(currentBlock.end);
      const [sh, sm] = startH24.split(":").map(Number);
      const [eh, em] = endH24.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      // Need at least 2 hours to split meaningfully (1h + break + 1h)
      if (endMins - startMins < 120) return prev;
      // Place break in the middle, snapped to 30 min
      const mid = Math.round((startMins + endMins) / 2 / 30) * 30;
      const breakStart = mid;
      const breakEnd = mid + 60; // 1-hour break
      const bsH = String(Math.floor(breakStart / 60)).padStart(2, "0");
      const bsM = String(breakStart % 60).padStart(2, "0");
      const beH = String(Math.floor(breakEnd / 60)).padStart(2, "0");
      const beM = String(breakEnd % 60).padStart(2, "0");
      return {
        ...prev,
        [day]: {
          ...daySchedule,
          blocks: [
            { start: currentBlock.start, end: to12Hour(`${bsH}:${bsM}`) },
            { start: to12Hour(`${beH}:${beM}`), end: currentBlock.end },
          ],
        },
      };
    });
  }, []);

  const removeBreak = useCallback((day: string) => {
    setSchedule((prev) => {
      const daySchedule = prev[day];
      if (daySchedule.blocks.length <= 1) return prev;

      return {
        ...prev,
        [day]: {
          ...daySchedule,
          blocks: [
            {
              start: daySchedule.blocks[0].start,
              end: daySchedule.blocks[daySchedule.blocks.length - 1].end,
            },
          ],
        },
      };
    });
  }, []);

  // Step indicator
  const steps: { key: OnboardingStep; label: string }[] = [
    { key: "welcome", label: "Connect" },
    ...(calendarConnected ? [{ key: "analysis" as OnboardingStep, label: "Analyse" }] : []),
    { key: "availability", label: "Availability" },
    { key: "confirmation", label: "Done" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              CalendAI
            </span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div
                className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium transition-colors ${
                  i < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < currentStepIndex ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`ml-2 text-sm hidden sm:inline ${
                  i === currentStepIndex ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 sm:w-12 h-0.5 mx-2 ${
                    i < currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome & Calendar Connection */}
        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Sun className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Let's set up your availability</CardTitle>
              <CardDescription className="text-base mt-2">
                Connect your Google Calendar so we can suggest working hours based on your schedule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {calendarLoading ? (
                <div className="flex items-center justify-center gap-3 p-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Checking calendar connection...</span>
                </div>
              ) : calendarConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700 dark:text-green-400">
                        Google Calendar Connected
                      </p>
                      {calendarStatus?.email && (
                        <p className="text-sm text-muted-foreground">{calendarStatus.email}</p>
                      )}
                    </div>
                  </div>
                  <Button className="w-full" size="lg" onClick={handleProceedFromWelcome}>
                    Analyse My Schedule
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConnectCalendar}
                    disabled={connectCalendarMutation.isPending}
                  >
                    {connectCalendarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Calendar className="h-4 w-4 mr-2" />
                    )}
                    Connect Google Calendar
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                      onClick={handleSkipCalendar}
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: AI Analysis (loading state) */}
        {step === "analysis" && (
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Analysing your schedule...</h2>
                  <p className="text-muted-foreground max-w-sm">
                    We're reviewing your calendar events to suggest optimal availability hours.
                    This usually takes a few seconds.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review & Edit Availability */}
        {step === "availability" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Weekly Availability
                </CardTitle>
                <CardDescription>
                  {analysisSuggestions
                    ? "We've pre-filled your schedule based on your calendar. Review and adjust as needed."
                    : "Set the hours when you're available for meetings."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {DAY_ORDER.map((day) => {
                  const daySchedule = schedule[day];
                  return (
                    <div key={day} className="space-y-2">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 min-w-[140px]">
                          <Switch
                            checked={daySchedule.enabled}
                            onCheckedChange={() => toggleDay(day)}
                            aria-label={`Toggle ${DAY_LABELS[day]}`}
                          />
                          <Label
                            className={`text-sm font-medium ${
                              !daySchedule.enabled ? "text-muted-foreground" : ""
                            }`}
                          >
                            {DAY_LABELS[day]}
                          </Label>
                        </div>

                        {daySchedule.enabled && (
                          <div className="flex-1 space-y-2">
                            {daySchedule.blocks.map((block, blockIndex) => (
                              <div key={blockIndex} className="flex items-center gap-2">
                                <Select
                                  value={block.start}
                                  onValueChange={(val) =>
                                    updateBlockTime(day, blockIndex, "start", val)
                                  }
                                >
                                  <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIME_OPTIONS.map((time) => (
                                      <SelectItem key={time} value={time}>
                                        {time}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <span className="text-muted-foreground text-sm">to</span>

                                <Select
                                  value={block.end}
                                  onValueChange={(val) =>
                                    updateBlockTime(day, blockIndex, "end", val)
                                  }
                                >
                                  <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIME_OPTIONS.map((time) => (
                                      <SelectItem key={time} value={time}>
                                        {time}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        )}

                        {daySchedule.enabled && (
                          <div>
                            {daySchedule.blocks.length === 1 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addBreak(day)}
                                title="Add break"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                <span className="text-xs">Break</span>
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeBreak(day)}
                                title="Remove break"
                              >
                                <Minus className="h-4 w-4 mr-1" />
                                <span className="text-xs">Merge</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {day !== "sunday" && <Separator />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Timezone & Booking Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum notice period</Label>
                    <Select
                      value={String(minNotice)}
                      onValueChange={(val) => setMinNotice(Number(val))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MIN_NOTICE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Maximum advance booking</Label>
                    <Select
                      value={String(maxAdvance)}
                      onValueChange={(val) => setMaxAdvance(Number(val))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAX_ADVANCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("welcome")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSaveAvailability}
                disabled={saveRulesMutation.isPending}
                size="lg"
              >
                {saveRulesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save Availability
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === "confirmation" && (
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Your availability is set!</h2>
                  <p className="text-muted-foreground max-w-md">
                    You're all set up. Here's a summary of your configuration:
                  </p>
                </div>

                <div className="w-full max-w-sm text-left space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Timezone:</span>
                    <span className="font-medium">{timezone.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Notice:</span>
                    <span className="font-medium">
                      {MIN_NOTICE_OPTIONS.find((o) => o.value === minNotice)?.label || "None"}
                    </span>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    {DAY_ORDER.filter((day) => schedule[day].enabled).map((day) => (
                      <div key={day} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{DAY_LABELS[day]}</span>
                        <div className="flex gap-2">
                          {schedule[day].blocks.map((block, i) => (
                            <Badge key={i} variant="secondary">
                              {block.start} - {block.end}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                    {DAY_ORDER.filter((day) => schedule[day].enabled).length === 0 && (
                      <p className="text-sm text-muted-foreground">No days enabled</p>
                    )}
                  </div>
                </div>

                <Separator className="w-full" />

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                  <Button className="flex-1" onClick={() => navigate("/")}>
                    Go to Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/event-types/new")}
                  >
                    Create Event Type
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
