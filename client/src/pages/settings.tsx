import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Link as LinkIcon, Copy, ExternalLink, Loader2, CheckCircle, AlertCircle, User, LogOut, Clock, Plus, Trash2, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

// --- Availability types & constants ---

interface TimeBlock {
  start: string;
  end: string;
}

interface WeeklyHours {
  monday: TimeBlock[] | null;
  tuesday: TimeBlock[] | null;
  wednesday: TimeBlock[] | null;
  thursday: TimeBlock[] | null;
  friday: TimeBlock[] | null;
  saturday: TimeBlock[] | null;
  sunday: TimeBlock[] | null;
}

interface AvailabilityRules {
  timezone: string;
  weeklyHours: WeeklyHours;
  minNotice: number;
  maxAdvance: number;
  defaultBufferBefore: number;
  defaultBufferAfter: number;
}

const DAYS_OF_WEEK: (keyof WeeklyHours)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const DAY_LABELS: Record<keyof WeeklyHours, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

const MIN_NOTICE_OPTIONS = [
  { value: 0, label: "None" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
  { value: 2880, label: "48 hours" },
];

const MAX_ADVANCE_OPTIONS = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
  { value: 60, label: "2 months" },
  { value: 90, label: "3 months" },
];

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 22 && m > 0) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${mStr} ${ampm}`;
}

function getDefaultWeeklyHours(): WeeklyHours {
  return {
    monday: [{ start: "09:00", end: "17:00" }],
    tuesday: [{ start: "09:00", end: "17:00" }],
    wednesday: [{ start: "09:00", end: "17:00" }],
    thursday: [{ start: "09:00", end: "17:00" }],
    friday: [{ start: "09:00", end: "17:00" }],
    saturday: null,
    sunday: null,
  };
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

// --- Component ---

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [bookingUrl, setBookingUrl] = useState("");

  // Availability state
  const [timezone, setTimezone] = useState(detectTimezone());
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>(getDefaultWeeklyHours());
  const [minNotice, setMinNotice] = useState(60);
  const [maxAdvance, setMaxAdvance] = useState(30);
  const [editingDay, setEditingDay] = useState<keyof WeeklyHours | null>(null);

  const { data: calendarStatus, isLoading: calendarLoading } = useQuery<{
    connected: boolean;
    email?: string;
    calendars?: { id: string; summary: string; primary: boolean }[];
  }>({
    queryKey: ["/api/calendar/status"],
  });

  const { data: eventTypes } = useQuery<{ slug: string }[]>({
    queryKey: ["/api/event-types"],
  });

  const { data: availabilityRules, isLoading: availabilityLoading } = useQuery<AvailabilityRules>({
    queryKey: ["/api/availability-rules"],
  });

  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/calendar/auth", { credentials: "include" });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
    onError: (error: Error) => {
      toast({ title: "Failed to connect calendar", variant: "destructive" });
    },
  });

  const disconnectCalendarMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/calendar/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/status"] });
      toast({ title: "Calendar disconnected" });
    },
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/availability-rules", {
        timezone,
        weeklyHours,
        minNotice,
        maxAdvance,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability-rules"] });
      toast({ title: "Availability settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save availability settings", variant: "destructive" });
    },
  });

  // Notification preferences (F09 R6)
  const { data: notifPrefs } = useQuery<{
    newBookingEmail: boolean;
    meetingBriefEmail: boolean;
    dailyDigest: boolean;
    cancellationEmail: boolean;
  }>({
    queryKey: ["/api/notification-preferences"],
  });

  const updateNotifPrefsMutation = useMutation({
    mutationFn: async (prefs: {
      newBookingEmail?: boolean;
      meetingBriefEmail?: boolean;
      dailyDigest?: boolean;
      cancellationEmail?: boolean;
    }) => {
      return apiRequest("PATCH", "/api/notification-preferences", prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Notification preferences saved" });
    },
    onError: () => {
      toast({ title: "Failed to save notification preferences", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast({ title: "Google Calendar connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/status"] });
      // Clean up URL
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("error") === "calendar_auth_failed") {
      toast({ title: "Failed to connect calendar", variant: "destructive" });
      window.history.replaceState({}, "", "/settings");
    }
  }, [toast]);

  // Sync availability state from fetched rules
  useEffect(() => {
    if (availabilityRules) {
      setTimezone(availabilityRules.timezone || detectTimezone());
      setWeeklyHours(availabilityRules.weeklyHours || getDefaultWeeklyHours());
      setMinNotice(availabilityRules.minNotice ?? 60);
      setMaxAdvance(availabilityRules.maxAdvance ?? 30);
    }
  }, [availabilityRules]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  // --- Availability helpers ---

  const toggleDay = (day: keyof WeeklyHours) => {
    setWeeklyHours((prev) => ({
      ...prev,
      [day]: prev[day] ? null : [{ start: "09:00", end: "17:00" }],
    }));
  };

  const updateTimeBlock = (day: keyof WeeklyHours, blockIndex: number, field: "start" | "end", value: string) => {
    setWeeklyHours((prev) => {
      const blocks = prev[day];
      if (!blocks) return prev;
      const updated = blocks.map((block, i) =>
        i === blockIndex ? { ...block, [field]: value } : block
      );
      return { ...prev, [day]: updated };
    });
  };

  const addBreak = (day: keyof WeeklyHours) => {
    setWeeklyHours((prev) => {
      const blocks = prev[day];
      if (!blocks || blocks.length === 0) return prev;
      if (blocks.length === 1) {
        // Split the single block with a lunch break
        const block = blocks[0];
        return {
          ...prev,
          [day]: [
            { start: block.start, end: "12:00" },
            { start: "13:00", end: block.end },
          ],
        };
      }
      // Add a new block after the last one
      return {
        ...prev,
        [day]: [...blocks, { start: "13:00", end: "17:00" }],
      };
    });
  };

  const removeBlock = (day: keyof WeeklyHours, blockIndex: number) => {
    setWeeklyHours((prev) => {
      const blocks = prev[day];
      if (!blocks || blocks.length <= 1) return prev;
      return {
        ...prev,
        [day]: blocks.filter((_, i) => i !== blockIndex),
      };
    });
  };

  // Ensure the current timezone is always selectable
  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const firstSlug = eventTypes?.[0]?.slug || "your-event";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and integrations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'User'}
              </h3>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="outline" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Log Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>Connect your calendar for availability and event creation</CardDescription>
        </CardHeader>
        <CardContent>
          {calendarLoading ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-muted-foreground">Checking connection...</span>
            </div>
          ) : calendarStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-700 dark:text-green-400">Connected</p>
                  <p className="text-sm text-muted-foreground">{calendarStatus.email}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectCalendarMutation.mutate()}
                  disabled={disconnectCalendarMutation.isPending}
                  data-testid="button-disconnect-calendar"
                >
                  Disconnect
                </Button>
              </div>
              {calendarStatus.calendars && calendarStatus.calendars.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Synced calendars</p>
                  <div className="space-y-1">
                    {calendarStatus.calendars.map((cal) => (
                      <div key={cal.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{cal.summary}</span>
                        {cal.primary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Not Connected</p>
                  <p className="text-sm text-muted-foreground">Connect to sync availability and create events</p>
                </div>
              </div>
              <Button
                onClick={() => connectCalendarMutation.mutate()}
                disabled={connectCalendarMutation.isPending}
                data-testid="button-connect-calendar"
              >
                {connectCalendarMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4 mr-2" />
                )}
                Connect Google Calendar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Availability Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Availability
          </CardTitle>
          <CardDescription>Configure your available hours for bookings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {availabilityLoading ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-muted-foreground">Loading availability...</span>
            </div>
          ) : (
            <>
              {/* Timezone selector */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full" data-testid="select-timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Weekly schedule grid */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Weekly Hours</Label>
                <div className="space-y-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const blocks = weeklyHours[day];
                    const enabled = blocks !== null;
                    const isEditing = editingDay === day;

                    return (
                      <div
                        key={day}
                        className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {/* Toggle + Day label */}
                        <div className="flex items-center gap-2 min-w-[80px] pt-0.5">
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => toggleDay(day)}
                            data-testid={`switch-${day}`}
                          />
                          <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                        </div>

                        {/* Time content */}
                        <div className="flex-1">
                          {!enabled ? (
                            <span className="text-sm text-muted-foreground pt-0.5 block">
                              Unavailable
                            </span>
                          ) : isEditing ? (
                            <div className="space-y-2">
                              {blocks!.map((block, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <Select
                                    value={block.start}
                                    onValueChange={(v) => updateTimeBlock(day, idx, "start", v)}
                                  >
                                    <SelectTrigger className="w-[130px] h-8 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIME_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-sm text-muted-foreground">-</span>
                                  <Select
                                    value={block.end}
                                    onValueChange={(v) => updateTimeBlock(day, idx, "end", v)}
                                  >
                                    <SelectTrigger className="w-[130px] h-8 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIME_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {blocks!.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      onClick={() => removeBlock(day, idx)}
                                      data-testid={`remove-block-${day}-${idx}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => addBreak(day)}
                                  data-testid={`add-break-${day}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add break
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setEditingDay(null)}
                                >
                                  Done
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors pt-0.5 text-left"
                              onClick={() => setEditingDay(day)}
                              data-testid={`edit-hours-${day}`}
                            >
                              {blocks!.map((block, idx) => (
                                <span key={idx}>
                                  {formatTime(block.start)} - {formatTime(block.end)}
                                  {idx < blocks!.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Min notice & Max advance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Minimum Notice</Label>
                  <Select value={String(minNotice)} onValueChange={(v) => setMinNotice(Number(v))}>
                    <SelectTrigger data-testid="select-min-notice">
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
                <div>
                  <Label className="text-sm font-medium mb-2 block">Maximum Advance</Label>
                  <Select value={String(maxAdvance)} onValueChange={(v) => setMaxAdvance(Number(v))}>
                    <SelectTrigger data-testid="select-max-advance">
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

              <Button
                onClick={() => saveAvailabilityMutation.mutate()}
                disabled={saveAvailabilityMutation.isPending}
                className="w-full"
                data-testid="button-save-availability"
              >
                {saveAvailabilityMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Availability
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Booking Links
          </CardTitle>
          <CardDescription>Share your scheduling links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Your Booking Page</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${baseUrl}/book/${firstSlug}`}
                className="font-mono text-sm"
                data-testid="input-booking-url"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(`${baseUrl}/book/${firstSlug}`)}
                data-testid="button-copy-url"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={`/book/${firstSlug}`} target="_blank" rel="noopener noreferrer" data-testid="button-preview-url">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <label className="text-sm font-medium mb-2 block">Embed Widget</label>
            <p className="text-sm text-muted-foreground mb-3">
              Add this code to your website to embed a booking button
            </p>
            <div className="bg-muted rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <pre>{`<script src="${baseUrl}/widget.js"></script>
<div id="calendai-widget" data-slug="${firstSlug}"></div>`}</pre>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => copyToClipboard(`<script src="${baseUrl}/widget.js"></script>\n<div id="calendai-widget" data-slug="${firstSlug}"></div>`)}
              data-testid="button-copy-embed"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Embed Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences (F09 R6) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>Choose which email notifications you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-new-booking" className="font-medium">New booking</Label>
              <p className="text-sm text-muted-foreground">Receive an email when someone books a meeting</p>
            </div>
            <Switch
              id="notif-new-booking"
              checked={notifPrefs?.newBookingEmail ?? true}
              onCheckedChange={(checked) =>
                updateNotifPrefsMutation.mutate({ newBookingEmail: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-cancellation" className="font-medium">Cancellation</Label>
              <p className="text-sm text-muted-foreground">Receive an email when a booking is cancelled</p>
            </div>
            <Switch
              id="notif-cancellation"
              checked={notifPrefs?.cancellationEmail ?? true}
              onCheckedChange={(checked) =>
                updateNotifPrefsMutation.mutate({ cancellationEmail: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-meeting-brief" className="font-medium">Meeting brief</Label>
              <p className="text-sm text-muted-foreground">Receive an email with your AI meeting prep brief</p>
            </div>
            <Switch
              id="notif-meeting-brief"
              checked={notifPrefs?.meetingBriefEmail ?? true}
              onCheckedChange={(checked) =>
                updateNotifPrefsMutation.mutate({ meetingBriefEmail: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif-daily-digest" className="font-medium">Daily digest</Label>
              <p className="text-sm text-muted-foreground">Receive a daily summary of upcoming bookings</p>
            </div>
            <Switch
              id="notif-daily-digest"
              checked={notifPrefs?.dailyDigest ?? false}
              onCheckedChange={(checked) =>
                updateNotifPrefsMutation.mutate({ dailyDigest: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
