/**
 * GDPR Art. 9(2)(a) consent interstitial.
 *
 * Rendered as a non-dismissible modal whenever the signed-in member's
 * `requiresConsent` flag is true. Posts to /api/user/consent/accept which
 * records the consent row and clears the flag.
 *
 * Mounted in AppShell so every authenticated page surfaces it. The
 * `requireConsent` server middleware blocks Art. 9 routes for the same
 * users — this UI is the user-facing path to clear that gate.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CONSENT_TEXT, CURRENT_CONSENT_VERSION } from "@shared/consent";

export function ConsentInterstitial() {
  const { user, logoutMutation } = useAuth();
  const { locale, t } = useTranslation();
  const { toast } = useToast();
  const [showFullText, setShowFullText] = useState(false);

  const consentLocale: "el" | "en" = locale === "en" ? "en" : "el";

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/consent/accept", {
        version: CURRENT_CONSENT_VERSION,
        locale: consentLocale,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: t("auth.register") ?? "Consent recorded",
        variant: "default",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!user || !user.requiresConsent) return null;

  return (
    <Dialog open={true}>
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {consentLocale === "el"
              ? "Συγκατάθεση για επεξεργασία δεδομένων ειδικής κατηγορίας"
              : "Consent to processing of special-category data"}
          </DialogTitle>
          <DialogDescription>
            {consentLocale === "el"
              ? `Έκδοση ${CURRENT_CONSENT_VERSION}. Απαιτείται για να συνεχίσετε.`
              : `Version ${CURRENT_CONSENT_VERSION}. Required to continue.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded border bg-muted/30 p-4 text-sm whitespace-pre-line">
          {showFullText
            ? CONSENT_TEXT[consentLocale]
            : CONSENT_TEXT[consentLocale].split("\n\n").slice(0, 3).join("\n\n")}
        </div>
        {!showFullText && (
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => setShowFullText(true)}
          >
            {consentLocale === "el" ? "Διαβάστε όλο το κείμενο" : "Read full text"}
          </Button>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {consentLocale === "el" ? "Αποσύνδεση" : "Sign out"}
          </Button>
          <Button
            type="button"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            data-testid="button-consent-accept"
          >
            {acceptMutation.isPending
              ? consentLocale === "el"
                ? "Καταχώρηση..."
                : "Recording..."
              : consentLocale === "el"
                ? "Συμφωνώ"
                : "I agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
