import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, X, Send, Star, Bug, Lightbulb, Heart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type FeedbackType = "bug" | "feature" | "general" | "praise";

const TYPES: { value: FeedbackType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "bug",     label: "Bug",     icon: Bug,        color: "text-red-500"    },
  { value: "feature", label: "Feature", icon: Lightbulb,  color: "text-yellow-500" },
  { value: "general", label: "General", icon: MessageCircle, color: "text-blue-500" },
  { value: "praise",  label: "Praise",  icon: Heart,      color: "text-pink-500"   },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [hoveredStar, setHoveredStar] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();

  const submitMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/feedback", data),
    onSuccess: () => {
      toast({
        title: "Thanks for your feedback!",
        description: "We read every message and use it to improve PickleTab.",
      });
      setOpen(false);
      setMessage(""); setRating(0); setType("general"); setEmail("");
    },
    onError: () => toast({ title: "Couldn't send feedback", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    submitMutation.mutate({
      type,
      rating: rating || null,
      message: message.trim(),
      email: email.trim() || user?.email || null,
      userId: user?.id || null,
    });
  };

  return (
    <>
      {/* Floating trigger button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          {/* Pulse ring */}
          {!open && (
            <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }} />
          )}
          <Button
            onClick={() => setOpen(v => !v)}
            className={cn(
              "relative w-14 h-14 rounded-full shadow-2xl transition-all duration-300",
              "hover:opacity-90 border-0 text-white",
              "flex items-center justify-center",
              open && "rotate-90"
            )}
            data-testid="btn-feedback-open"
            aria-label="Give feedback"
            style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}
          >
            {open
              ? <X className="w-5 h-5 text-white" />
              : <MessageSquarePlus className="w-5 h-5 text-white" />
            }
          </Button>
        </div>
      </div>

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 glass-strong rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3" style={{ background: "linear-gradient(135deg, hsl(258 80% 58%), hsl(325 90% 58%))" }}>
            <h3 className="text-white font-bold text-sm">Share your feedback</h3>
            <p className="text-white/70 text-xs mt-0.5">Help us make PickleTab better</p>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Type selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-xs font-medium transition-all",
                      type === t.value
                        ? "bg-primary/15 border border-primary/40 text-primary"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    )}
                    data-testid={`btn-feedback-type-${t.value}`}
                  >
                    <Icon className={cn("w-4 h-4", type === t.value ? "text-primary" : t.color)} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Star rating */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Overall rating <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(rating === star ? 0 : star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="transition-transform hover:scale-110"
                    data-testid={`btn-star-${star}`}
                  >
                    <Star
                      className={cn(
                        "w-5 h-5 transition-colors",
                        star <= (hoveredStar || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <Label htmlFor="fb-message" className="text-xs text-muted-foreground mb-1.5 block">
                Your message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="fb-message"
                placeholder="Tell us what you think, what's broken, or what you'd love to see..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                required
                className="resize-none text-sm rounded-xl bg-background/60 border-border/50 focus:border-primary"
                data-testid="input-feedback-message"
              />
            </div>

            {/* Email (if not logged in) */}
            {!user && (
              <div>
                <Label htmlFor="fb-email" className="text-xs text-muted-foreground mb-1.5 block">
                  Email <span className="text-muted-foreground/60">(optional, for follow-up)</span>
                </Label>
                <Input
                  id="fb-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="text-sm rounded-xl bg-background/60 border-border/50 h-8"
                  data-testid="input-feedback-email"
                />
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={!message.trim() || submitMutation.isPending}
              className="w-full btn-gradient rounded-xl h-9 text-sm font-semibold"
              data-testid="btn-feedback-submit"
            >
              {submitMutation.isPending ? (
                "Sending…"
              ) : (
                <><Send className="w-3.5 h-3.5 mr-1.5" /> Send Feedback</>
              )}
            </Button>

            {user && (
              <p className="text-center text-xs text-muted-foreground">
                Sending as <span className="font-medium">{user.name}</span>
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}
