import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useRoute, Link } from "wouter";
import { ArrowLeft, Loader2, Sparkles, Plus, Trash2, ChevronUp, ChevronDown, MapPin, Globe, Phone, Video, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EventType } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "URL slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  duration: z.number().min(5, "Minimum 5 minutes").max(480, "Maximum 8 hours"),
  bufferBefore: z.number().min(0).max(120).default(0),
  bufferAfter: z.number().min(0).max(120).default(0),
  color: z.string().default("#6366f1"),
  isActive: z.boolean().default(true),
  questions: z.array(z.string()).default([]),
  location: z.string().optional(),
  logo: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const colorOptions = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f43f5e", label: "Rose" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#64748b", label: "Slate" },
];

const durationOptions = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

export default function EventTypeFormPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/event-types/:id");
  const isEditing = params?.id && params.id !== "new";
  const { toast } = useToast();

  const { data: eventType, isLoading } = useQuery<EventType>({
    queryKey: ["/api/event-types", params?.id],
    enabled: !!isEditing,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      color: "#6366f1",
      isActive: true,
      questions: [],
      location: "",
      logo: "",
      primaryColor: "",
      secondaryColor: "",
    },
  });

  useEffect(() => {
    if (eventType) {
      form.reset({
        name: eventType.name,
        slug: eventType.slug,
        description: eventType.description || "",
        duration: eventType.duration,
        bufferBefore: eventType.bufferBefore || 0,
        bufferAfter: eventType.bufferAfter || 0,
        color: eventType.color || "#6366f1",
        isActive: eventType.isActive ?? true,
        questions: (eventType.questions as string[]) || [],
        location: eventType.location || "",
        logo: eventType.logo || "",
        primaryColor: eventType.primaryColor || "",
        secondaryColor: eventType.secondaryColor || "",
      });
    }
  }, [eventType, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("POST", "/api/event-types", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-types"] });
      toast({ title: "Event type created" });
      setLocation("/event-types");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("PATCH", `/api/event-types/${params?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-types"] });
      toast({ title: "Event type updated" });
      setLocation("/event-types");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const onSubmit = (data: FormValues) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/event-types" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            {isEditing ? "Edit Event Type" : "Create Event Type"}
          </h1>
          <p className="text-muted-foreground">
            {isEditing ? "Update your event type settings" : "Set up a new bookable meeting type"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Info</CardTitle>
              <CardDescription>Define your event type name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Discovery Call"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!isEditing && !form.getValues("slug")) {
                            form.setValue("slug", generateSlug(e.target.value));
                          }
                        }}
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Slug</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="text-sm text-muted-foreground mr-2">/book/</span>
                        <Input
                          placeholder="discovery-call"
                          {...field}
                          data-testid="input-slug"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      The URL path for your booking page
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this meeting is about..."
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Duration & Buffers</CardTitle>
              <CardDescription>Set the meeting length and buffer times</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <Select
                      value={field.value.toString()}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-duration">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {durationOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value.toString()}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bufferBefore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buffer Before (min)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-buffer-before"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bufferAfter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buffer After (min)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-buffer-after"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pre-Qualification Questions</CardTitle>
              <CardDescription>Questions to ask guests during the booking process</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const questions = form.watch("questions");

                const addQuestion = () => {
                  form.setValue("questions", [...questions, ""]);
                };

                const removeQuestion = (index: number) => {
                  form.setValue("questions", questions.filter((_: string, i: number) => i !== index));
                };

                const moveQuestion = (index: number, direction: "up" | "down") => {
                  const newQuestions = [...questions];
                  const swapIndex = direction === "up" ? index - 1 : index + 1;
                  [newQuestions[index], newQuestions[swapIndex]] = [newQuestions[swapIndex], newQuestions[index]];
                  form.setValue("questions", newQuestions);
                };

                const updateQuestion = (index: number, value: string) => {
                  const newQuestions = [...questions];
                  newQuestions[index] = value;
                  form.setValue("questions", newQuestions);
                };

                return (
                  <>
                    {questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No questions added yet. Questions will be asked to guests during the booking pre-qualification chat.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {questions.map((question: string, index: number) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              value={question}
                              onChange={(e) => updateQuestion(index, e.target.value)}
                              placeholder={`Question ${index + 1}`}
                              data-testid={`input-question-${index}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={index === 0}
                              onClick={() => moveQuestion(index, "up")}
                              data-testid={`button-question-up-${index}`}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={index === questions.length - 1}
                              onClick={() => moveQuestion(index, "down")}
                              data-testid={`button-question-down-${index}`}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeQuestion(index)}
                              data-testid={`button-question-delete-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addQuestion}
                      data-testid="button-add-question"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Question
                    </Button>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meeting Location</CardTitle>
              <CardDescription>Where will this meeting take place?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const locationValue = form.watch("location") || "";
                const locationType = locationValue.includes(":") ? locationValue.split(":")[0] : locationValue;
                const locationDetail = locationValue.includes(":") ? locationValue.substring(locationValue.indexOf(":") + 1) : "";

                const handleTypeChange = (type: string) => {
                  if (type === "" || type === "google-meet") {
                    form.setValue("location", type);
                  } else {
                    form.setValue("location", `${type}:`);
                  }
                };

                const handleDetailChange = (detail: string) => {
                  form.setValue("location", `${locationType}:${detail}`);
                };

                return (
                  <>
                    <Select
                      value={locationType}
                      onValueChange={handleTypeChange}
                    >
                      <SelectTrigger data-testid="select-location">
                        <SelectValue placeholder="Not specified" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Not specified</SelectItem>
                        <SelectItem value="google-meet">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Google Meet (auto-generated)
                          </div>
                        </SelectItem>
                        <SelectItem value="zoom">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Zoom
                          </div>
                        </SelectItem>
                        <SelectItem value="phone">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone Call
                          </div>
                        </SelectItem>
                        <SelectItem value="in-person">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            In Person
                          </div>
                        </SelectItem>
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Custom URL
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {locationType === "google-meet" && (
                      <p className="text-sm text-muted-foreground">
                        A Google Meet link will be auto-generated when a booking is confirmed
                      </p>
                    )}
                    {locationType === "zoom" && (
                      <Input
                        value={locationDetail}
                        onChange={(e) => handleDetailChange(e.target.value)}
                        placeholder="Paste your Zoom link"
                        data-testid="input-location-detail"
                      />
                    )}
                    {locationType === "phone" && (
                      <Input
                        value={locationDetail}
                        onChange={(e) => handleDetailChange(e.target.value)}
                        placeholder="Your phone number"
                        data-testid="input-location-detail"
                      />
                    )}
                    {locationType === "in-person" && (
                      <Input
                        value={locationDetail}
                        onChange={(e) => handleDetailChange(e.target.value)}
                        placeholder="Meeting address"
                        data-testid="input-location-detail"
                      />
                    )}
                    {locationType === "custom" && (
                      <Input
                        value={locationDetail}
                        onChange={(e) => handleDetailChange(e.target.value)}
                        placeholder="Meeting URL"
                        data-testid="input-location-detail"
                      />
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how your event type looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          className={`w-8 h-8 rounded-md border-2 transition-all ${
                            field.value === color.value
                              ? "border-foreground scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color.value }}
                          onClick={() => field.onChange(color.value)}
                          title={color.label}
                          data-testid={`button-color-${color.label.toLowerCase()}`}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/logo.png"
                        {...field}
                        data-testid="input-logo"
                      />
                    </FormControl>
                    <FormDescription>
                      URL to your logo image for the booking page
                    </FormDescription>
                    {field.value && (
                      <img
                        src={field.value}
                        className="h-10 w-10 rounded object-contain border mt-2"
                        alt="Logo preview"
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Brand Color</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="#6366f1"
                          {...field}
                          data-testid="input-primary-color"
                        />
                      </FormControl>
                      <div
                        className="h-8 w-8 rounded border flex-shrink-0"
                        style={{ backgroundColor: field.value || "#6366f1" }}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="secondaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secondary Brand Color</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="#6366f1"
                          {...field}
                          data-testid="input-secondary-color"
                        />
                      </FormControl>
                      <div
                        className="h-8 w-8 rounded border flex-shrink-0"
                        style={{ backgroundColor: field.value || "#6366f1" }}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        When active, this event type can receive bookings
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link href="/event-types" data-testid="button-cancel">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Event Type"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
