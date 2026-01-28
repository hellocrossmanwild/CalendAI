import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar,
  Search,
  MoreVertical,
  Trash2,
  FileText,
  User,
  Clock,
  Mail,
  Building,
  Phone,
  ChevronLeft,
  ChevronRight,
  Copy,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import type { BookingWithDetails, EventType } from "@shared/schema";
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  startOfDay,
  endOfDay,
  addDays,
  isWithinInterval,
} from "date-fns";

type DateRangePreset = "all" | "today" | "this-week" | "this-month" | "next-7" | "next-30";
type SortOption = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "score-desc" | "score-asc";
type StatusFilter = "all" | "confirmed" | "completed" | "cancelled" | "no-show";

interface TimeSlot {
  time: string;
  available: boolean;
  utc: string;
}

export default function BookingsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [tab, setTab] = useState("upcoming");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date-asc");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [selectedRescheduleTime, setSelectedRescheduleTime] = useState<string | null>(null);
  const [selectedRescheduleUTC, setSelectedRescheduleUTC] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings"],
  });

  const { data: eventTypes } = useQuery<EventType[]>({
    queryKey: ["/api/event-types"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/bookings/${id}`, { reason: cancelReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking cancelled" });
      setDeleteId(null);
      setCancelReason("");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/bookings/${id}/status`, { status });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      const label = variables.status === "completed" ? "Marked as complete" : "Marked as no-show";
      toast({ title: label });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/bookings/${id}/enrich`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Lead enrichment started" });
    },
    onError: () => {
      toast({ title: "Failed to enrich lead", variant: "destructive" });
    },
  });

  const briefMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/bookings/${id}/generate-brief`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Meeting brief generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate brief", variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, startTimeUTC }: { id: number; startTimeUTC: string }) => {
      const res = await apiRequest("POST", `/api/bookings/${id}/reschedule`, { startTimeUTC });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking rescheduled successfully" });
      setRescheduleId(null);
      setRescheduleDate("");
      setRescheduleSlots([]);
      setSelectedRescheduleTime(null);
      setSelectedRescheduleUTC(null);
    },
    onError: async (error: any) => {
      // Handle 409 conflict - time slot no longer available
      if (error?.status === 409 || error?.message?.includes("409")) {
        toast({ title: "Time slot no longer available", variant: "destructive" });
        setSelectedRescheduleTime(null);
        setSelectedRescheduleUTC(null);
        // Re-fetch slots
        if (rescheduleDate && rescheduleId) {
          const booking = bookings?.find((b) => b.id === rescheduleId);
          if (booking?.eventType?.slug) {
            fetchRescheduleSlots(booking.eventType.slug, rescheduleDate);
          }
        }
      } else {
        toast({ title: "Failed to reschedule booking", variant: "destructive" });
      }
    },
  });

  const fetchRescheduleSlots = async (slug: string, date: string) => {
    setRescheduleSlotsLoading(true);
    setSelectedRescheduleTime(null);
    setSelectedRescheduleUTC(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/public/availability/${slug}?date=${date}&timezone=${tz}`);
      if (res.ok) {
        const data = await res.json();
        setRescheduleSlots(data.slots || []);
      } else {
        setRescheduleSlots([]);
        toast({ title: "Failed to load available times", variant: "destructive" });
      }
    } catch {
      setRescheduleSlots([]);
      toast({ title: "Failed to load available times", variant: "destructive" });
    } finally {
      setRescheduleSlotsLoading(false);
    }
  };

  const handleRescheduleDateChange = (date: string) => {
    setRescheduleDate(date);
    if (!date) {
      setRescheduleSlots([]);
      return;
    }
    const booking = bookings?.find((b) => b.id === rescheduleId);
    if (booking?.eventType?.slug) {
      fetchRescheduleSlots(booking.eventType.slug, date);
    }
  };

  const handleConfirmReschedule = () => {
    if (rescheduleId && selectedRescheduleUTC) {
      rescheduleMutation.mutate({ id: rescheduleId, startTimeUTC: selectedRescheduleUTC });
    }
  };

  // Date range filtering helper
  const getDateRangeInterval = (preset: DateRangePreset): { start: Date; end: Date } | null => {
    const now = new Date();
    switch (preset) {
      case "all":
        return null;
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "this-week":
        return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "next-7":
        return { start: startOfDay(now), end: endOfDay(addDays(now, 7)) };
      case "next-30":
        return { start: startOfDay(now), end: endOfDay(addDays(now, 30)) };
      default:
        return null;
    }
  };

  // Filter and sort bookings
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];

    let filtered = bookings.filter((b) => {
      // Search filter
      const matchesSearch =
        b.guestName.toLowerCase().includes(search.toLowerCase()) ||
        b.guestEmail.toLowerCase().includes(search.toLowerCase()) ||
        b.guestCompany?.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      // Tab filter (only for upcoming/past, not calendar)
      if (tab === "upcoming" || tab === "past") {
        const startDate = new Date(b.startTime);
        const isUpcoming = startDate > new Date() && b.status !== "cancelled";
        const isPastBooking = startDate <= new Date() || b.status === "cancelled";

        if (tab === "upcoming" && !isUpcoming) return false;
        if (tab === "past" && !isPastBooking) return false;
      }

      // Date range filter
      const interval = getDateRangeInterval(dateRange);
      if (interval) {
        const bookingDate = new Date(b.startTime);
        if (!isWithinInterval(bookingDate, interval)) return false;
      }

      // Event type filter
      if (eventTypeFilter !== "all") {
        if (b.eventTypeId !== parseInt(eventTypeFilter, 10)) return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        if (b.status !== statusFilter) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        case "date-desc":
          return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
        case "name-asc":
          return a.guestName.localeCompare(b.guestName);
        case "name-desc":
          return b.guestName.localeCompare(a.guestName);
        case "score-desc": {
          const scoreA = a.enrichment?.leadScore ?? -1;
          const scoreB = b.enrichment?.leadScore ?? -1;
          return scoreB - scoreA;
        }
        case "score-asc": {
          const scoreA = a.enrichment?.leadScore ?? -1;
          const scoreB = b.enrichment?.leadScore ?? -1;
          return scoreA - scoreB;
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [bookings, search, tab, dateRange, eventTypeFilter, statusFilter, sortBy]);

  // Bookings for the selected day in calendar view
  const selectedDayBookings = useMemo(() => {
    if (!selectedDay || !bookings) return [];
    return bookings
      .filter((b) => {
        const bookingDate = new Date(b.startTime);
        return isSameDay(bookingDate, selectedDay);
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [selectedDay, bookings]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMonth]);

  // Get bookings for a specific day (for calendar dots)
  const getBookingsForDay = (day: Date): BookingWithDetails[] => {
    if (!bookings) return [];
    return bookings.filter((b) => isSameDay(new Date(b.startTime), day));
  };

  // Update default sort when tab changes
  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    if (newTab === "upcoming") {
      setSortBy("date-asc");
    } else if (newTab === "past") {
      setSortBy("date-desc");
    }
  };

  const formatBookingDate = (dateStr: string | Date) => {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    if (isToday(date)) return `Today, ${format(date, "h:mm a")}`;
    if (isTomorrow(date)) return `Tomorrow, ${format(date, "h:mm a")}`;
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  const getStatusBadge = (booking: BookingWithDetails) => {
    switch (booking.status) {
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      case "completed":
        return (
          <Badge variant="outline" className="border-green-500/50 text-green-700 bg-green-500/10 dark:text-green-400">
            Completed
          </Badge>
        );
      case "no-show":
        return (
          <Badge variant="outline" className="border-orange-500/50 text-orange-700 bg-orange-500/10 dark:text-orange-400">
            No-Show
          </Badge>
        );
      case "confirmed":
      default:
        return <Badge>Confirmed</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleCopyBookingLink = (booking: BookingWithDetails) => {
    const eventType = booking.eventType;
    if (eventType) {
      const url = `${window.location.origin}/book/${eventType.slug}`;
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Booking link copied to clipboard" });
      });
    } else {
      toast({ title: "No event type linked to this booking", variant: "destructive" });
    }
  };

  const handleEmailGuest = (booking: BookingWithDetails) => {
    window.location.href = `mailto:${booking.guestEmail}`;
  };

  // Render a booking card (shared between list and calendar day detail)
  const renderBookingCard = (booking: BookingWithDetails) => (
    <Card key={booking.id} className="overflow-visible">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{getInitials(booking.guestName)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{booking.guestName}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {booking.guestEmail}
                  </span>
                  {booking.guestCompany && (
                    <span className="flex items-center gap-1">
                      <Building className="h-3.5 w-3.5" />
                      {booking.guestCompany}
                    </span>
                  )}
                  {booking.guestPhone && (
                    <a
                      href={`tel:${booking.guestPhone}`}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {booking.guestPhone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {booking.enrichment?.leadScoreLabel && (
                  <LeadScoreBadge
                    score={booking.enrichment.leadScore}
                    label={booking.enrichment.leadScoreLabel}
                    size="sm"
                  />
                )}
                {getStatusBadge(booking)}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-menu-${booking.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/bookings/${booking.id}`}>
                        <User className="h-4 w-4 mr-2" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/briefs/${booking.id}`}>
                        <FileText className="h-4 w-4 mr-2" />
                        Meeting Brief
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Quick Actions: Enrich Lead */}
                    {!booking.enrichment && (
                      <DropdownMenuItem
                        onClick={() => enrichMutation.mutate(booking.id)}
                        disabled={enrichMutation.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Enrich Lead
                      </DropdownMenuItem>
                    )}

                    {/* Quick Actions: Generate Brief */}
                    {!booking.brief && (
                      <DropdownMenuItem
                        onClick={() => briefMutation.mutate(booking.id)}
                        disabled={briefMutation.isPending}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Brief
                      </DropdownMenuItem>
                    )}

                    {/* Quick Actions: Copy Booking Link */}
                    <DropdownMenuItem onClick={() => handleCopyBookingLink(booking)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Booking Link
                    </DropdownMenuItem>

                    {/* Quick Actions: Email Guest */}
                    <DropdownMenuItem onClick={() => handleEmailGuest(booking)}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email Guest
                    </DropdownMenuItem>

                    {/* Quick Actions: Reschedule */}
                    {booking.status !== "cancelled" && (
                      <DropdownMenuItem
                        onClick={() => {
                          setRescheduleId(booking.id);
                          setRescheduleDate("");
                          setRescheduleSlots([]);
                          setSelectedRescheduleTime(null);
                          setSelectedRescheduleUTC(null);
                        }}
                      >
                        <CalendarClock className="h-4 w-4 mr-2" />
                        Reschedule
                      </DropdownMenuItem>
                    )}

                    {/* Status Management: Mark Complete / Mark No-Show (only for confirmed) */}
                    {booking.status === "confirmed" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => statusMutation.mutate({ id: booking.id, status: "completed" })}
                          disabled={statusMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark Complete
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => statusMutation.mutate({ id: booking.id, status: "no-show" })}
                          disabled={statusMutation.isPending}
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Mark No-Show
                        </DropdownMenuItem>
                      </>
                    )}

                    {booking.status !== "cancelled" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(booking.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Cancel Booking
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatBookingDate(booking.startTime)}</span>
              </div>
              {booking.eventType && (
                <Badge variant="secondary" className="text-xs">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: booking.eventType.color || "#6366f1" }}
                  />
                  {booking.eventType.name}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {booking.timezone}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Render calendar month view
  const renderCalendarView = () => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="space-y-4">
        {/* Calendar header with navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{format(calendarMonth, "MMMM yyyy")}</h2>
          <Button variant="outline" size="icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Calendar grid */}
        <Card>
          <CardContent className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0 mb-2">
              {dayNames.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0">
              {calendarDays.map((day) => {
                const dayBookings = getBookingsForDay(day);
                const inCurrentMonth = isSameMonth(day, calendarMonth);
                const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                const todayClass = isToday(day) ? "font-bold text-primary" : "";

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`
                      relative flex flex-col items-center justify-start p-2 min-h-[72px] border border-border/50 transition-colors
                      ${inCurrentMonth ? "bg-background" : "bg-muted/30 text-muted-foreground"}
                      ${isSelected ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-accent/50"}
                    `}
                  >
                    <span className={`text-sm ${todayClass}`}>
                      {format(day, "d")}
                    </span>

                    {/* Booking dots */}
                    {dayBookings.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1 justify-center max-w-full">
                        {dayBookings.slice(0, 4).map((b) => (
                          <span
                            key={b.id}
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: b.eventType?.color || "#6366f1" }}
                          />
                        ))}
                        {dayBookings.length > 4 && (
                          <span className="text-[10px] text-muted-foreground leading-none">
                            +{dayBookings.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day bookings */}
        {selectedDay && (
          <div className="space-y-4">
            <h3 className="text-md font-semibold">
              {format(selectedDay, "EEEE, MMMM d, yyyy")}
              {selectedDayBookings.length > 0 && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({selectedDayBookings.length} booking{selectedDayBookings.length !== 1 ? "s" : ""})
                </span>
              )}
            </h3>
            {selectedDayBookings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Calendar className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground text-sm">No bookings on this day</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {selectedDayBookings.map((booking) => renderBookingCard(booking))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bookings</h1>
          <p className="text-muted-foreground">Manage your scheduled meetings</p>
        </div>
      </div>

      {/* Search and tabs row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">Past</TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        {/* Date Range Filter */}
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangePreset)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="next-7">Next 7 Days</SelectItem>
            <SelectItem value="next-30">Next 30 Days</SelectItem>
          </SelectContent>
        </Select>

        {/* Event Type Filter */}
        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Types</SelectItem>
            {eventTypes?.map((et) => (
              <SelectItem key={et.id} value={String(et.id)}>
                {et.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no-show">No-Show</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Date (Newest First)</SelectItem>
            <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
            <SelectItem value="name-asc">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            <SelectItem value="score-desc">Lead Score (High-Low)</SelectItem>
            <SelectItem value="score-asc">Lead Score (Low-High)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content area */}
      {tab === "calendar" ? (
        isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Card>
              <CardContent className="p-4">
                <Skeleton className="h-[400px] w-full" />
              </CardContent>
            </Card>
          </div>
        ) : (
          renderCalendarView()
        )
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {search ? "No matching bookings" : `No ${tab} bookings`}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? "Try adjusting your search terms or filters"
                : tab === "upcoming"
                ? "Share your booking links to start receiving meetings"
                : "Your completed meetings will appear here"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => renderBookingCard(booking))}
        </div>
      )}

      {/* Cancel booking confirmation dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) { setDeleteId(null); setCancelReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the meeting and notify the guest. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <MessageSquare className="h-4 w-4" />
              Cancellation reason (optional)
            </label>
            <Textarea
              placeholder="Let the guest know why this booking is being cancelled..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog">Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cancel"
            >
              Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule booking dialog */}
      <Dialog
        open={rescheduleId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleId(null);
            setRescheduleDate("");
            setRescheduleSlots([]);
            setSelectedRescheduleTime(null);
            setSelectedRescheduleUTC(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Choose a new date and time for this booking.
            </DialogDescription>
          </DialogHeader>

          {/* Current booking info */}
          {rescheduleId && (() => {
            const booking = bookings?.find((b) => b.id === rescheduleId);
            if (!booking) return null;
            return (
              <div className="rounded-lg border p-3 bg-muted/50 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {booking.guestName}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Currently: {formatBookingDate(booking.startTime)}
                </div>
                {booking.eventType && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {booking.eventType.name}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Date picker */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Select new date</label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => handleRescheduleDateChange(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
            />
          </div>

          {/* Time slots */}
          {rescheduleDate && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Available times</label>
              {rescheduleSlotsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : rescheduleSlots.filter((s) => s.available).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No available time slots for this date. Please select another date.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                  {rescheduleSlots
                    .filter((s) => s.available)
                    .map((slot) => (
                      <Button
                        key={slot.utc}
                        variant={selectedRescheduleTime === slot.time ? "default" : "outline"}
                        size="sm"
                        className="text-sm"
                        onClick={() => {
                          setSelectedRescheduleTime(slot.time);
                          setSelectedRescheduleUTC(slot.utc);
                        }}
                      >
                        {slot.time}
                      </Button>
                    ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRescheduleId(null);
                setRescheduleDate("");
                setRescheduleSlots([]);
                setSelectedRescheduleTime(null);
                setSelectedRescheduleUTC(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={!selectedRescheduleUTC || rescheduleMutation.isPending}
            >
              {rescheduleMutation.isPending ? "Rescheduling..." : "Confirm Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
