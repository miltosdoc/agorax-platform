import React from 'react';

interface HtmlContentProps {
  html: string;
  className?: string;
}

export function HtmlContent({ html, className = "" }: HtmlContentProps) {
  return (
    <div 
      className={`prose prose-sm max-w-none ${className}`} 
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  );
}