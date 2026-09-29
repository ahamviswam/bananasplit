import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [venmoUsername, setVenmoUsername] = useState(user?.venmoUsername ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!name.trim()) { setError("Name cannot be empty"); return; }
    setIsSaving(true);
    try {
      await updateProfile({ name: name.trim(), venmoUsername: venmoUsername.trim() || null });
      toast({ title: "Profile saved" });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell title="My Profile" backHref="/">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-sm font-medium">Your name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={e => setName(e.target.value)}
              data-testid="input-profile-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="text-sm font-medium">Email</Label>
            <Input id="profile-email" value={user?.email ?? ""} disabled className="opacity-60" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-venmo" className="text-sm font-medium">Venmo username</Label>
            <Input
              id="profile-venmo"
              placeholder="your-venmo-handle (no @)"
              value={venmoUsername}
              onChange={e => setVenmoUsername(e.target.value.replace(/^@/, ""))}
              data-testid="input-profile-venmo"
            />
            <p className="text-xs text-muted-foreground">
              Saved to your account for future use in group Settle Up.
            </p>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <Button onClick={handleSave} disabled={isSaving} className="w-full" data-testid="btn-save-profile">
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
