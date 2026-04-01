import { Link, useLocation } from "wouter";
import { Sun, Moon, ChevronLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

// ── Inline SVG Logo ────────────────────────────────────────────────────────────
export function BananaSplitLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="BananaSplit logo"
      className="flex-shrink-0"
    >
      {/* Banana shape */}
      <path
        d="M6 22 C6 14, 10 6, 18 5 C24 4.5, 27 8, 26 14 C25 19, 21 23, 15 24 C10 25, 6 24, 6 22Z"
        fill="hsl(47, 95%, 55%)"
        stroke="hsl(47, 80%, 38%)"
        strokeWidth="1.2"
      />
      {/* Pickleball dots on banana */}
      <circle cx="13" cy="13" r="1.5" fill="hsl(82, 55%, 32%)" opacity="0.7" />
      <circle cx="18" cy="11" r="1.5" fill="hsl(82, 55%, 32%)" opacity="0.7" />
      <circle cx="16" cy="17" r="1.5" fill="hsl(82, 55%, 32%)" opacity="0.7" />
      {/* Split line */}
      <path
        d="M16 2 L16 30"
        stroke="hsl(82, 62%, 32%)"
        strokeWidth="2"
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Back button (only on inner pages) */}
          {backHref && (
            <Link href={backHref}>
              <Button variant="ghost" size="icon" data-testid="btn-back">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
          )}

          {/* Logo + wordmark (home) or title (inner pages) */}
          {isHome ? (
            <div className="flex-1 flex items-center gap-2">
              <BananaSplitLogo size={26} />
              <span className="font-bold text-base tracking-tight">BananaSplit</span>
            </div>
          ) : (
            <>
              {!backHref && (
                <Link href="/">
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                    <BananaSplitLogo size={22} />
                  </button>
                </Link>
              )}
              <h1 className="font-semibold text-base flex-1 truncate" data-testid="page-title">
                {title}
              </h1>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto">
            {actions}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              data-testid="btn-theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {/* User menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" data-testid="btn-user-menu">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
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

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
