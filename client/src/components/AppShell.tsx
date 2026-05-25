import { Link, useLocation } from "wouter";
import { Sun, Moon, ChevronLeft, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

// ── Custom SVG Logo ────────────────────────────────────────────────────────────
export function BananaSplitLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-label="PickleTab logo" className={`flex-shrink-0 ${className ?? ''}`}
    >
      <defs>
        <linearGradient id="paddleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1"/>
          <stop offset="100%" stopColor="#e9d5ff" stopOpacity="1"/>
        </linearGradient>
      </defs>
      {/* Paddle head — rounded rectangle angled */}
      <ellipse cx="14" cy="13" rx="8" ry="9" fill="url(#paddleGrad)" transform="rotate(-20 14 13)" />
      {/* Paddle holes */}
      <circle cx="11" cy="10" r="1.2" fill="#a855f7" opacity="0.7"/>
      <circle cx="15" cy="9"  r="1.2" fill="#a855f7" opacity="0.7"/>
      <circle cx="18" cy="11" r="1.2" fill="#a855f7" opacity="0.7"/>
      <circle cx="12" cy="14" r="1.2" fill="#a855f7" opacity="0.7"/>
      <circle cx="16" cy="14" r="1.2" fill="#a855f7" opacity="0.7"/>
      <circle cx="13" cy="18" r="1.2" fill="#a855f7" opacity="0.7"/>
      {/* Paddle handle */}
      <rect x="15" y="20" width="4" height="9" rx="2" fill="white" opacity="0.9" transform="rotate(-20 17 24)" />
      {/* Receipt curling off handle */}
      <rect x="19" y="21" width="8" height="9" rx="1.5" fill="white" opacity="0.95" />
      {/* Receipt lines */}
      <line x1="21" y1="24" x2="25" y2="24" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
      <line x1="21" y1="26" x2="25" y2="26" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
      <line x1="21" y1="28" x2="23" y2="28" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
      {/* Receipt zigzag bottom */}
      <path d="M19 30 L20.5 29 L22 30 L23.5 29 L25 30 L26.5 29 L27 30" stroke="white" strokeWidth="0.8" fill="none" opacity="0.8"/>
    </svg>
  );
}

interface AppShellProps {
  title?: string;
  backHref?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ title, backHref, actions, children }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const isHome = location === "/";

  return (
    <div className="min-h-screen mesh-bg flex flex-col">
      {/* ── Glass header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass-strong shadow-sm border-b border-white/60">
        {/* Gradient accent line at top */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, hsl(210 90% 65%), hsl(258 80% 58%), hsl(325 90% 58%))" }} />

        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Back or logo */}
          {backHref ? (
            <Link href={backHref}>
              <Button variant="ghost" size="icon" className="hover:bg-primary/10" data-testid="btn-back">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
          ) : null}

          {/* Logo + wordmark (home) or title (inner pages) */}
          {isHome ? (
            <div className="flex-1 flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl shadow-sm" style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}>
                <BananaSplitLogo size={22} className="text-white" />
              </div>
              <span className="font-bold text-base tracking-tight text-gradient">
                PickleTab
              </span>
            </div>
          ) : (
            <>
              {!backHref && (
                <Link href="/">
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                    <div className="p-1 rounded-lg shadow-sm" style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}>
                      <BananaSplitLogo size={18} className="text-white" />
                    </div>
                  </button>
                </Link>
              )}
              <h1 className="font-bold text-base flex-1 truncate" data-testid="page-title">
                {title}
              </h1>
            </>
          )}

          {/* Actions slot */}
          <div className="flex items-center gap-1 ml-auto">
            {actions}

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              data-testid="btn-theme-toggle"
              className="hover:bg-primary/10 rounded-xl"
            >
              {theme === "dark"
                ? <Sun className="w-4 h-4 text-accent" />
                : <Moon className="w-4 h-4" />}
            </Button>

            {/* User menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full hover:bg-primary/10"
                    data-testid="btn-user-menu"
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}>
                        {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 glass-strong border-border/60">
                  <div className="px-3 py-2.5 border-b border-border/40">
                    <p className="text-sm font-semibold truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {user.isAdmin && (
                    <Link href="/admin">
                      <DropdownMenuItem className="cursor-pointer mt-1" data-testid="btn-admin-link">
                        <Shield className="w-4 h-4 mr-2 text-primary" />
                        Admin Panel
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive cursor-pointer"
                    onClick={logout}
                    data-testid="btn-logout"
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
