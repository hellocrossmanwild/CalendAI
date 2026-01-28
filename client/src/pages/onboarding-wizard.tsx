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
  User,
  Building2,
  Sparkles,
  Palette,
  PartyPopper,
  Globe,
  Link as LinkIcon,
  Plus,
  Minus,
  Check,
  Copy,
  ExternalLink,
  Briefcase,
  Code,
  Paintbrush,
  Heart,
  Scale,
  GraduationCap,
  DollarSign,
  Megaphone,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Types
interface OnboardingData {
  // Step 1: About You
  firstName: string;
  lastName: string;
  roleTitle: string;
  companyName: string;
  websiteUrl: string;
  timezone: string;
  // Step 2: Business
  businessDescription: string;
  industry: string;
  services: string[];
  bookingHeadline: string;
  // Step 3: Event Types
  eventTypes: EventTypeSuggestion[];
  // Step 4: Availability
  weeklyHours: Record<string, { start: string; end: string }[] | null>;
  minNotice: number;
  maxAdvance: number;
  calendarConnected: boolean;
  // Step 5: Branding
  brandColor: string;
  logo: string;
  bookingWelcomeMessage: string;
}

interface EventTypeSuggestion {
  name: string;
  duration: number;
  description: string;
  selected: boolean;
}

interface TimeBlock {
  start: string;
  end: string;
}

interface DaySchedule {
  enabled: boolean;
  blocks: TimeBlock[];
}

type WeekSchedule = Record<string, DaySchedule>;

// Constants
const STEPS = [
  { id: 1, label: "About You", icon: User },
  { id: 2, label: "Business", icon: Building2 },
  { id: 3, label: "Event Types", icon: Calendar },
  { id: 4, label: "Availability", icon: Clock },
  { id: 5, label: "Branding", icon: Palette },
  { id: 6, label: "Complete", icon: PartyPopper },
];

const INDUSTRIES = [
  { id: "consulting", label: "Consulting & Coaching", icon: Briefcase },
  { id: "design", label: "Design & Creative", icon: Paintbrush },
  { id: "tech", label: "Software & Tech", icon: Code },
  { id: "sales", label: "Sales & Marketing", icon: Megaphone },
  { id: "healthcare", label: "Healthcare & Wellness", icon: Heart },
  { id: "legal", label: "Legal & Finance", icon: Scale },
  { id: "education", label: "Education & Training", icon: GraduationCap },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

const BRAND_COLORS = [
  "#6366f1", // Indigo (default)
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#06b6d4", // Cyan
];

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

// Utility functions
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

function to12Hour(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  let hours = parseInt(hourStr, 10);
  const period = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minuteStr} ${period}`;
}

function scheduleToWeeklyHours(sched: WeekSchedule): Record<string, { start: string; end: string }[] | null> {
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

function weeklyHoursToSchedule(wh: Record<string, { start: string; end: string }[] | null>): WeekSchedule {
  const schedule: WeekSchedule = {};
  for (const day of DAY_ORDER) {
    const hours = wh[day];
    if (hours === null || hours === undefined) {
      schedule[day] = {
        enabled: false,
        blocks: [{ start: "9:00 AM", end: "5:00 PM" }],
      };
    } else {
      schedule[day] = {
        enabled: true,
        blocks: hours.map((b) => ({
          start: to12Hour(b.start),
          end: to12Hour(b.end),
        })),
      };
    }
  }
  return schedule;
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
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai",
      "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland",
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

function getDefaultData(): OnboardingData {
  return {
    firstName: "",
    lastName: "",
    roleTitle: "",
    companyName: "",
    websiteUrl: "",
    timezone: detectTimezone(),
    businessDescription: "",
    industry: "",
    services: [],
    bookingHeadline: "",
    eventTypes: [],
    weeklyHours: scheduleToWeeklyHours(getDefaultSchedule()),
    minNotice: 60,
    maxAdvance: 30,
    calendarConnected: false,
    brandColor: "#6366f1",
    logo: "",
    bookingWelcomeMessage: "",
  };
}

export default function OnboardingWizardPage() {
  const { toast } = useToast();
  const { user, refetch: refetchUser } = useAuth();
  const [, navigate] = useLocation();

  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(getDefaultData());
  const [schedule, setSchedule] = useState<WeekSchedule>(getDefaultSchedule());
  const [isScanning, setIsScanning] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const timezones = getTimezones();

  // Load draft on mount
  const { data: draft, isLoading: draftLoading } = useQuery<{
    step: number;
    data: Partial<OnboardingData>;
    aiSuggestions: any;
  }>({
    queryKey: ["/api/onboarding/draft"],
  });

  // Check calendar status
  const { data: calendarStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/calendar/status"],
  });

  // Initialize from draft and user
  useEffect(() => {
    if (draft) {
      setCurrentStep(draft.step || 1);
      setData((prev) => ({
        ...prev,
        ...draft.data,
        firstName: draft.data?.firstName || user?.firstName || "",
        lastName: draft.data?.lastName || user?.lastName || "",
        companyName: draft.data?.companyName || user?.companyName || "",
        websiteUrl: draft.data?.websiteUrl || user?.websiteUrl || "",
        timezone: draft.data?.timezone || user?.timezone || detectTimezone(),
      }));
      if (draft.data?.weeklyHours) {
        setSchedule(weeklyHoursToSchedule(draft.data.weeklyHours));
      }
    } else if (user) {
      setData((prev) => ({
        ...prev,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        companyName: user.companyName || "",
        websiteUrl: user.websiteUrl || "",
        timezone: user.timezone || detectTimezone(),
      }));
    }
  }, [draft, user]);

  // Update calendar connected status
  useEffect(() => {
    if (calendarStatus?.connected) {
      setData((prev) => ({ ...prev, calendarConnected: true }));
    }
  }, [calendarStatus]);

  // Handle calendar callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      setData((prev) => ({ ...prev, calendarConnected: true }));
      toast({ title: "Google Calendar connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/status"] });
      window.history.replaceState({}, "", "/onboarding");
    } else if (params.get("error") === "calendar_auth_failed") {
      toast({ title: "Failed to connect calendar", variant: "destructive" });
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [toast]);

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (newData: { step: number; data: Partial<OnboardingData> }) => {
      return apiRequest("PATCH", "/api/onboarding/draft", newData);
    },
  });

  // Website scan mutation
  const scanWebsiteMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/onboarding/scan-website", { url });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success && result.data) {
        setData((prev) => ({
          ...prev,
          businessDescription: result.data.businessDescription || prev.businessDescription,
          industry: result.data.industry || prev.industry,
          services: result.data.services || prev.services,
          bookingHeadline: result.data.headline || prev.bookingHeadline,
          brandColor: result.data.brandColor || prev.brandColor,
        }));
        toast({ title: "Website scanned successfully" });
      } else {
        toast({ title: "Couldn't extract information from website", variant: "destructive" });
      }
      setIsScanning(false);
    },
    onError: () => {
      toast({ title: "Failed to scan website", variant: "destructive" });
      setIsScanning(false);
    },
  });

  // Event suggestions mutation
  const suggestEventsMutation = useMutation({
    mutationFn: async ({ industry, businessDescription }: { industry: string; businessDescription: string }) => {
      const response = await apiRequest("POST", "/api/onboarding/suggest-events", { industry, businessDescription });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.suggestions) {
        setData((prev) => ({
          ...prev,
          eventTypes: result.suggestions.map((s: any) => ({ ...s, selected: true })),
        }));
      }
    },
  });

  // Complete onboarding mutation
  const completeMutation = useMutation({
    mutationFn: async (finalData: OnboardingData) => {
      const response = await apiRequest("POST", "/api/onboarding/complete", { data: finalData });
      return response.json();
    },
    onSuccess: () => {
      refetchUser();
      toast({ title: "Welcome to CalendAI!", description: "Your account is all set up." });
    },
    onError: () => {
      toast({ title: "Failed to complete onboarding", variant: "destructive" });
    },
  });

  // Calendar connection
  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/calendar/auth", { credentials: "include" });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
  });

  // Auto-save draft when data changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (currentStep > 0 && currentStep < 6) {
        saveDraftMutation.mutate({ step: currentStep, data });
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [data, currentStep]);

  // Step navigation
  const goToStep = (step: number) => {
    if (step >= 1 && step <= 6) {
      setCurrentStep(step);
    }
  };

  const nextStep = () => {
    if (currentStep === 2 && data.industry) {
      // Fetch event suggestions when moving from business to event types
      suggestEventsMutation.mutate({ industry: data.industry, businessDescription: data.businessDescription });
    }
    if (currentStep === 5) {
      // Complete onboarding
      const finalData = {
        ...data,
        weeklyHours: scheduleToWeeklyHours(schedule),
      };
      completeMutation.mutate(finalData);
    }
    goToStep(currentStep + 1);
  };

  const prevStep = () => goToStep(currentStep - 1);

  // Data update helper
  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Schedule helpers
  const toggleDay = useCallback((day: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
  }, []);

  const updateBlockTime = useCallback((day: string, blockIndex: number, field: "start" | "end", value: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        blocks: prev[day].blocks.map((block, i) =>
          i === blockIndex ? { ...block, [field]: value } : block
        ),
      },
    }));
  }, []);

  const addBreak = useCallback((day: string) => {
    setSchedule((prev) => {
      const daySchedule = prev[day];
      if (daySchedule.blocks.length >= 2) return prev;
      const currentBlock = daySchedule.blocks[0];
      return {
        ...prev,
        [day]: {
          ...daySchedule,
          blocks: [
            { start: currentBlock.start, end: "12:00 PM" },
            { start: "1:00 PM", end: currentBlock.end },
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
          blocks: [{ start: daySchedule.blocks[0].start, end: daySchedule.blocks[daySchedule.blocks.length - 1].end }],
        },
      };
    });
  }, []);

  // Handle website scan
  const handleScanWebsite = () => {
    if (data.websiteUrl) {
      setIsScanning(true);
      scanWebsiteMutation.mutate(data.websiteUrl);
    }
  };

  // Copy booking link
  const copyBookingLink = () => {
    const link = `${window.location.origin}/book/${user?.username || user?.id}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Step validation
  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(data.firstName && data.companyName && data.timezone);
      case 2:
        return !!(data.industry);
      case 3:
        return data.eventTypes.some((et) => et.selected);
      case 4:
        return Object.values(schedule).some((s) => s.enabled);
      case 5:
        return true; // Branding is optional
      default:
        return true;
    }
  };

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  if (draftLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
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
          {currentStep < 6 && (
            <p className="text-muted-foreground">Let's set up your scheduling presence</p>
          )}
        </div>

        {/* Progress bar */}
        {currentStep < 6 && (
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              {STEPS.slice(0, -1).map((step, i) => {
                const Icon = step.icon;
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-1 text-xs ${
                      isCompleted ? "text-primary" : isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center h-6 w-6 rounded-full text-xs ${
                        isCompleted
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                            ? "bg-primary/20 text-primary border-2 border-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="h-3 w-3" /> : step.id}
                    </div>
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                );
              })}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Step 1: About You */}
        {currentStep === 1 && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Tell us about yourself</CardTitle>
              <CardDescription>Let's start with some basic information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name *</Label>
                  <Input
                    id="firstName"
                    value={data.firstName}
                    onChange={(e) => updateData({ firstName: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={data.lastName}
                    onChange={(e) => updateData({ lastName: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="roleTitle">Your role</Label>
                <Input
                  id="roleTitle"
                  value={data.roleTitle}
                  onChange={(e) => updateData({ roleTitle: e.target.value })}
                  placeholder="e.g., Founder, Coach, Designer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Business or brand name *</Label>
                <Input
                  id="companyName"
                  value={data.companyName}
                  onChange={(e) => updateData({ companyName: e.target.value })}
                  placeholder="Your company or personal brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website URL</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="websiteUrl"
                    value={data.websiteUrl}
                    onChange={(e) => updateData({ websiteUrl: e.target.value })}
                    placeholder="https://yourwebsite.com"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll use this to auto-fill your business details in the next step
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone *</Label>
                <Select value={data.timezone} onValueChange={(val) => updateData({ timezone: val })}>
                  <SelectTrigger>
                    <Globe className="h-4 w-4 mr-2" />
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

              <div className="flex justify-end pt-4">
                <Button onClick={nextStep} disabled={!isStepValid(1)} size="lg">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Business */}
        {currentStep === 2 && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Tell us about your business</CardTitle>
              <CardDescription>Help us understand what you do</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* AI Scan option */}
              {data.websiteUrl && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Auto-fill from website</p>
                        <p className="text-sm text-muted-foreground">
                          We'll scan {data.websiteUrl} to extract your business info
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleScanWebsite}
                      disabled={isScanning}
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Scan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Industry selection */}
              <div className="space-y-3">
                <Label>What industry are you in? *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {INDUSTRIES.map((industry) => {
                    const Icon = industry.icon;
                    const isSelected = data.industry === industry.id;
                    return (
                      <button
                        key={industry.id}
                        type="button"
                        onClick={() => updateData({ industry: industry.id })}
                        className={`p-4 rounded-lg border-2 transition-all text-center ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Icon
                          className={`h-6 w-6 mx-auto mb-2 ${
                            isSelected ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span className={`text-xs ${isSelected ? "font-medium" : ""}`}>
                          {industry.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Business description */}
              <div className="space-y-2">
                <Label htmlFor="businessDescription">Describe what you do</Label>
                <Textarea
                  id="businessDescription"
                  value={data.businessDescription}
                  onChange={(e) => updateData({ businessDescription: e.target.value })}
                  placeholder="e.g., I help startups build and scale their products through strategic consulting and hands-on guidance."
                  rows={3}
                />
              </div>

              {/* Booking headline */}
              <div className="space-y-2">
                <Label htmlFor="bookingHeadline">Booking page headline</Label>
                <Input
                  id="bookingHeadline"
                  value={data.bookingHeadline}
                  onChange={(e) => updateData({ bookingHeadline: e.target.value })}
                  placeholder={`Book a time with ${data.firstName || "me"}`}
                />
                <p className="text-xs text-muted-foreground">
                  This will be shown at the top of your booking page
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button onClick={nextStep} disabled={!isStepValid(2)} size="lg">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Event Types */}
        {currentStep === 3 && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Calendar className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Set up your meeting types</CardTitle>
              <CardDescription>
                Based on your industry, here are some suggestions. Select the ones you want to use.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {suggestEventsMutation.isPending ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                  <span>Generating suggestions...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {data.eventTypes.map((et, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          et.selected ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={et.selected}
                            onCheckedChange={(checked) => {
                              const newEventTypes = [...data.eventTypes];
                              newEventTypes[index].selected = !!checked;
                              updateData({ eventTypes: newEventTypes });
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <Input
                                value={et.name}
                                onChange={(e) => {
                                  const newEventTypes = [...data.eventTypes];
                                  newEventTypes[index].name = e.target.value;
                                  updateData({ eventTypes: newEventTypes });
                                }}
                                className="font-medium"
                              />
                              <Select
                                value={String(et.duration)}
                                onValueChange={(val) => {
                                  const newEventTypes = [...data.eventTypes];
                                  newEventTypes[index].duration = Number(val);
                                  updateData({ eventTypes: newEventTypes });
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="15">15 min</SelectItem>
                                  <SelectItem value="30">30 min</SelectItem>
                                  <SelectItem value="45">45 min</SelectItem>
                                  <SelectItem value="60">60 min</SelectItem>
                                  <SelectItem value="90">90 min</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              value={et.description}
                              onChange={(e) => {
                                const newEventTypes = [...data.eventTypes];
                                newEventTypes[index].description = e.target.value;
                                updateData({ eventTypes: newEventTypes });
                              }}
                              placeholder="Description"
                              className="mt-2 text-sm text-muted-foreground"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add custom event type */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      updateData({
                        eventTypes: [
                          ...data.eventTypes,
                          { name: "New Meeting", duration: 30, description: "", selected: true },
                        ],
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add custom meeting type
                  </Button>
                </>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button onClick={nextStep} disabled={!isStepValid(3)} size="lg">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Availability */}
        {currentStep === 4 && (
          <div className="space-y-6">
            {/* Calendar connection card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Connect your calendar
                </CardTitle>
                <CardDescription>
                  Connect Google Calendar to automatically check for conflicts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.calendarConnected ? (
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
                ) : (
                  <Button
                    onClick={() => connectCalendarMutation.mutate()}
                    disabled={connectCalendarMutation.isPending}
                  >
                    {connectCalendarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Calendar className="h-4 w-4 mr-2" />
                    )}
                    Connect Google Calendar
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Weekly availability */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Weekly Availability
                </CardTitle>
                <CardDescription>Set the hours when you're available for meetings</CardDescription>
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
                          />
                          <Label className={!daySchedule.enabled ? "text-muted-foreground" : ""}>
                            {DAY_LABELS[day]}
                          </Label>
                        </div>

                        {daySchedule.enabled && (
                          <div className="flex-1 space-y-2">
                            {daySchedule.blocks.map((block, blockIndex) => (
                              <div key={blockIndex} className="flex items-center gap-2">
                                <Select
                                  value={block.start}
                                  onValueChange={(val) => updateBlockTime(day, blockIndex, "start", val)}
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIME_OPTIONS.map((time) => (
                                      <SelectItem key={time} value={time}>{time}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-muted-foreground text-sm">to</span>
                                <Select
                                  value={block.end}
                                  onValueChange={(val) => updateBlockTime(day, blockIndex, "end", val)}
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIME_OPTIONS.map((time) => (
                                      <SelectItem key={time} value={time}>{time}</SelectItem>
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
                              <Button variant="ghost" size="sm" onClick={() => addBreak(day)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Break
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => removeBreak(day)}>
                                <Minus className="h-4 w-4 mr-1" />
                                Merge
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

            {/* Booking rules */}
            <Card>
              <CardHeader>
                <CardTitle>Booking Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum notice</Label>
                    <Select
                      value={String(data.minNotice)}
                      onValueChange={(val) => updateData({ minNotice: Number(val) })}
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
                    <Label>How far in advance</Label>
                    <Select
                      value={String(data.maxAdvance)}
                      onValueChange={(val) => updateData({ maxAdvance: Number(val) })}
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
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={nextStep} disabled={!isStepValid(4)} size="lg">
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Branding */}
        {currentStep === 5 && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Palette className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Make it yours</CardTitle>
              <CardDescription>Customize your booking page appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Brand color */}
              <div className="space-y-3">
                <Label>Brand color</Label>
                <div className="flex flex-wrap gap-3">
                  {BRAND_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateData({ brandColor: color })}
                      className={`h-10 w-10 rounded-full transition-all ${
                        data.brandColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="relative">
                    <input
                      type="color"
                      value={data.brandColor}
                      onChange={(e) => updateData({ brandColor: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div
                      className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center"
                      style={{ backgroundColor: data.brandColor }}
                    >
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Welcome message */}
              <div className="space-y-2">
                <Label htmlFor="welcomeMessage">Welcome message</Label>
                <Textarea
                  id="welcomeMessage"
                  value={data.bookingWelcomeMessage}
                  onChange={(e) => updateData({ bookingWelcomeMessage: e.target.value })}
                  placeholder="Welcome! I'm excited to connect with you. Pick a time that works for you."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be shown on your booking page
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg p-6" style={{ borderColor: data.brandColor }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: data.brandColor }}
                    >
                      {data.firstName?.[0] || "U"}
                    </div>
                    <div>
                      <h3 className="font-semibold">{data.firstName} {data.lastName}</h3>
                      <p className="text-sm text-muted-foreground">{data.companyName}</p>
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    {data.bookingHeadline || `Book a time with ${data.firstName || "me"}`}
                  </h2>
                  {data.bookingWelcomeMessage && (
                    <p className="text-muted-foreground">{data.bookingWelcomeMessage}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={nextStep}
                  disabled={completeMutation.isPending}
                  size="lg"
                >
                  {completeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Finishing...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Complete */}
        {currentStep === 6 && (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-violet-500 p-8 text-center text-white">
              <div className="flex justify-center mb-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                  <PartyPopper className="h-10 w-10" />
                </div>
              </div>
              <h1 className="text-3xl font-bold mb-2">You're all set!</h1>
              <p className="text-white/80">Your booking page is live and ready to share</p>
            </div>
            <CardContent className="p-8 space-y-6">
              {/* Booking link */}
              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-sm text-muted-foreground mb-2 block">Your booking link</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background rounded border text-sm truncate">
                    {window.location.origin}/book/{user?.username || user?.id}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyBookingLink}>
                    {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-3">
                <h3 className="font-semibold">What we set up:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Profile completed</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>{data.eventTypes.filter((e) => e.selected).length} event types</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Availability configured</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {data.calendarConnected ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                    )}
                    <span>Calendar {data.calendarConnected ? "connected" : "not connected"}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1"
                  onClick={() => window.open(`/book/${user?.username || user?.id}`, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Booking Page
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
