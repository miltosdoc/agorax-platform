import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import { Users, MessageSquare, Vote, BarChart3, TrendingUp, Clock, Calendar, Activity, UserPlus, Percent } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { format } from "date-fns";
import { el } from "date-fns/locale";

interface AnalyticsOverview {
  totalUsers: number;
  totalPolls: number;
  totalVotes: number;
  totalComments: number;
  activePolls: number;
  newUsers7Days: number;
  newUsers30Days: number;
  activeUsers7Days: number;
  activeUsers30Days: number;
  participationRate: number;
  avgVotesPerPoll: number;
  avgCommentsPerPoll: number;
  popularCategories: { category: string; count: number }[];
}

interface PollPopularity {
  id: number;
  title: string;
  votes: number;
  comments: number;
  category: string;
  createdAt: string;
}

interface ActivityTrend {
  date: string;
  polls: number;
  votes: number;
  comments: number;
}

interface UsagePattern {
  hourlyActivity: { hour: number; activity: number }[];
  dailyActivity: { day: string; activity: number }[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
    retry: false,
  });

  const { data: pollPopularity, isLoading: popularityLoading } = useQuery<PollPopularity[]>({
    queryKey: ["/api/analytics/poll-popularity"],
    retry: false,
  });

  const { data: activityTrends, isLoading: trendsLoading } = useQuery<ActivityTrend[]>({
    queryKey: ["/api/analytics/activity-trends"],
    retry: false,
  });

  const { data: usagePatterns, isLoading: patternsLoading } = useQuery<UsagePattern>({
    queryKey: ["/api/analytics/usage-patterns"],
    retry: false,
  });

  if (overviewLoading || popularityLoading || trendsLoading || patternsLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="container mx-auto max-w-6xl p-6 pb-16 sm:pb-6 flex-grow">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-80 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto max-w-6xl p-6 pb-16 sm:pb-6 flex-grow">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t('header.analyticsDashboard')}</h1>
        <p className="text-muted-foreground">{t('analytics.adminRequiredDesc')}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.totalUsers')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalUsers.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.registeredMembers')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.totalPolls')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalPolls.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">
              {overview?.activePolls} {t('analytics.currentlyActive')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.totalVotes')}</CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalVotes.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.communityParticipation')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.totalComments')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalComments.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.discussionEngagement')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement & Growth Metrics - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.newUsers7Days')}</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.newUsers7Days.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.newSignupsWeek')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.newUsers30Days')}</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.newUsers30Days.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.newSignupsMonth')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.activeUsers7Days')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.activeUsers7Days.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.usersVotedCommentedWeek')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.activeUsers30Days')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.activeUsers30Days.toLocaleString('el-GR')}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.usersVotedCommentedMonth')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Metrics - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.participationRate')}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.participationRate}%</div>
            <p className="text-xs text-muted-foreground">{t('analytics.pctUsersVoted')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.avgVotesPerPoll')}</CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.avgVotesPerPoll}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.avgParticipationPerPoll')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('notification.avgCommentsPerPoll')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.avgCommentsPerPoll}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.avgDiscussionPerPoll')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Activity Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              {t('analytics.activityTrends30')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={activityTrends?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => format(new Date(value), "d MMM", { locale: el })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), "d MMMM yyyy", { locale: el })}
                  formatter={(value, name) => [value, t(name as string)]}
                />
                <Area type="monotone" dataKey="votes" stackId="1" stroke="#8884d8" fill="#8884d8" name="votes" />
                <Area type="monotone" dataKey="comments" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="comments" />
                <Area type="monotone" dataKey="polls" stackId="1" stroke="#ffc658" fill="#ffc658" name="polls" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Popular Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              {t('analytics.popularCategories')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={overview?.popularCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, percent }: any) => `${category} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {overview?.popularCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hourly Activity Pattern */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              {t('analytics.hourlyPattern')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usagePatterns?.hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tickFormatter={(value) => `${value}:00`} />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => `${value}:00 - ${value + 1}:00`}
                  formatter={(value) => [value, t('notification.activity')]}
                />
                <Bar dataKey="activity" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Activity Pattern */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              {t('analytics.dailyPattern')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usagePatterns?.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => [value, t('notification.activity')]} />
                <Bar dataKey="activity" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Most Popular Polls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            {t('analytics.mostPopularPolls')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pollPopularity?.map((poll, index) => (
              <div key={poll.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className="bg-primary text-white text-xs font-bold px-2 py-1 rounded mr-2">
                      #{index + 1}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {poll.category}
                    </span>
                  </div>
                  <h3 className="font-medium text-foreground mb-1">{poll.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('analytics.createdOn')} {format(new Date(poll.createdAt), "d MMMM yyyy", { locale: el })}
                  </p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Vote className="h-4 w-4 mr-1" />
                    {poll.votes} {t('analytics.votes')}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    {poll.comments} {t('analytics.comments_')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
  );
}