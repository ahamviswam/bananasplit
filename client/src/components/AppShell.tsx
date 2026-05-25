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
      aria-label="BananaSplit logo" className="flex-shrink-0"
    >
      <defs>
        <linearGradient id="bananaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f9c74f"/>
          <stop offset="100%" stopColor="#f4a261"/>
        </linearGradient>
        <linearGradient id="splitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa"/>
          <stop offset="100%" stopColor="#ec4899"/>
        </linearGradient>
      </defs>
      <path
        d="M6 22 C6 14, 10 6, 18 5 C24 4.5, 27 8, 26 14 C25 19, 21 23, 15 24 C10 25, 6 24, 6 22Z"
        fill="url(#bananaGrad)"
        stroke="hsl(43,80%,42%)"
        strokeWidth="0.8"
      />
      <circle cx="13" cy="13" r="1.5" fill="#16a34a" opacity="0.75"/>
      <circle cx="18" cy="11" r="1.5" fill="#16a34a" opacity="0.75"/>
      <circle cx="16" cy="17" r="1.5" fill="#16a34a" opacity="0.75"/>
      <path
        d="M16 2 L16 30"
        stroke="url(#splitGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="3 2"
      />
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
                BananaSplit
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
