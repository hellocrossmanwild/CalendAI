import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import {
  Calendar,
  Clock,
  AlertTriangle,
  XCircle,
  CheckCircle,
  User,
  Loader2,
  CalendarOff,
  LinkIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";

interface CancelBookingData {
  id: number;
  guestName: string;
  guestEmail: string;
  eventTypeName: string;
  startTime: string;
  endTime: string;
  status: string;
  timezone: string;
  eventType: {
    slug: string;
    primaryColor?: string;
    secondaryColor?: string;
    color?: string;
    logo?: string;
    host?: {
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    };
  };
}

export default function CancelBookingPage() {
  const [, params] = useRoute("/booking/cancel/:token");
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);

  const {
    data: booking,
    isLoading,
    error,
  } = useQuery<CancelBookingData>({
    queryKey: ["/api/public/booking/cancel", params?.token],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking/cancel/${params?.token}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    enabled: !!params?.token,
  });

  const cancelMutation = useMutation({
    mutationFn: async (data: { reason?: string }) => {
      return apiRequest("POST", `/api/public/booking/cancel/${params?.token}`, data);
    },
    onSuccess: () => {
      setIsCancelled(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Brand colors derived from event type settings
  const brandPrimary = booking?.eventType?.primaryColor || booking?.eventType?.color || "#6366f1";
  const brandSecondary = booking?.eventType?.secondaryColor || brandPrimary;

  // Host display helpers
  const hostInitials = booking?.eventType?.host
    ? `${booking.eventType.host.firstName?.[0] || ""}${booking.eventType.host.lastName?.[0] || ""}`.toUpperCase()
    : "";
  const hostFullName = booking?.eventType?.host
    ? `${booking.eventType.host.firstName || ""} ${booking.eventType.host.lastName || ""}`.trim()
    : "";

  // Determine booking state
  const isAlreadyCancelled = booking?.status === "cancelled";
  const isPastBooking = booking ? new Date(booking.startTime) < new Date() : false;

  // Check if within minimum notice period (booking is within 1 hour from now)
  const isWithinNoticePeriod = booking
    ? new Date(booking.startTime).getTime() - Date.now() < 60 * 60 * 1000 &&
      new Date(booking.startTime) > new Date()
    : false;

  const handleConfirmCancel = () => {
    cancelMutation.mutate({ reason: reason.trim() || undefined });
  };

  const bookAgainSlug = booking?.eventType?.slug;

  // --- Loading State ---
  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          "--brand-primary": "#6366f1",
          "--brand-secondary": "#6366f1",
        } as React.CSSProperties}
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-16 w-16 rounded-full mx-auto" />
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
              <div className="space-y-3 pt-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Invalid Token State ---
  if (error || !booking) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          "--brand-primary": "#6366f1",
          "--brand-secondary": "#6366f1",
        } as React.CSSProperties}
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
              style={{ backgroundColor: "#ef444515" }}
            >
              <LinkIcon className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">This link is no longer valid</h2>
            <p className="text-muted-foreground">
              The cancellation link you followed is invalid or has expired. Please check your email
              for the correct link, or contact the host directly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Already Cancelled State ---
  if (isAlreadyCancelled && !isCancelled) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          "--brand-primary": brandPrimary,
          "--brand-secondary": brandSecondary,
        } as React.CSSProperties}
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card
          className="w-full max-w-md text-center"
          style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
        >
          <CardContent className="p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
              style={{ backgroundColor: `${brandPrimary}15` }}
            >
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">This booking has already been cancelled</h2>
            <p className="text-muted-foreground mb-6">
              The booking for <span className="font-medium">{booking.eventTypeName}</span> has
              already been cancelled. No further action is needed.
            </p>
            {bookAgainSlug && (
              <Button
                className="w-full text-white"
                onClick={() => (window.location.href = `/book/${bookAgainSlug}`)}
                style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Book Again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Past Booking State ---
  if (isPastBooking && !isCancelled) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          "--brand-primary": brandPrimary,
          "--brand-secondary": brandSecondary,
        } as React.CSSProperties}
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card
          className="w-full max-w-md text-center"
          style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
        >
          <CardContent className="p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
              style={{ backgroundColor: `${brandPrimary}15` }}
            >
              <CalendarOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">This booking has already passed</h2>
            <p className="text-muted-foreground mb-6">
              The booking for <span className="font-medium">{booking.eventTypeName}</span> on{" "}
              <span className="font-medium">
                {format(parseISO(booking.startTime), "MMMM d, yyyy")}
              </span>{" "}
              has already taken place and can no longer be cancelled.
            </p>
            {bookAgainSlug && (
              <Button
                className="w-full text-white"
                onClick={() => (window.location.href = `/book/${bookAgainSlug}`)}
                style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Book Again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Cancellation Confirmed State ---
  if (isCancelled) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          "--brand-primary": brandPrimary,
          "--brand-secondary": brandSecondary,
        } as React.CSSProperties}
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
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
              <h2 className="text-xl font-semibold mb-2">Your booking has been cancelled</h2>
              <p className="text-muted-foreground">
                Your <span className="font-medium">{booking.eventTypeName}</span> booking
                {hostFullName ? ` with ${hostFullName}` : ""} on{" "}
                <span className="font-medium">
                  {format(parseISO(booking.startTime), "EEEE, MMMM d, yyyy")}
                </span>{" "}
                has been cancelled. A confirmation email has been sent to{" "}
                <span className="font-medium">{booking.guestEmail}</span>.
              </p>
            </div>

            {bookAgainSlug && (
              <Button
                className="w-full text-white"
                onClick={() => (window.location.href = `/book/${bookAgainSlug}`)}
                style={{ backgroundColor: brandPrimary, borderColor: brandPrimary }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Book Again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Main Cancel Booking View ---
  const startTime = parseISO(booking.startTime);
  const endTime = parseISO(booking.endTime);

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      style={{
        "--brand-primary": brandPrimary,
        "--brand-secondary": brandSecondary,
      } as React.CSSProperties}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card
        className="w-full max-w-md"
        style={{ borderTopWidth: "3px", borderTopColor: brandPrimary }}
      >
        <CardContent className="p-8">
          {/* Host profile section */}
          <div className="text-center mb-6">
            {booking.eventType?.host &&
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
              {booking.eventType?.logo ? (
                <img
                  src={booking.eventType.logo}
                  alt={booking.eventTypeName}
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <Calendar className="h-7 w-7" />
              )}
            </div>

            <h1 className="text-xl font-semibold mb-1">Cancel Booking</h1>
            <p className="text-muted-foreground text-sm">
              Are you sure you want to cancel this booking?
            </p>
          </div>

          {/* Booking details */}
          <div
            className="rounded-lg border bg-muted/30 p-4 space-y-3 mb-6"
            style={{ borderColor: `${brandSecondary}30` }}
          >
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">{booking.eventTypeName}</p>
                <p className="text-sm text-muted-foreground">
                  {format(startTime, "EEEE, MMMM d, yyyy")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm">
                {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
                {booking.timezone && (
                  <span className="text-muted-foreground ml-1">
                    ({booking.timezone.replace(/_/g, " ")})
                  </span>
                )}
              </p>
            </div>
            {hostFullName && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  with <span className="font-medium">{hostFullName}</span>
                </p>
              </div>
            )}
          </div>

          {/* Minimum notice warning */}
          {isWithinNoticePeriod && (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-950/30 p-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                  Short notice cancellation
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-500">
                  This booking starts soon. The host may have already prepared for this meeting.
                  You can still cancel if needed.
                </p>
              </div>
            </div>
          )}

          {/* Reason for cancellation */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-1.5 block">
              Reason for cancellation{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let the host know why you're cancelling..."
              rows={3}
              data-testid="input-cancel-reason"
            />
          </div>

          {/* Confirm cancellation button */}
          <Button
            className="w-full"
            variant="destructive"
            onClick={handleConfirmCancel}
            disabled={cancelMutation.isPending}
            data-testid="button-confirm-cancel"
          >
            {cancelMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Confirm Cancellation
          </Button>

          {/* Keep booking link */}
          <p className="text-center text-sm text-muted-foreground mt-4">
            Changed your mind?{" "}
            <button
              onClick={() => window.history.back()}
              className="underline hover:text-foreground transition-colors"
            >
              Keep this booking
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
