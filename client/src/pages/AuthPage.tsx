import { useState } from "react";
import { BananaSplitLogo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, Eye, EyeOff } from "lucide-react";

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
    <div className="min-h-screen flex flex-col relative overflow-hidden">

      {/* ── Full-bleed mesh gradient background ─────────────────────────── */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse at 15% 20%, hsl(210 90% 65% / 0.60) 0%, transparent 50%),
            radial-gradient(ellipse at 78% 12%, hsl(258 85% 68% / 0.55) 0%, transparent 50%),
            radial-gradient(ellipse at 88% 78%, hsl(325 90% 62% / 0.60) 0%, transparent 50%),
            radial-gradient(ellipse at 20% 85%, hsl(280 80% 65% / 0.40) 0%, transparent 45%),
            hsl(240 20% 98%)
          `
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="p-1.5 rounded-xl shadow-md"
            style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}
          >
            <BananaSplitLogo size={24} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">PickleTab</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-xl text-foreground/60 hover:text-foreground hover:bg-white/40"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      {/* ── Auth card ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">

          {/* Tagline */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {mode === "login" ? "Welcome back!" : "Join PickleTab"}
            </h1>
            <p className="text-muted-foreground text-sm">
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
                    className="bg-white/60 border-border/50 focus:border-primary rounded-xl"
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
                  className="bg-white/60 border-border/50 focus:border-primary rounded-xl"
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
                    className="bg-white/60 border-border/50 focus:border-primary rounded-xl pr-10"
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
                    className="bg-white/60 border-border/50 focus:border-primary rounded-xl"
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
                className="w-full btn-gradient rounded-xl h-11 font-semibold shadow-lg text-white border-0"
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
                    className="text-gradient font-semibold hover:opacity-80"
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
                    className="text-gradient font-semibold hover:opacity-80"
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
              <div key={f.label} className="glass rounded-xl px-3 py-3">
                <p className="text-xl mb-1">{f.icon}</p>
                <p className="text-xs font-medium text-foreground/70">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
