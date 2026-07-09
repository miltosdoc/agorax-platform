import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    FileUp,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Loader2,
    FileCheck,
    AlertTriangle,
    Shield,
    ArrowRight
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "@/hooks/use-translation";
import { readCsrfCookie } from "@/lib/upload-media";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface VerifyGovgrModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Step = "intro" | "upload" | "result";

interface ValidationResult {
    success: boolean;
    message: string;
    rejection_reason?: string;
    signer_name?: string;
}

export function VerifyGovgrModal({ isOpen, onClose }: VerifyGovgrModalProps) {
  const { t } = useTranslation();
    const [step, setStep] = useState<Step>("intro");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

    const { toast } = useToast();

    const { data: challenge } = useQuery<{ code: string }>({
        queryKey: ["/api/user/verify-govgr/challenge"],
        enabled: isOpen,
        staleTime: Infinity,
    });

    const suggestedText = challenge
        ? t('verify.challenge_template', { code: challenge.code })
        : '';

    const copySuggestedText = async () => {
        try {
            await navigator.clipboard.writeText(suggestedText);
            toast({ title: t('verify.challenge_copied') });
        } catch {
            /* clipboard unavailable — the text is selectable on screen */
        }
    };

    const getRejectionLabel = (reason: string) => {
        const reasons: Record<string, string> = {
            "invalid_signature": t('verify.rejection.invalid_signature'),
            "unknown_signer": t('verify.rejection.unknown_signer'),
            "no_signature": t('verify.rejection.no_signature'),
            "duplicate_file": t('verify.rejection.duplicate_file'),
            "invalid_token": t('verify.rejection.invalid_token'),
            "token_not_found": t('verify.rejection.token_not_found'),
            "afm_not_found": t('verify.rejection.afm_not_found'),
            "already_voted": t('verify.rejection.already_voted'),
            "vote_choice_not_found": t('verify.rejection.vote_choice_not_found'),
            "pdf_read_error": t('verify.rejection.pdf_read_error')
        };
        return reasons[reason] || reason;
    };

    // Verify identity mutation
    const verifyMutation = useMutation({
        mutationFn: async () => {
            if (!selectedFile) {
                throw new Error(t('verify.select_pdf'));
            }

            const formData = new FormData();
            formData.append("file", selectedFile);

            if (!readCsrfCookie()) {
                await fetch('/api/csrf', { credentials: 'include' }).catch(() => {});
            }
            const csrf = readCsrfCookie();
            const response = await fetch("/api/user/verify-govgr", {
                method: "POST",
                credentials: "include",
                headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.detail) {
                    return typeof result.detail === 'object' ? result.detail : { success: false, message: result.detail };
                }
                return { success: false, message: result.message || t('verify.failed'), rejection_reason: result.rejection_reason };
            }

            return result as ValidationResult;
        },
        onSuccess: (result) => {
            setValidationResult(result);
            setStep("result");

            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                toast({
                    title: t('verify.success'),
                    description: t('verify.success_description'),
                });
            }
        },
        onError: (error: any) => {
            setValidationResult({
                success: false,
                message: error.message || t('verify.error_generic')
            });
            setStep("result");
        }
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== "application/pdf") {
                toast({
                    title: t('verify.error'),
                    description: t('verify.select_pdf'),
                    variant: "destructive",
                });
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast({
                    title: t('verify.error'),
                    description: t('verify.file_too_large'),
                    variant: "destructive",
                });
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSubmit = () => {
        verifyMutation.mutate();
    };

    const handleClose = () => {
        if (validationResult?.success) {
            // If success, just close
        }
        setStep("intro");
        setSelectedFile(null);
        setValidationResult(null);
        onClose();
    };

    const handleStartOver = () => {
        setStep("intro");
        setSelectedFile(null);
        setValidationResult(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        {t('verify.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('verify.description')}
                    </DialogDescription>
                </DialogHeader>

                {step === "intro" && (
                    <div className="space-y-4">
                        <Alert className="bg-blue-50 border-blue-200">
                            <Shield className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-800">{t('verify.one_time')}</AlertTitle>
                            <AlertDescription className="text-blue-700">
                                {t('verify.one_time_description')}
                            </AlertDescription>
                        </Alert>

                        <Card>
                            <CardContent className="p-4 space-y-4">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                                    {t('verify.step1_title')}
                                </h4>
                                <Button
                                    variant="outline"
                                    className="w-full justify-between"
                                    onClick={() => window.open("https://docs.gov.gr", "_blank")}
                                >
                                    <span>{t('verify.go_to_govgr')}</span>
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                                <p className="text-sm text-muted-foreground">
                                    {t('verify.step1_instruction')}
                                </p>
                                {challenge && (
                                    <div className="rounded-md border bg-muted/50 p-3 space-y-2" data-testid="govgr-challenge-box">
                                        <p className="text-sm select-all font-medium">{suggestedText}</p>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                {t('verify.challenge_why', { code: challenge.code })}
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={copySuggestedText}
                                                data-testid="govgr-challenge-copy"
                                            >
                                                {t('verify.challenge_copy')}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <Separator />

                                <h4 className="font-semibold flex items-center gap-2">
                                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                                    {t('verify.step2_title')}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    {t('verify.step2_instruction')}
                                </p>
                            </CardContent>
                        </Card>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {t('common.cancel')}
                            </Button>
                            <Button onClick={() => setStep("upload")} className="flex items-center gap-2">
                                {t('verify.start')}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === "upload" && (
                    <div className="space-y-4">
                        <Alert className="bg-green-50 border-green-200">
                            <FileCheck className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800">{t('verify.upload_title')}</AlertTitle>
                            <AlertDescription className="text-green-700">
                                {t('verify.upload_description')}
                            </AlertDescription>
                        </Alert>
                        {challenge && (
                            <p className="text-xs text-muted-foreground">
                                {t('verify.challenge_reminder', { code: challenge.code })}
                            </p>
                        )}

                        <Card>
                            <CardContent className="p-6">
                                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                                    <FileUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                    <Label htmlFor="verification-file" className="cursor-pointer">
                                        <div className="space-y-2">
                                            <p className="font-medium">{t('verify.click_select_pdf')}</p>
                                            <p className="text-sm text-muted-foreground">{t('verify.drag_file')}</p>
                                        </div>
                                    </Label>
                                    <Input
                                        id="verification-file"
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                    {selectedFile && (
                                        <div className="mt-4 p-3 bg-muted rounded-md flex items-center gap-2">
                                            <FileCheck className="h-5 w-5 text-green-600" />
                                            <span className="text-sm font-medium">{selectedFile.name}</span>
                                            <span className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <DialogFooter className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep("intro")}>
                                {t('common.back')}
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!selectedFile || verifyMutation.isPending}
                                className="flex items-center gap-2"
                            >
                                {verifyMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('verify.verifying')}
                                    </>
                                ) : (
                                    <>
                                        <Shield className="h-4 w-4" />
                                        {t('verify.verify_button')}
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === "result" && validationResult && (
                    <div className="space-y-4">
                        {validationResult.success ? (
                            <>
                                <div className="text-center py-6">
                                    <CheckCircle2 className="h-16 w-16 mx-auto text-green-600 mb-4" />
                                    <h3 className="text-xl font-semibold text-green-800 mb-2">{t('verify.success_title')}</h3>
                                    <p className="text-muted-foreground">{t('verify.success_account')}</p>
                                </div>
                                <Card className="bg-green-50 border-green-200">
                                    <CardContent className="p-4">
                                        {validationResult.signer_name && (
                                            <div className="flex justify-between">
                                                <span className="text-sm font-medium">{t('verify.govgr_name')}:</span>
                                                <span className="text-sm">{validationResult.signer_name}</span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <>
                                <div className="text-center py-6">
                                    <XCircle className="h-16 w-16 mx-auto text-red-600 mb-4" />
                                    <h3 className="text-xl font-semibold text-red-800 mb-2">{t('verify.failed_title')}</h3>
                                    <p className="text-muted-foreground">{validationResult.message}</p>
                                </div>
                                {validationResult.rejection_reason && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>{t('verify.rejection_reason')}</AlertTitle>
                                        <AlertDescription>
                                            {getRejectionLabel(validationResult.rejection_reason)}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </>
                        )}
                        <DialogFooter className="flex justify-between">
                            {!validationResult.success && (
                                <Button variant="outline" onClick={handleStartOver}>
                                    {t('verify.try_again')}
                                </Button>
                            )}
                            <Button onClick={handleClose}>{t('common.close')}</Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
