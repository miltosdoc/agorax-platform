import { useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';

interface DynamicHeadProps {
  title?: string;
  description?: string;
  imageUrl?: string;
  url?: string;
}

/**
 * Component to dynamically update meta tags for social sharing
 */
export function DynamicHead({ 
  title,
  description,
  imageUrl = "/logo-share.png",
  url = "https://agorax.org"
}: DynamicHeadProps) {
  const { t } = useTranslation();
  
  const defaultTitle = t('app.title');
  const defaultDescription = t('app.description');
  const effectiveTitle = title || defaultTitle;
  const effectiveDescription = description || defaultDescription;
  
  useEffect(() => {
    // Update Open Graph meta tags
    updateMetaTag('og:title', effectiveTitle);
    updateMetaTag('og:description', effectiveDescription);
    updateMetaTag('og:image', imageUrl);
    updateMetaTag('og:url', url || window.location.href);
    
    // Update Twitter card meta tags
    updateMetaTag('twitter:title', effectiveTitle);
    updateMetaTag('twitter:description', effectiveDescription);
    updateMetaTag('twitter:image', imageUrl);
    
    // Update page title
    document.title = effectiveTitle;
    
    // Cleanup function to reset meta tags when component unmounts
    return () => {
      // Reset to default values
      updateMetaTag('og:title', defaultTitle);
      updateMetaTag('og:description', defaultDescription);
      updateMetaTag('og:image', "/logo-share.png");
      updateMetaTag('og:url', "https://agorax.org");
      updateMetaTag('twitter:title', defaultTitle);
      updateMetaTag('twitter:description', defaultDescription);
      updateMetaTag('twitter:image', "/logo-share.png");
      document.title = defaultTitle;
    };
  }, [effectiveTitle, effectiveDescription, imageUrl, url, defaultTitle, defaultDescription]);
  
  // Helper function to update or create meta tags
  const updateMetaTag = (property: string, content: string) => {
    let meta = document.querySelector(`meta[property="${property}"]`);
    
    if (meta) {
      // Update existing tag
      meta.setAttribute('content', content);
    } else {
      // Create new tag if it doesn't exist
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    }
  };
  
  // This component doesn't render anything
  return null;
}
