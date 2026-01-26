import { Calendar, Sparkles, Users, FileText, Clock, CheckCircle, ArrowRight, Zap, Brain, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Setup",
    description: "Intelligent availability scanning and event type suggestions based on your calendar patterns.",
  },
  {
    icon: Users,
    title: "Lead Enrichment",
    description: "Automatic web research pulls company info, LinkedIn profiles, and recent news for every booking.",
  },
  {
    icon: Sparkles,
    title: "Conversational Pre-Qual",
    description: "Replace static forms with AI-driven conversations that naturally gather the information you need.",
  },
  {
    icon: FileText,
    title: "Meeting Prep Briefs",
    description: "Auto-generated summaries with talking points, key context, and document analysis.",
  },
  {
    icon: Clock,
    title: "Smart Scheduling",
    description: "Real-time availability display with buffer times and timezone intelligence.",
  },
  {
    icon: Shield,
    title: "Seamless Integration",
    description: "Connect with Google Calendar for automatic event creation and confirmation emails.",
  },
];

const benefits = [
  "AI extracts insights from every booking",
  "Never walk into a meeting unprepared",
  "Reduce no-shows with smart reminders",
  "Professional booking pages in seconds",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Calendar className="h-5 w-5" />
            </div>
            <span className="font-semibold text-xl">CalendAI</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Features</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">How it Works</a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild data-testid="button-login">
              <a href="/api/login">Get Started</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
                <Zap className="h-4 w-4" />
                <span>AI-First Scheduling</span>
              </div>
              
              <h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Scheduling that actually
                <span className="text-primary"> prepares you</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Go beyond basic booking. CalendAI enriches every lead, qualifies prospects through conversation, 
                and generates meeting prep briefs so you&apos;re always ready.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Button size="lg" asChild data-testid="button-get-started">
                  <a href="/api/login">
                    Start Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild data-testid="button-learn-more">
                  <a href="#features">Learn More</a>
                </Button>
              </div>

              <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
                Everything you need for smarter scheduling
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From booking to prep, CalendAI handles the heavy lifting so you can focus on the conversation.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {features.map((feature, i) => (
                <Card key={i} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
                How it works
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Set up once, let AI handle the rest.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto mb-4 text-xl font-bold">
                  1
                </div>
                <h3 className="font-semibold text-lg mb-2">Create Event Types</h3>
                <p className="text-muted-foreground text-sm">
                  Set up your meeting types with AI-assisted descriptions and smart availability rules.
                </p>
              </div>

              <div className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto mb-4 text-xl font-bold">
                  2
                </div>
                <h3 className="font-semibold text-lg mb-2">Share Your Link</h3>
                <p className="text-muted-foreground text-sm">
                  Give prospects your booking link or embed it on your site with a simple widget.
                </p>
              </div>

              <div className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto mb-4 text-xl font-bold">
                  3
                </div>
                <h3 className="font-semibold text-lg mb-2">Get Prepared</h3>
                <p className="text-muted-foreground text-sm">
                  AI enriches each lead and generates meeting briefs so you&apos;re always ready.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              Ready to transform your scheduling?
            </h2>
            <p className="text-primary-foreground/80 max-w-2xl mx-auto mb-8">
              Join thousands of professionals who never walk into a meeting unprepared.
            </p>
            <Button size="lg" variant="secondary" asChild data-testid="button-cta-signup">
              <a href="/api/login">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-semibold">CalendAI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} CalendAI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
