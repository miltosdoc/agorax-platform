import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Eye, Ban, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import { useTranslation } from "@/hooks/use-translation";
import type { User, SelectAccountActivity } from "@shared/schema";

interface UserWithActivity extends User {
  activityCount?: number;
}

export default function AdminAccountsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);

  const { data: users, isLoading: usersLoading } = useQuery<UserWithActivity[]>({
    queryKey: ['/api/admin/accounts', { status: statusFilter !== 'all' ? statusFilter : undefined, search: searchQuery || undefined }],
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery<SelectAccountActivity[]>({
    queryKey: [`/api/admin/accounts/${selectedUserId}/activity`],
    enabled: !!selectedUserId && activityModalOpen,
  });

  const banMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("POST", `/api/admin/accounts/${userId}/ban`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/accounts'] });
      toast({
        title: t('general.success'),
        description: t('admin.userBanned'),
      });
    },
    onError: () => {
      toast({
        title: t('general.error'),
        description: t('admin.failedBan'),
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("POST", `/api/admin/accounts/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/accounts'] });
      toast({
        title: t('general.success'),
        description: t('admin.userApproved'),
      });
    },
    onError: () => {
      toast({
        title: t('general.error'),
        description: t('admin.failedApprove'),
        variant: "destructive",
      });
    },
  });

  const handleViewActivity = (userId: number) => {
    setSelectedUserId(userId);
    setActivityModalOpen(true);
  };

  const handleBan = (userId: number) => {
    banMutation.mutate(userId);
  };

  const handleApprove = (userId: number) => {
    approveMutation.mutate(userId);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600" data-testid="badge-status-active">
            {t("Active")}
          </Badge>
        );
      case "flagged":
        return (
          <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-status-flagged">
            {t('admin.flagged')}
          </Badge>
        );
      case "banned":
        return (
          <Badge variant="destructive" data-testid="badge-status-banned">
            {t('admin.banned')}
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600" data-testid="badge-status-active">
            {t("Active")}
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto max-w-6xl px-4 py-6 pb-16 sm:pb-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-page-title">
            {t('admin.manageAccounts')}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('admin.manageAccountsDesc')}
          </p>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-64">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue placeholder={t('admin.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-option-all">{t('poll.all')}</SelectItem>
                <SelectItem value="active" data-testid="select-option-active">{t("Active")}</SelectItem>
                <SelectItem value="flagged" data-testid="select-option-flagged">{t('admin.flagged')}</SelectItem>
                <SelectItem value="banned" data-testid="select-option-banned">{t('admin.banned')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Input
              placeholder={t('admin.searchUsernameEmail')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-users"
            />
          </div>
        </div>

        {usersLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" data-testid={`skeleton-user-${i}`} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="table-head-username">{t('auth.username')}</TableHead>
                  <TableHead data-testid="table-head-email">{t('auth.email')}</TableHead>
                  <TableHead data-testid="table-head-status">{t('admin.accountStatus')}</TableHead>
                  <TableHead data-testid="table-head-reg-ip">{t('admin.registrationIp')}</TableHead>
                  <TableHead data-testid="table-head-last-ip">{t('admin.lastLoginIp')}</TableHead>
                  <TableHead data-testid="table-head-fingerprint">{t('admin.deviceFingerprint')}</TableHead>
                  <TableHead data-testid="table-head-actions">{t('admin.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell data-testid={`text-username-${user.id}`}>{user.username}</TableCell>
                      <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                      <TableCell data-testid={`cell-status-${user.id}`}>
                        {getStatusBadge(user.accountStatus)}
                      </TableCell>
                      <TableCell data-testid={`text-reg-ip-${user.id}`}>
                        {user.registrationIp || t('admin.na')}
                      </TableCell>
                      <TableCell data-testid={`text-last-ip-${user.id}`}>
                        {user.lastLoginIp || t('admin.na')}
                      </TableCell>
                      <TableCell data-testid={`text-fingerprint-${user.id}`}>
                        {user.deviceFingerprint ? user.deviceFingerprint.substring(0, 8) : t('admin.na')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewActivity(user.id)}
                            data-testid={`button-view-activity-${user.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {t('admin.viewActivity')}
                          </Button>
                          {user.accountStatus !== "banned" ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleBan(user.id)}
                              disabled={banMutation.isPending}
                              data-testid={`button-ban-${user.id}`}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              {t('admin.ban')}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleApprove(user.id)}
                              disabled={approveMutation.isPending}
                              className="bg-green-500 hover:bg-green-600"
                              data-testid={`button-approve-${user.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('admin.approve')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8" data-testid="text-no-users">
                      {t('admin.noUsersFound')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <Footer />

      <Dialog open={activityModalOpen} onOpenChange={setActivityModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-activity">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-activity">{t('admin.userActivity')}</DialogTitle>
          </DialogHeader>
          
          {activitiesLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" data-testid={`skeleton-activity-${i}`} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="table-head-action">{t('admin.action')}</TableHead>
                    <TableHead data-testid="table-head-ip">{t('admin.ipAddress')}</TableHead>
                    <TableHead data-testid="table-head-device">{t('admin.deviceFingerprint')}</TableHead>
                    <TableHead data-testid="table-head-timestamp">{t('admin.timestamp')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities && activities.length > 0 ? (
                    activities.map((activity) => (
                      <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                        <TableCell data-testid={`text-action-${activity.id}`}>{activity.action}</TableCell>
                        <TableCell data-testid={`text-ip-${activity.id}`}>
                          {activity.ipAddress || t('admin.na')}
                        </TableCell>
                        <TableCell data-testid={`text-device-${activity.id}`}>
                          {activity.deviceFingerprint ? activity.deviceFingerprint.substring(0, 8) : t('admin.na')}
                        </TableCell>
                        <TableCell data-testid={`text-timestamp-${activity.id}`}>
                          {format(new Date(activity.timestamp), "PPp", { locale: el })}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8" data-testid="text-no-activity">
                        {t('admin.noActivityFound')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
