import { useState } from "react";
import { BananaSplitLogo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff } from "lucide-react";

// apiRequest throws "<status>: <raw response text>" — pull the JSON {error} out
// of that if present, falling back to the raw message otherwise.
function extractErrorMessage(err: any, fallback: string): string {
  const raw = err?.message as string | undefined;
  if (!raw) return fallback;
  const jsonPart = raw.slice(raw.indexOf(":") + 1).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (parsed?.error) return parsed.error;
  } catch {}
  return raw;
}

export default function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const goToLogin = () => {
    // Drop the resetToken query param and reload into the normal auth flow.
    window.location.href = window.location.origin + window.location.pathname;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, newPassword: password });
      setSuccess(true);
    } catch (err: any) {
      setError(extractErrorMessage(err, "This reset link is invalid or has expired"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
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

      <div
        className="flex items-center gap-2.5 px-6 py-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div
          className="p-1.5 rounded-xl shadow-md"
          style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}
        >
          <BananaSplitLogo size={24} className="text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight text-foreground">PickleTab</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Reset password</h1>
            <p className="text-muted-foreground text-sm">Choose a new password for your account</p>
          </div>

          <div className="glass-strong rounded-2xl p-6 shadow-2xl">
            {success ? (
              <div className="text-center py-2 space-y-4">
                <p className="text-sm text-foreground">Your password has been reset.</p>
                <button
                  onClick={goToLogin}
                  className="text-gradient font-semibold text-sm hover:opacity-80"
                  data-testid="btn-reset-done"
                >
                  Sign in now
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="bg-white/60 border-border/50 focus:border-primary rounded-xl pr-10"
                      data-testid="input-new-password"
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-new-password" className="text-sm font-medium">Confirm new password</Label>
                  <Input
                    id="confirm-new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    className="bg-white/60 border-border/50 focus:border-primary rounded-xl"
                    data-testid="input-confirm-new-password"
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full btn-gradient rounded-xl h-11 font-semibold shadow-lg text-white border-0"
                  disabled={isLoading}
                  data-testid="btn-reset-submit"
                >
                  {isLoading ? "Resetting…" : "Reset password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
