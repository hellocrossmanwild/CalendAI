import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Sparkles, Mail, ArrowLeft, Check, X, Loader2 } from "lucide-react";

type AuthView = "login" | "register" | "magic-link" | "forgot-password" | "reset-password" | "verify-magic-link" | "verify-email";

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
  ];

  const strength = checks.filter((c) => c.met).length;

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              strength >= level
                ? strength <= 1
                  ? "bg-red-500"
                  : strength <= 2
                    ? "bg-orange-500"
                    : strength <= 3
                      ? "bg-yellow-500"
                      : "bg-green-500"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            {check.met ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuthPage() {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check URL for special auth routes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === "/auth/verify-email") {
      setView("verify-email");
      const token = params.get("token");
      if (token) {
        verifyEmailMutation.mutate(token);
      }
    } else if (path === "/auth/magic-link") {
      setView("verify-magic-link");
      const token = params.get("token");
      if (token) {
        verifyMagicLinkMutation.mutate(token);
      }
    } else if (path === "/auth/reset-password") {
      setView("reset-password");
      const token = params.get("token");
      if (token) {
        setResetToken(token);
      }
    }

    // Check for Google OAuth error
    const error = params.get("error");
    if (error === "google_auth_failed") {
      toast({ title: "Google sign-in failed. Please try again.", variant: "destructive" });
    } else if (error === "google_not_configured") {
      toast({ title: "Google sign-in is not configured yet.", variant: "destructive" });
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Account created! Check your email to verify your address." });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const magicLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send magic link");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Check your email for a sign-in link!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const verifyMagicLinkMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/auth/magic-link/verify?token=${token}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Invalid or expired link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Signed in successfully!" });
      window.history.replaceState({}, "", "/");
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send reset email");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "If an account exists with that email, a password reset link has been sent." });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully! You can now sign in." });
      setView("login");
      window.history.replaceState({}, "", "/auth");
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/auth/verify-email?token=${token}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to verify email");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Email verified successfully!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ email, password, firstName, lastName });
  };

  const handleMagicLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    magicLinkMutation.mutate(email);
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotPasswordMutation.mutate(email);
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resetPasswordMutation.mutate({ token: resetToken, password: newPassword });
  };

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    magicLinkMutation.isPending ||
    forgotPasswordMutation.isPending ||
    resetPasswordMutation.isPending;

  const renderHeader = () => (
    <CardHeader className="text-center space-y-4">
      <div className="flex items-center justify-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calendar className="h-6 w-6 text-primary" />
        </div>
        <span className="text-2xl font-bold bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
          CalendAI
        </span>
      </div>
    </CardHeader>
  );

  // Verify email view
  if (view === "verify-email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          {renderHeader()}
          <CardContent className="text-center space-y-4">
            {verifyEmailMutation.isPending ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Verifying your email...</p>
              </>
            ) : verifyEmailMutation.isSuccess ? (
              <>
                <Check className="h-8 w-8 text-green-500 mx-auto" />
                <p>Your email has been verified!</p>
                <Button onClick={() => { setView("login"); window.history.replaceState({}, "", "/auth"); }}>
                  Continue to sign in
                </Button>
              </>
            ) : (
              <>
                <X className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-destructive">Failed to verify email. The link may have expired.</p>
                <Button variant="outline" onClick={() => { setView("login"); window.history.replaceState({}, "", "/auth"); }}>
                  Back to sign in
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verify magic link view
  if (view === "verify-magic-link") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          {renderHeader()}
          <CardContent className="text-center space-y-4">
            {verifyMagicLinkMutation.isPending ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Signing you in...</p>
              </>
            ) : verifyMagicLinkMutation.isError ? (
              <>
                <X className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-destructive">Invalid or expired link. Please request a new one.</p>
                <Button variant="outline" onClick={() => { setView("magic-link"); window.history.replaceState({}, "", "/auth"); }}>
                  Request new link
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset password view
  if (view === "reset-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          {renderHeader()}
          <CardContent>
            <div className="space-y-2 text-center mb-6">
              <CardTitle>Reset your password</CardTitle>
              <CardDescription>Enter your new password below</CardDescription>
            </div>
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>
              <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset password"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
                onClick={() => { setView("login"); window.history.replaceState({}, "", "/auth"); }}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Magic link view
  if (view === "magic-link") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          {renderHeader()}
          <CardContent>
            <div className="space-y-2 text-center mb-6">
              <CardTitle>Sign in with email link</CardTitle>
              <CardDescription>We'll send you a link to sign in instantly</CardDescription>
            </div>
            {magicLinkMutation.isSuccess ? (
              <div className="text-center space-y-4">
                <Mail className="h-12 w-12 text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Check your email for a sign-in link. It expires in 15 minutes.
                </p>
                <Button variant="outline" onClick={() => magicLinkMutation.reset()} className="w-full">
                  Send another link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magicEmail">Email address</Label>
                  <Input
                    id="magicEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={magicLinkMutation.isPending}>
                  <Mail className="h-4 w-4 mr-2" />
                  {magicLinkMutation.isPending ? "Sending..." : "Send sign-in link"}
                </Button>
              </form>
            )}
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
                onClick={() => setView("login")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forgot password view
  if (view === "forgot-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          {renderHeader()}
          <CardContent>
            <div className="space-y-2 text-center mb-6">
              <CardTitle>Forgot your password?</CardTitle>
              <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
            </div>
            {forgotPasswordMutation.isSuccess ? (
              <div className="text-center space-y-4">
                <Mail className="h-12 w-12 text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">
                  If an account exists with that email, a password reset link has been sent. Check your inbox.
                </p>
                <Button variant="outline" onClick={() => forgotPasswordMutation.reset()} className="w-full">
                  Send another link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgotEmail">Email address</Label>
                  <Input
                    id="forgotEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotPasswordMutation.isPending}>
                  {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            )}
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
                onClick={() => setView("login")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Login / Register view
  const isLogin = view === "login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md">
        {renderHeader()}
        <CardContent>
          <div className="space-y-2 text-center mb-6">
            <CardTitle>{isLogin ? "Welcome back" : "Create an account"}</CardTitle>
            <CardDescription>
              {isLogin
                ? "Sign in to manage your scheduling"
                : "Get started with AI-powered scheduling"}
            </CardDescription>
          </div>

          {/* Google OAuth button */}
          <Button
            variant="outline"
            className="w-full mb-4"
            onClick={() => { window.location.href = "/api/auth/google"; }}
            data-testid="button-google-auth"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          {/* Magic link button */}
          <Button
            variant="outline"
            className="w-full mb-4"
            onClick={() => setView("magic-link")}
            data-testid="button-magic-link"
          >
            <Mail className="h-4 w-4 mr-2" />
            Sign in with email link
          </Button>

          <div className="relative mb-4">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or continue with email
            </span>
          </div>

          <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    data-testid="input-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    data-testid="input-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="input-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {isLogin && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setView("forgot-password")}
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                data-testid="input-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
              {!isLogin && <PasswordStrengthIndicator password={password} />}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              data-testid="button-submit-auth"
            >
              {isPending ? (
                "Loading..."
              ) : isLogin ? (
                "Sign in"
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get started
                </>
              )}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setView("register")}
                  data-testid="link-register"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setView("login")}
                  data-testid="link-login"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
