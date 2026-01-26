import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Link as LinkIcon, Copy, ExternalLink, Loader2, CheckCircle, AlertCircle, User, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [bookingUrl, setBookingUrl] = useState("");

  const { data: calendarStatus, isLoading: calendarLoading } = useQuery<{
    connected: boolean;
    email?: string;
  }>({
    queryKey: ["/api/calendar/status"],
  });

  const { data: eventTypes } = useQuery<{ slug: string }[]>({
    queryKey: ["/api/event-types"],
  });

  const connectCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/calendar/connect");
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/status"] });
      toast({ title: "Calendar connected successfully" });
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
    </div>
  );
}
