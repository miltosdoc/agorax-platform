import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">{t('not_found.title')}</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t('not_found.description')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
