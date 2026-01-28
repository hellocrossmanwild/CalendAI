import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Calendar, CalendarClock, Clock, Mail, Building, Globe, FileText, Sparkles, Loader2, ExternalLink, User, Briefcase, MapPin, Phone, TrendingUp, CheckCircle, XCircle, RefreshCw, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import type { BookingWithDetails } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function BookingDetailPage() {
  const [, params] = useRoute("/bookings/:id");
  const { toast } = useToast();

  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<{ time: string; available: boolean; utc: string }[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [selectedRescheduleTime, setSelectedRescheduleTime] = useState<string | null>(null);
  const [selectedRescheduleUTC, setSelectedRescheduleUTC] = useState<string | null>(null);

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

  const regenerateBriefMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/bookings/${params?.id}/generate-brief?force=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", params?.id] });
      toast({ title: "Meeting brief regenerated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to regenerate brief", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest("PATCH", `/api/bookings/${params?.id}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const fetchRescheduleSlots = async (date: string) => {
    if (!booking?.eventType?.slug) return;
    setRescheduleSlotsLoading(true);
    setSelectedRescheduleTime(null);
    setSelectedRescheduleUTC(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/public/availability/${booking.eventType.slug}?date=${date}&timezone=${tz}`);
      if (!res.ok) throw new Error("Failed to fetch availability");
      const data = await res.json();
      setRescheduleSlots(data.slots || []);
    } catch {
      setRescheduleSlots([]);
    } finally {
      setRescheduleSlotsLoading(false);
    }
  };

  const rescheduleMutation = useMutation({
    mutationFn: async (data: { startTimeUTC: string }) => {
      return apiRequest("POST", `/api/bookings/${params?.id}/reschedule`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking rescheduled" });
      setShowReschedule(false);
    },
    onError: (error: Error) => {
      if (error.message.startsWith("409")) {
        toast({ title: "Time slot no longer available", description: "Please select another time.", variant: "destructive" });
        if (rescheduleDate && booking?.eventType?.slug) {
          fetchRescheduleSlots(rescheduleDate);
        }
      } else {
        toast({ title: "Failed to reschedule", description: error.message, variant: "destructive" });
      }
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

  // Mark brief as read when viewed
  useEffect(() => {
    if (booking?.brief && !booking.brief.readAt) {
      apiRequest("PATCH", `/api/bookings/${params?.id}/brief/read`).catch(() => {});
      // Also invalidate the unread count
      queryClient.invalidateQueries({ queryKey: ["/api/briefs/unread-count"] });
    }
  }, [booking?.brief, params?.id]);

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
                {booking.status === "completed" ? (
                  <Badge variant="outline" className="border-green-500 text-green-600">Completed</Badge>
                ) : booking.status === "cancelled" ? (
                  <Badge variant="destructive">Cancelled</Badge>
                ) : booking.status === "no-show" ? (
                  <Badge variant="outline" className="border-orange-500 text-orange-600">No-Show</Badge>
                ) : (
                  <Badge>Confirmed</Badge>
                )}
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

              {booking.cancellationReason && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Cancellation Reason
                    </h4>
                    <p className="text-sm text-muted-foreground">{booking.cancellationReason}</p>
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
                {booking.timezone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                    <Globe className="h-4 w-4" />
                    Guest timezone: {booking.timezone}
                  </div>
                )}
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
                {brief.documentAnalysis && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Document Analysis</h4>
                    <p className="text-sm text-muted-foreground">{brief.documentAnalysis}</p>
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
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => regenerateBriefMutation.mutate()}
                  disabled={regenerateBriefMutation.isPending}
                >
                  {regenerateBriefMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Regenerate Brief
                </Button>
              )}
              {booking.status === "confirmed" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowReschedule(true);
                    setRescheduleDate("");
                    setRescheduleSlots([]);
                    setSelectedRescheduleTime(null);
                    setSelectedRescheduleUTC(null);
                  }}
                  data-testid="button-reschedule"
                >
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Reschedule
                </Button>
              )}
              {booking.status !== "cancelled" && (
                <>
                  <Separator />
                  {booking.status === "confirmed" ? (
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full border-green-500 text-green-600 hover:bg-green-50"
                        onClick={() => statusMutation.mutate("completed")}
                        disabled={statusMutation.isPending}
                        data-testid="button-mark-complete"
                      >
                        {statusMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Mark Complete
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-orange-500 text-orange-600 hover:bg-orange-50"
                        onClick={() => statusMutation.mutate("no-show")}
                        disabled={statusMutation.isPending}
                        data-testid="button-mark-noshow"
                      >
                        {statusMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Mark No-Show
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Status: {booking.status}
                    </p>
                  )}
                </>
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
                      backgroundColor: `${booking.eventType.color || "#6366f1"}20`,
                      color: booking.eventType.color || "#6366f1",
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

      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Choose a new date and time for the meeting with {booking.guestName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Select Date</label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setRescheduleDate(val);
                  if (val) fetchRescheduleSlots(val);
                }}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
            {rescheduleSlotsLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!rescheduleSlotsLoading && rescheduleDate && rescheduleSlots.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Available Times</label>
                <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                  {rescheduleSlots
                    .filter((s) => s.available)
                    .map((slot) => (
                      <Button
                        key={slot.utc}
                        variant={selectedRescheduleTime === slot.time ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSelectedRescheduleTime(slot.time);
                          setSelectedRescheduleUTC(slot.utc);
                        }}
                      >
                        {slot.time}
                      </Button>
                    ))}
                </div>
              </div>
            )}
            {!rescheduleSlotsLoading && rescheduleDate && rescheduleSlots.length > 0 && rescheduleSlots.filter((s) => s.available).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No available times on this date. Please choose another date.
              </p>
            )}
            {!rescheduleSlotsLoading && rescheduleDate && rescheduleSlots.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No availability found for this date. Please choose another date.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReschedule(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedRescheduleUTC || rescheduleMutation.isPending}
              onClick={() => {
                if (selectedRescheduleUTC) {
                  rescheduleMutation.mutate({ startTimeUTC: selectedRescheduleUTC });
                }
              }}
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4 mr-2" />
              )}
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
