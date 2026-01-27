import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, FileText, Clock, TrendingUp, ArrowRight, Plus, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { BookingWithDetails, EventType } from "@shared/schema";
import { format, isToday, isTomorrow, parseISO, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";

const LEAD_SCORE_COLORS: Record<string, string> = {
  High: "#22c55e",
  Medium: "#f59e0b",
  Low: "#ef4444",
};

export default function DashboardPage() {
  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings"],
  });

  const { data: eventTypes, isLoading: eventTypesLoading } = useQuery<EventType[]>({
    queryKey: ["/api/event-types"],
  });

  const upcomingBookings = bookings
    ?.filter((b) => new Date(b.startTime) > new Date() && b.status === "confirmed")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5) || [];

  const todayBookings = bookings?.filter((b) => isToday(new Date(b.startTime))) || [];
  const totalBookings = bookings?.length || 0;
  const activeEventTypes = eventTypes?.filter((e) => e.isActive).length || 0;
  const enrichedLeads = bookings?.filter((b) => b.enrichment).length || 0;

  // This week's bookings (Monday-Sunday)
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thisWeekBookings = bookings?.filter((b) =>
    isWithinInterval(new Date(b.startTime), { start: thisWeekStart, end: thisWeekEnd })
  ).length || 0;

  // Booking trend data: last 4 weeks
  const bookingTrendData = (() => {
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const count = bookings?.filter((b) =>
        isWithinInterval(new Date(b.startTime), { start: weekStart, end: weekEnd })
      ).length || 0;
      weeks.push({
        week: format(weekStart, "MMM d"),
        bookings: count,
      });
    }
    return weeks;
  })();

  // Lead score distribution data
  const leadScoreData = (() => {
    const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    bookings?.forEach((b) => {
      const label = b.enrichment?.leadScoreLabel;
      if (label && label in counts) {
        counts[label]++;
      }
    });
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));
  })();

  const formatBookingDate = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isTomorrow(date)) return `Tomorrow at ${format(date, "h:mm a")}`;
    return format(date, "MMM d 'at' h:mm a");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your scheduling activity</p>
        </div>
        <Button asChild data-testid="button-new-event-type">
          <Link href="/event-types/new">
            <Plus className="h-4 w-4 mr-2" />
            New Event Type
          </Link>
        </Button>
      </div>

      {/* Metric Cards - 5 columns */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-today-meetings">{todayBookings.length}</div>
                <p className="text-xs text-muted-foreground">scheduled for today</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-this-week-bookings">{thisWeekBookings}</div>
                <p className="text-xs text-muted-foreground">bookings this week</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Bookings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-bookings">{totalBookings}</div>
                <p className="text-xs text-muted-foreground">all time</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Event Types</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {eventTypesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-event-types">{activeEventTypes}</div>
                <p className="text-xs text-muted-foreground">active event types</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enriched Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-enriched-leads">{enrichedLeads}</div>
                <p className="text-xs text-muted-foreground">with AI research</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booking Trend</CardTitle>
            <CardDescription>Bookings per week over the last 4 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="h-[250px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bookingTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="week"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bookings"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Score Distribution</CardTitle>
            <CardDescription>Breakdown of enriched lead scores</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="h-[250px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : leadScoreData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No enriched leads yet</p>
                <p className="text-sm text-muted-foreground">Lead scores will appear once bookings are enriched</p>
              </div>
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadScoreData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={true}
                    >
                      {leadScoreData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={LEAD_SCORE_COLORS[entry.name] || "#8884d8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend
                      formatter={(value: string) => (
                        <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Meetings & Event Types */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Upcoming Meetings</CardTitle>
                <CardDescription>Your next scheduled bookings</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/bookings" data-testid="link-view-all-bookings">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingBookings.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No upcoming meetings</p>
                <p className="text-sm text-muted-foreground">Share your booking link to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/bookings/${booking.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover-elevate"
                    data-testid={`link-booking-${booking.id}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs">
                        {getInitials(booking.guestName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{booking.guestName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.guestCompany || booking.guestEmail}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatBookingDate(booking.startTime)}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <LeadScoreBadge
                          score={booking.enrichment?.leadScore}
                          label={booking.enrichment?.leadScoreLabel}
                          size="sm"
                        />
                        <Badge variant="secondary" className="text-xs">
                          {booking.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Event Types</CardTitle>
                <CardDescription>Meeting types available for booking</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/event-types" data-testid="link-view-all-event-types">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {eventTypesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !eventTypes || eventTypes.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No event types yet</p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/event-types/new" data-testid="button-create-first-event-type">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {eventTypes.slice(0, 4).map((eventType) => (
                  <Link
                    key={eventType.id}
                    href={`/event-types/${eventType.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover-elevate"
                    data-testid={`link-event-type-${eventType.id}`}
                  >
                    <div
                      className="h-10 w-10 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `${eventType.color || "#6366f1"}20`, color: eventType.color || "#6366f1" }}
                    >
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{eventType.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {eventType.duration} min
                        {!eventType.isActive && " (inactive)"}
                      </p>
                    </div>
                    <Badge
                      variant={eventType.isActive ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {eventType.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
