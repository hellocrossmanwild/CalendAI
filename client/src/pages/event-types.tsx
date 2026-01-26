import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Clock, Link as LinkIcon, MoreVertical, Pencil, Trash2, Copy, ExternalLink, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EventType } from "@shared/schema";

export default function EventTypesPage() {
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: eventTypes, isLoading } = useQuery<EventType[]>({
    queryKey: ["/api/event-types"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/event-types/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-types"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/event-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-types"] });
      toast({ title: "Event type deleted" });
      setDeleteId(null);
    },
  });

  const copyBookingLink = (slug: string) => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Event Types</h1>
          <p className="text-muted-foreground">Create and manage your bookable meeting types</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" data-testid="button-create-ai">
            <Link href="/event-types/new/ai">
              <Sparkles className="h-4 w-4 mr-2" />
              Create with AI
            </Link>
          </Button>
          <Button asChild data-testid="button-create-event-type">
            <Link href="/event-types/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Manually
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-md" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !eventTypes || eventTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No event types yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Create your first event type to start accepting bookings
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button asChild variant="outline" data-testid="button-create-first-ai">
                <Link href="/event-types/new/ai">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create with AI
                </Link>
              </Button>
              <Button asChild data-testid="button-create-first">
                <Link href="/event-types/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Manually
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {eventTypes.map((eventType) => (
            <Card key={eventType.id} className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="h-12 w-12 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
                      style={{ backgroundColor: `${eventType.color}20`, color: eventType.color }}
                    >
                      {eventType.logo ? (
                        <img src={eventType.logo} alt="" className="h-10 w-10 object-contain" />
                      ) : (
                        <Clock className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{eventType.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {eventType.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-menu-${eventType.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/event-types/${eventType.id}`}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyBookingLink(eventType.slug)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/book/${eventType.slug}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Preview
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(eventType.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      {eventType.duration} min
                    </Badge>
                    {eventType.bufferBefore || eventType.bufferAfter ? (
                      <span className="text-xs text-muted-foreground">
                        +{(eventType.bufferBefore || 0) + (eventType.bufferAfter || 0)}m buffer
                      </span>
                    ) : null}
                    {eventType.location && (
                      <Badge variant="outline" className="text-xs">
                        {eventType.location === "google-meet" ? "Google Meet" :
                         eventType.location.startsWith("zoom") ? "Zoom" :
                         eventType.location.startsWith("phone") ? "Phone" :
                         eventType.location.startsWith("in-person") ? "In Person" :
                         eventType.location.startsWith("custom") ? "Custom Link" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {eventType.isActive ? "Active" : "Inactive"}
                    </span>
                    <Switch
                      checked={eventType.isActive || false}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: eventType.id, isActive: checked })
                      }
                      data-testid={`switch-active-${eventType.id}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this event type and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
