import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Globe,
  ChevronDown,
  ArrowLeft,
  CheckCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, addDays, startOfWeek, addWeeks, isSameDay, isToday, isBefore, startOfDay } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";

// --- Types ---

interface TimeSlot {
  time: string;
  available: boolean;
  utc: string;
}

interface RescheduleBooking {
  id: number;
  guestName: string;
  guestEmail: string;
  eventTypeName: string;
  eventTypeSlug: string;
  startTime: string;
  endTime: string;
  status: string;
  timezone: string;
  duration: number;
  eventType: {
    host?: {
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    };
    primaryColor?: string;
    secondaryColor?: string;
    color?: string;
    logo?: string;
    duration: number;
  };
}

type RescheduleStep = "calendar" | "time" | "confirm";

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

// --- Component ---

export default function RescheduleBookingPage() {
  const [, params] = useRoute("/booking/reschedule/:token");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<RescheduleStep>("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTimeUTC, setSelectedTimeUTC] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);
  const timezoneSelectorRef = useRef<HTMLDivElement>(null);

  const token = params?.token;

  // --- Fetch booking data via reschedule token ---

  const {
    data: booking,
    isLoading,
    error: bookingError,
  } = useQuery<RescheduleBooking>({
    queryKey: ["/api/public/booking/reschedule", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking/reschedule/${token}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    enabled: !!token,
  });

  // --- Fetch availability for selected date ---

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["/api/public/booking/reschedule", token, "availability", selectedDate?.toISOString(), timezone],
    queryFn: async () => {
      const dateParam = selectedDate ? `date=${encodeURIComponent(selectedDate.toISOString())}` : "";
      const tzParam = `timezone=${encodeURIComponent(timezone)}`;
      const query = [dateParam, tzParam].filter(Boolean).join("&");
      const res = await fetch(`/api/public/booking/reschedule/${token}/availability?${query}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!token && !!selectedDate,
  });

  // --- Reschedule mutation ---

  const rescheduleMutation = useMutation({
    mutationFn: async (data: { startTimeUTC: string; timezone: string }) => {
      return apiRequest("POST", `/api/public/booking/reschedule/${token}`, data);
    },
    onSuccess: () => {
      setStep("confirm");
    },
    onError: (error: Error) => {
      const is409 = error.message.startsWith("409");
      if (is409) {
        toast({
          title: "Time slot no longer available",
          description: "This slot was just booked. Please select another time.",
          variant: "destructive",
        });
        setSelectedTime(null);
        setSelectedTimeUTC(null);
        setStep("time");
        queryClient.invalidateQueries({
          queryKey: ["/api/public/booking/reschedule", token, "availability"],
        });
      } else {
        toast({
          title: "Reschedule failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // --- Close timezone selector on outside click ---

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

  // --- Derived values ---

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const brandPrimary = booking?.eventType?.primaryColor || booking?.eventType?.color || "#6366f1";
  const brandSecondary = booking?.eventType?.secondaryColor || brandPrimary;

  const hostInitials = booking?.eventType?.host
    ? `${booking.eventType.host.firstName?.[0] || ""}${booking.eventType.host.lastName?.[0] || ""}`.toUpperCase()
    : "";
  const hostFullName = booking?.eventType?.host
    ? `${booking.eventType.host.firstName || ""} ${booking.eventType.host.lastName || ""}`.trim()
    : "";

  // Determine if the booking is in an unrescheduable state
  const isCancelled = booking?.status === "cancelled";
  const isPastBooking = booking ? isBefore(new Date(booking.startTime), new Date()) : false;

  // --- Handlers ---

  const handleDateSelect = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return;
    setSelectedDate(date);
    setSelectedTime(null);
    setSelectedTimeUTC(null);
    setStep("time");
  };

  const handleTimeSelect = (time: string, utc: string) => {
    // Check if guest selected the same time as the current booking
    if (booking && utc === booking.startTime) {
      toast({
        title: "Same time selected",
        description: "Please select a different time than your current booking.",
        variant: "destructive",
      });
      return;
    }
    setSelectedTime(time);
    setSelectedTimeUTC(utc);
  };

  const handleConfirmReschedule = () => {
    if (!selectedTimeUTC) return;
    rescheduleMutation.mutate({
      startTimeUTC: selectedTimeUTC,
      timezone,
    });
  };

  // --- Step progress ---

  const rescheduleSteps: RescheduleStep[] = ["calendar", "time"];
  const currentStepIndex = rescheduleSteps.indexOf(step);

  // --- Render: Loading state ---

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-16 w-16 rounded-full mx-auto" />
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
              <Skeleton className="h-4 w-56 mx-auto" />
              <div className="pt-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render: Invalid token ---

  if (bookingError || !booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">This link is no longer valid</h2>
            <p className="text-muted-foreground">
              The reschedule link you followed has expired or is invalid. Please contact the host for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render: Cancelled booking ---

  if (isCancelled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card
          className="w-full max-w-md text-center"
          style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
        >
          <CardContent className="p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
              style={{ backgroundColor: `${brandPrimary}15` }}
            >
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Booking Cancelled</h2>
            <p className="text-muted-foreground">
              This booking has been cancelled and cannot be rescheduled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render: Past booking ---

  if (isPastBooking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card
          className="w-full max-w-md text-center"
          style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
        >
          <CardContent className="p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
              style={{ backgroundColor: `${brandPrimary}15` }}
            >
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Booking Has Passed</h2>
            <p className="text-muted-foreground">
              This booking has already passed and cannot be rescheduled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render: Success confirmation ---

  if (step === "confirm") {
    const newStartTime = selectedTimeUTC ? new Date(selectedTimeUTC) : null;

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
              <h2 className="text-xl font-semibold mb-2">Booking Rescheduled!</h2>
              <p className="text-muted-foreground">
                Your booking has been rescheduled to{" "}
                <span className="font-medium text-foreground">
                  {newStartTime
                    ? format(newStartTime, "EEEE, MMMM d, yyyy")
                    : selectedDate
                      ? format(selectedDate, "EEEE, MMMM d, yyyy")
                      : ""}
                </span>{" "}
                at{" "}
                <span className="font-medium text-foreground">
                  {selectedTime}
                </span>.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                A confirmation email has been sent to{" "}
                <span className="font-medium">{booking.guestEmail}</span>.
              </p>
            </div>

            <div
              className="rounded-lg border bg-muted/30 p-4 space-y-3"
              style={{ borderColor: `${brandSecondary}30` }}
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{booking.eventTypeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.duration} minutes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm">
                    {newStartTime
                      ? format(newStartTime, "EEEE, MMMM d, yyyy")
                      : selectedDate
                        ? format(selectedDate, "EEEE, MMMM d, yyyy")
                        : ""}{" "}
                    at {selectedTime}
                  </p>
                </div>
              </div>
              {hostFullName && (
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm">with {hostFullName}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render: Main reschedule flow ---

  const originalDate = new Date(booking.startTime);

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
          {booking.eventType.host &&
            (booking.eventType.host.firstName || booking.eventType.host.lastName) && (
              <div className="flex flex-col items-center mb-4">
                {booking.eventType.host.profileImageUrl ? (
                  <img
                    src={booking.eventType.host.profileImageUrl}
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
            {booking.eventType.logo ? (
              <img
                src={booking.eventType.logo}
                alt={booking.eventTypeName}
                className="h-12 w-12 object-contain"
              />
            ) : (
              <RefreshCw className="h-7 w-7" />
            )}
          </div>
          <h1 className="text-2xl font-semibold mb-2">Reschedule Booking</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {booking.eventTypeName}
          </p>
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
            {booking.duration} minutes
          </Badge>

          {/* Current booking details */}
          <div
            className="mt-6 mx-auto max-w-sm rounded-lg border bg-muted/30 p-4"
            style={{ borderColor: `${brandSecondary}30` }}
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Current Booking
            </p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{format(originalDate, "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm mt-1">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{format(originalDate, "h:mm a")}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {booking.guestName} ({booking.guestEmail})
            </p>
          </div>

          {/* Step progress indicator */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {rescheduleSteps.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  i <= currentStepIndex ? "w-8" : "w-4 opacity-40"
                }`}
                style={{
                  backgroundColor:
                    i <= currentStepIndex ? brandPrimary : `${brandSecondary}30`,
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
              if (step === "time") {
                setStep("calendar");
                setSelectedTime(null);
                setSelectedTimeUTC(null);
              }
            }}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        )}

        {/* Step 1: Calendar date picker */}
        {step === "calendar" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Select a New Date</CardTitle>
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
                        ...(isToday(day) && !isSelected
                          ? ({ "--tw-ring-color": brandPrimary } as React.CSSProperties)
                          : {}),
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
                  <div
                    className="absolute top-full mt-1 z-50 w-80 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
                    data-testid="timezone-dropdown"
                  >
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

        {/* Step 2: Time slot picker */}
        {step === "time" && selectedDate && (
          <Card>
            <CardHeader>
              <CardTitle>Select a New Time</CardTitle>
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
                        style={
                          selectedTime === slot.time
                            ? { backgroundColor: brandPrimary, borderColor: brandPrimary }
                            : undefined
                        }
                        data-testid={`button-time-${slot.time.replace(":", "")}`}
                      >
                        {slot.time}
                      </Button>
                    ))}
                </div>
              )}

              {/* Timezone indicator on time step */}
              <div
                className="relative mt-4 flex items-center justify-center"
                ref={step === "time" ? timezoneSelectorRef : undefined}
              >
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
                  <div
                    className="absolute top-full mt-1 z-50 w-80 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
                    data-testid="timezone-dropdown-time"
                  >
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

              {/* Confirm Reschedule button */}
              {selectedTime && selectedTimeUTC && (
                <div className="mt-6 space-y-3">
                  <div
                    className="rounded-lg border bg-muted/30 p-4"
                    style={{ borderColor: `${brandSecondary}30` }}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Previous Time
                        </p>
                        <p className="line-through text-muted-foreground">
                          {format(originalDate, "MMM d, yyyy")} at {format(originalDate, "h:mm a")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-2" />
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: brandPrimary }}>
                          New Time
                        </p>
                        <p className="font-medium">
                          {format(selectedDate, "MMM d, yyyy")} at {selectedTime}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full text-white"
                    onClick={handleConfirmReschedule}
                    disabled={rescheduleMutation.isPending}
                    style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
                    data-testid="button-confirm-reschedule"
                  >
                    {rescheduleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Confirm Reschedule
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
