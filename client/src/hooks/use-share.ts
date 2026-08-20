import { useToast } from "@/hooks/use-toast";
import { getTranslationFunction } from "@/hooks/use-translation";
const t = getTranslationFunction();

interface ShareOptions {
  pollId: number;
  title: string;
  description?: string;
}

export function useShare() {
  const { toast } = useToast();

  // Single source of truth for poll URLs
  const getPollUrl = (pollId: number): string => {
    const baseUrl = typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.host}`
      : '';
    return `${baseUrl}/polls/${pollId}`;
  };

  // Strip HTML tags from text (for clean social sharing)
  const stripHtml = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  // Copy link to clipboard (simple, clean URL only - like modern platforms)
  const copyLink = async (pollId: number): Promise<boolean> => {
    const url = getPollUrl(pollId);
    
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: t("Link copied!"),
        description: t("Poll link has been copied to clipboard"),
      });
      return true;
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast({
          title: t("Link copied!"),
          description: t("Poll link has been copied to clipboard"),
        });
        return true;
      } catch (err) {
        document.body.removeChild(textArea);
        toast({
          title: t("Copy failed"),
          description: t("Could not copy link to clipboard"),
          variant: "destructive",
        });
        return false;
      }
    }
  };

  // Share on Twitter/X
  const shareOnTwitter = ({ pollId, title, description }: ShareOptions) => {
    const url = getPollUrl(pollId);
    const cleanText = stripHtml(description || title);
    const text = encodeURIComponent(cleanText);
    const shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}&hashtags=AgoraX`;
    window.open(shareUrl, '_blank', 'width=550,height=420');
  };

  // Share on Facebook
  const shareOnFacebook = ({ pollId }: ShareOptions) => {
    const url = getPollUrl(pollId);
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=550,height=420');
  };

  // Share on LinkedIn
  const shareOnLinkedIn = ({ pollId, title }: ShareOptions) => {
    const url = getPollUrl(pollId);
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=550,height=420');
  };

  // Share on WhatsApp
  const shareOnWhatsApp = ({ pollId, title, description }: ShareOptions) => {
    const url = getPollUrl(pollId);
    const cleanText = stripHtml(description || title);
    const text = `${cleanText} - ${url}`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
  };

  // Share on Telegram
  const shareOnTelegram = ({ pollId, title, description }: ShareOptions) => {
    const url = getPollUrl(pollId);
    const cleanText = stripHtml(description || title);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(cleanText)}`;
    window.open(shareUrl, '_blank');
  };

  // Native Web Share API - DISABLED to show custom dropdown consistently
  const nativeShare = async ({ pollId, title, description }: ShareOptions): Promise<boolean> => {
    // Always return false to use custom dropdown instead of native share
    return false;
  };

  // Check if native share is available - DISABLED to always show custom dropdown
  const canNativeShare = false;

  return {
    getPollUrl,
    copyLink,
    shareOnTwitter,
    shareOnFacebook,
    shareOnLinkedIn,
    shareOnWhatsApp,
    shareOnTelegram,
    nativeShare,
    canNativeShare,
  };
}
