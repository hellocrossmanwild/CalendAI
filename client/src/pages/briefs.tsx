import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Calendar, Clock, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BookingWithDetails } from "@shared/schema";
import { format, parseISO, isToday, isTomorrow } from "date-fns";

export default function BriefsPage() {
  const [search, setSearch] = useState("");

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings"],
  });

  const bookingsWithBriefs = bookings?.filter((b) => b.brief) || [];
  const upcomingWithoutBriefs = bookings?.filter(
    (b) => !b.brief && new Date(b.startTime) > new Date() && b.status === "confirmed"
  ).slice(0, 3) || [];

  const filteredBookings = bookingsWithBriefs.filter((b) => {
    const matchesSearch =
      b.guestName.toLowerCase().includes(search.toLowerCase()) ||
      b.guestEmail.toLowerCase().includes(search.toLowerCase()) ||
      b.brief?.summary?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatBookingDate = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "MMM d");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Meeting Briefs</h1>
          <p className="text-muted-foreground">AI-generated preparation summaries</p>
        </div>
      </div>

      {upcomingWithoutBriefs.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Generate Briefs for Upcoming Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {upcomingWithoutBriefs.map((booking) => (
                <Button key={booking.id} variant="outline" size="sm" asChild>
                  <Link href={`/bookings/${booking.id}`} data-testid={`link-generate-brief-${booking.id}`}>
                    <Calendar className="h-4 w-4 mr-2" />
                    {booking.guestName} - {formatBookingDate(booking.startTime)}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search briefs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {search ? "No matching briefs" : "No meeting briefs yet"}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? "Try adjusting your search terms"
                : "Generate briefs from your booking details page"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <Card key={booking.id} className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback>{getInitials(booking.guestName)}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="font-semibold">{booking.guestName}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(parseISO(booking.startTime as unknown as string), "MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(parseISO(booking.startTime as unknown as string), "h:mm a")}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/bookings/${booking.id}`} data-testid={`link-view-${booking.id}`}>
                          View Full Brief
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </div>

                    {booking.brief?.summary && (
                      <div className="bg-muted/50 rounded-lg p-4 mb-3">
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">Summary</h4>
                        <p className="text-sm line-clamp-3">{booking.brief.summary}</p>
                      </div>
                    )}

                    {booking.brief?.talkingPoints && booking.brief.talkingPoints.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Talking Points</h4>
                        <ul className="flex flex-wrap gap-2">
                          {booking.brief.talkingPoints.slice(0, 3).map((point, i) => (
                            <Badge key={i} variant="secondary" className="font-normal max-w-[250px] truncate">
                              {point}
                            </Badge>
                          ))}
                          {booking.brief.talkingPoints.length > 3 && (
                            <Badge variant="outline" className="font-normal">
                              +{booking.brief.talkingPoints.length - 3} more
                            </Badge>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
