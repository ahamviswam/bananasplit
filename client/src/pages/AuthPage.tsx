import { useState } from "react";
import { BananaSplitLogo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, Eye, EyeOff, Pickaxe, DollarSign, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const resetForm = () => {
    setEmail(""); setName(""); setPassword(""); setConfirmPassword(""); setError("");
  };

  const switchMode = (m: Mode) => { setMode(m); resetForm(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (!name.trim()) { setError("Please enter your name"); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
      if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    }
    setIsLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), name.trim(), password);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: "🏓", label: "Track sessions" },
    { icon: "💰", label: "Split fees" },
    { icon: "📊", label: "Settle up" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Hero background ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-gradient-hero -z-10" />
      <div
        className="fixed inset-0 -z-10 opacity-30"
        style={{
          backgroundImage: `radial-gradient(ellipse at 25% 40%, hsl(88 65% 38% / 0.5) 0%, transparent 55%),
                            radial-gradient(ellipse at 75% 20%, hsl(43 96% 56% / 0.4) 0%, transparent 50%),
                            radial-gradient(ellipse at 55% 75%, hsl(196 75% 45% / 0.35) 0%, transparent 55%)`
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-gradient-primary shadow-md">
            <BananaSplitLogo size={24} />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">BananaSplit</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      {/* ── Auth card ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Tagline */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              {mode === "login" ? "Welcome back!" : "Join BananaSplit"}
            </h1>
            <p className="text-white/60 text-sm">
              {mode === "login"
                ? "Sign in to access your pickleball groups"
                : "Start splitting court fees with your crew"}
            </p>
          </div>

          {/* Glass card */}
          <div className="glass-strong rounded-2xl p-6 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name (register only) */}
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium">Your name</Label>
                  <Input
                    id="name"
                    placeholder="Priya"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="bg-background/60 border-border/50 focus:border-primary rounded-xl"
                    data-testid="input-name"
                  />
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="bg-background/60 border-border/50 focus:border-primary rounded-xl"
                  data-testid="input-email"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "register" ? "Min. 6 characters" : "Your password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="bg-background/60 border-border/50 focus:border-primary rounded-xl pr-10"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    className="bg-background/60 border-border/50 focus:border-primary rounded-xl"
                    data-testid="input-confirm-password"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full btn-gradient rounded-xl h-10 font-semibold shadow-md"
                disabled={isLoading}
                data-testid="btn-auth-submit"
              >
                {isLoading
                  ? (mode === "login" ? "Signing in…" : "Creating account…")
                  : (mode === "login" ? "Sign in" : "Create account")}
              </Button>
            </form>

            {/* Switch mode */}
            <div className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    onClick={() => switchMode("register")}
                    className="text-primary font-semibold hover:underline"
                    data-testid="btn-switch-to-register"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => switchMode("login")}
                    className="text-primary font-semibold hover:underline"
                    data-testid="btn-switch-to-login"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Feature pills */}
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {features.map(f => (
              <div key={f.label} className="glass rounded-xl px-3 py-3 text-white/80">
                <p className="text-xl mb-1">{f.icon}</p>
                <p className="text-xs font-medium">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
