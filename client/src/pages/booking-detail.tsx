import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Calendar, Clock, Mail, Building, Globe, FileText, Sparkles, Loader2, ExternalLink, User, Briefcase, MapPin, Phone, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import type { BookingWithDetails } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function BookingDetailPage() {
  const [, params] = useRoute("/bookings/:id");
  const { toast } = useToast();

  const { data: booking, isLoading } = useQuery<BookingWithDetails>({
    queryKey: ["/api/bookings", params?.id],
    enabled: !!params?.id,
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/bookings/${params?.id}/enrich`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", params?.id] });
      toast({ title: "Lead enriched successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Enrichment failed", description: error.message, variant: "destructive" });
    },
  });

  const generateBriefMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/bookings/${params?.id}/generate-brief`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", params?.id] });
      toast({ title: "Meeting brief generated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate brief", description: error.message, variant: "destructive" });
    },
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Booking not found</h3>
            <Button asChild variant="outline">
              <Link href="/bookings">Back to Bookings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const enrichment = booking.enrichment;
  const brief = booking.brief;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/bookings" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Booking Details</h1>
          <p className="text-muted-foreground">
            Meeting with {booking.guestName}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="text-lg">
                      {getInitials(booking.guestName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{booking.guestName}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      {booking.guestCompany && (
                        <>
                          <Building className="h-4 w-4" />
                          {booking.guestCompany}
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <Badge>{booking.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{booking.guestEmail}</span>
                </div>
                {booking.guestPhone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${booking.guestPhone}`} className="text-sm text-primary hover:underline">
                      {booking.guestPhone}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{booking.timezone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(parseISO(booking.startTime as unknown as string), "EEEE, MMMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(parseISO(booking.startTime as unknown as string), "h:mm a")} - {format(parseISO(booking.endTime as unknown as string), "h:mm a")}
                  </span>
                </div>
              </div>

              {booking.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground">{booking.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {enrichment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Lead Enrichment
                </CardTitle>
                <CardDescription>AI-powered research insights</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {enrichment.leadScoreLabel && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Lead Score
                    </h4>
                    <div className="flex items-center gap-3 mb-2">
                      <LeadScoreBadge
                        score={enrichment.leadScore}
                        label={enrichment.leadScoreLabel}
                        showScore={true}
                      />
                    </div>
                    {enrichment.leadScoreReasoning && (
                      <p className="text-sm text-muted-foreground">
                        {enrichment.leadScoreReasoning}
                      </p>
                    )}
                  </div>
                )}

                {enrichment.companyInfo && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Company Information
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {enrichment.companyInfo.industry && (
                        <div className="flex items-start gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Industry</p>
                            <p className="text-sm">{enrichment.companyInfo.industry}</p>
                          </div>
                        </div>
                      )}
                      {enrichment.companyInfo.size && (
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Company Size</p>
                            <p className="text-sm">{enrichment.companyInfo.size}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {enrichment.companyInfo.description && (
                      <p className="text-sm text-muted-foreground mt-3">
                        {enrichment.companyInfo.description}
                      </p>
                    )}
                    {enrichment.companyInfo.recentNews && enrichment.companyInfo.recentNews.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-muted-foreground mb-2">Recent News</p>
                        <ul className="space-y-1">
                          {enrichment.companyInfo.recentNews.slice(0, 3).map((news, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-primary">•</span>
                              {news}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {enrichment.personalInfo && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Personal Information
                    </h4>
                    {enrichment.personalInfo.role && (
                      <p className="text-sm mb-2">
                        <span className="text-muted-foreground">Role:</span> {enrichment.personalInfo.role}
                      </p>
                    )}
                    {enrichment.personalInfo.bio && (
                      <p className="text-sm text-muted-foreground">{enrichment.personalInfo.bio}</p>
                    )}
                    {enrichment.personalInfo.linkedInUrl && (
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <a href={enrichment.personalInfo.linkedInUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          LinkedIn Profile
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {brief && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Meeting Brief
                </CardTitle>
                <CardDescription>AI-generated preparation summary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {brief.summary && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Summary</h4>
                    <p className="text-sm text-muted-foreground">{brief.summary}</p>
                  </div>
                )}
                {brief.talkingPoints && brief.talkingPoints.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Talking Points</h4>
                    <ul className="space-y-2">
                      {brief.talkingPoints.map((point, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary font-medium">{i + 1}.</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.keyContext && brief.keyContext.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Key Context</h4>
                    <ul className="space-y-1">
                      {brief.keyContext.map((ctx, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {ctx}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!enrichment && (
                <Button
                  className="w-full"
                  onClick={() => enrichMutation.mutate()}
                  disabled={enrichMutation.isPending}
                  data-testid="button-enrich"
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Enrich Lead
                </Button>
              )}
              {!brief && (
                <Button
                  variant={enrichment ? "default" : "outline"}
                  className="w-full"
                  onClick={() => generateBriefMutation.mutate()}
                  disabled={generateBriefMutation.isPending}
                  data-testid="button-generate-brief"
                >
                  {generateBriefMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Generate Brief
                </Button>
              )}
              {enrichment && brief && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  All AI features complete
                </p>
              )}
            </CardContent>
          </Card>

          {booking.eventType && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: `${booking.eventType.color}20`,
                      color: booking.eventType.color,
                    }}
                  >
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{booking.eventType.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {booking.eventType.duration} minutes
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
