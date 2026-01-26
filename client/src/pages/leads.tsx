import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Building, Mail, ExternalLink, Sparkles, Calendar } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BookingWithDetails } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function LeadsPage() {
  const [search, setSearch] = useState("");

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings"],
  });

  const filteredBookings = bookings?.filter((b) => {
    const matchesSearch =
      b.guestName.toLowerCase().includes(search.toLowerCase()) ||
      b.guestEmail.toLowerCase().includes(search.toLowerCase()) ||
      b.guestCompany?.toLowerCase().includes(search.toLowerCase()) ||
      b.enrichment?.companyInfo?.industry?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  }) || [];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-muted-foreground">AI-enriched contact information from bookings</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {search ? "No matching leads" : "No leads yet"}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? "Try adjusting your search terms"
                : "Leads are automatically created from bookings and enriched with AI"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBookings.map((booking) => (
            <Card key={booking.id} className="overflow-visible hover-elevate">
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>{getInitials(booking.guestName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{booking.guestName}</h3>
                    {booking.enrichment?.personalInfo?.role && (
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.enrichment.personalInfo.role}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {booking.enrichment ? (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Enriched
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Not Enriched</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{booking.guestEmail}</span>
                  </div>
                  
                  {booking.guestCompany && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building className="h-4 w-4 shrink-0" />
                      <span className="truncate">{booking.guestCompany}</span>
                    </div>
                  )}

                  {booking.enrichment?.companyInfo?.industry && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Badge variant="secondary" className="text-xs font-normal">
                        {booking.enrichment.companyInfo.industry}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      {format(parseISO(booking.startTime as unknown as string), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href={`/bookings/${booking.id}`} data-testid={`link-view-${booking.id}`}>
                      View Details
                    </Link>
                  </Button>
                  {booking.enrichment?.personalInfo?.linkedInUrl && (
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={booking.enrichment.personalInfo.linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-linkedin-${booking.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
