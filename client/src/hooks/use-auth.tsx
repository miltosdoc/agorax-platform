import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { RegisterUser, LoginUser, SafeUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";

type AuthContextType = {
  user: SafeUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SafeUser, Error, LoginUser>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SafeUser, Error, RegisterUser>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SafeUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginUser) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (data: SafeUser) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: t('auth.login'),
        description: t('auth.loginSuccess'),
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.login'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (data: SafeUser) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: t('auth.register'),
        description: t('auth.registerSuccess'),
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.register'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: t('auth.logout'),
        description: t('auth.logoutSuccess'),
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.logout'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
