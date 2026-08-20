import React from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { XCircle } from "lucide-react";
import { ApiError } from "@/lib/queryClient";
import { useTranslation } from "@/hooks/use-translation";

interface ErrorMessageProps {
  error: Error | ApiError | string | null | undefined;
  className?: string;
}

/**
 * A component to display error messages in a user-friendly way,
 * with special handling for validation errors from the API.
 */
export function ErrorMessage({ error, className = "" }: ErrorMessageProps) {
  const { t } = useTranslation();
  if (!error) return null;
  
  let errorMessage = typeof error === "string" ? error : error.message;
  let validationErrors: Record<string, any> | undefined;
  
  // Extract validation errors if this is an ApiError
  if (error instanceof ApiError && error.errors) {
    validationErrors = error.errors;
  }
  
  // Format the field names to be more readable
  function formatFieldName(field: string): string {
    // Special handling for _errors field - it's often used for direct validation errors
    if (field === "_errors") {
      return "";
    }
    
    // Convert camelCase to words with spaces and capitalize
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  return (
    <Alert variant="destructive" className={`mt-4 ${className}`}>
      <XCircle className="h-4 w-4" />
      <AlertTitle className="ml-2">{t('general.error')}</AlertTitle>
      <AlertDescription className="ml-2">
        <p>{errorMessage}</p>
        
        {validationErrors && (
          <div className="mt-2">
            {Object.entries(validationErrors).map(([field, errors]) => {
              // Skip empty error arrays
              if (Array.isArray(errors) && errors.length === 0) return null;
              
              // Handle nested error objects
              if (typeof errors === "object" && errors !== null) {
                return (
                  <div key={field} className="ml-2 mt-1">
                    {field !== "_errors" && (
                      <span className="font-medium">{formatFieldName(field)}: </span>
                    )}
                    {Array.isArray(errors._errors) && errors._errors.map((error: string, i: number) => (
                      <div key={i} className="text-sm ml-2">• {error}</div>
                    ))}
                    
                    {/* Handle nested fields recursively */}
                    {Object.entries(errors)
                      .filter(([nestedField]) => nestedField !== "_errors")
                      .map(([nestedField, nestedErrors]: [string, any]) => (
                        <div key={nestedField} className="ml-4 mt-1">
                          <span className="font-medium">{formatFieldName(nestedField)}: </span>
                          {Array.isArray(nestedErrors._errors) && 
                            nestedErrors._errors.map((error: string, i: number) => (
                              <div key={i} className="text-sm ml-2">• {error}</div>
                            ))
                          }
                        </div>
                      ))
                    }
                  </div>
                );
              }
              
              // For simple arrays of errors
              return (
                <div key={field} className="ml-2 mt-1">
                  {field !== "_errors" && (
                    <span className="font-medium">{formatFieldName(field)}: </span>
                  )}
                  {Array.isArray(errors) ? (
                    errors.map((error, i) => (
                      <div key={i} className="text-sm ml-2">• {error}</div>
                    ))
                  ) : (
                    <div className="text-sm ml-2">• {String(errors)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}