import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";

export function DeleteAccount() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [deletePolls, setDeletePolls] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      // api.delete attaches the CSRF token (a raw fetch here used to be
      // rejected by the CSRF middleware) and throws ApiError with the
      // server's message on failure.
      const { data } = await api.delete<{ message: string }>(
        `/api/user?deletePolls=${deletePolls}`
      );
      
      // Close the dialog
      setOpen(false);
      
      // Show success toast
      toast({
        title: t('notification.accountDeleted'),
        description: data.message,
        variant: "default",
      });
      
      // Redirect to homepage after account deletion
      setTimeout(() => {
        setLocation("/");
      }, 1500);
      
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast({
        title: t('general.error'),
        description: error.message || t('notification.failedDeleteAccount'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('notification.deleteAccount')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('notification.deleteYourAccount')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('notification.deleteAccountWarning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex items-start space-x-2 py-4">
          <Checkbox
            id="delete-polls"
            checked={deletePolls}
            onCheckedChange={(checked) => setDeletePolls(checked as boolean)}
            className="mt-1"
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="delete-polls"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t('notification.alsoDeletePolls')}
            </label>
            <p className="text-sm text-muted-foreground">
              {t('notification.pollsTransferNote')}
            </p>
          </div>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel>{t('general.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading}
            onClick={(e) => {
              e.preventDefault();
              handleDeleteAccount();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="h-4 w-4 mr-2 border-2 border-current border-t-transparent animate-spin rounded-full"></div>
                {t('notification.deleting')}
              </div>
            ) : (
              t('notification.deleteAccount')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}