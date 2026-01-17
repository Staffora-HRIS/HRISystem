import { Link } from "react-router";
import {
  Users,
  CheckCircle,
  Clock,
  Calendar,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  UserCheck,
  ClipboardList,
} from "lucide-react";
import { Card, CardHeader, CardBody, Badge, Button } from "~/components/ui";

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { text: string; variant: string };
}

const quickActions: QuickAction[] = [
  {
    title: "My Team",
    description: "View and manage your direct reports",
    href: "/manager/team",
    icon: Users,
  },
  {
    title: "Pending Approvals",
    description: "Review leave requests and timesheets",
    href: "/manager/approvals",
    icon: CheckCircle,
    badge: { text: "3", variant: "warning" },
  },
  {
    title: "Schedules",
    description: "Manage team schedules and shifts",
    href: "/manager/schedules",
    icon: Calendar,
  },
  {
    title: "Performance",
    description: "Goals, reviews, and feedback",
    href: "/manager/performance",
    icon: TrendingUp,
  },
];

export default function ManagerIndexPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
        <p className="text-gray-600">Manage your team and handle approvals</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Team Size</p>
              <p className="text-2xl font-bold">8</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Approvals</p>
              <p className="text-2xl font-bold">3</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Today</p>
              <p className="text-2xl font-bold">6</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <ClipboardList className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Open Goals</p>
              <p className="text-2xl font-bold">12</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickActions.map((action) => (
          <Link key={action.href} to={action.href}>
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardBody className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 flex-shrink-0">
                  <action.icon className="h-6 w-6 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{action.title}</h3>
                    {action.badge && (
                      <Badge variant={action.badge.variant as any}>
                        {action.badge.text}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{action.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Recent Team Activity</h3>
            <Link to="/manager/team">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div className="divide-y divide-gray-100">
            {[
              {
                name: "Sarah Johnson",
                action: "submitted a leave request",
                time: "2 hours ago",
                icon: Calendar,
              },
              {
                name: "Michael Chen",
                action: "clocked in",
                time: "3 hours ago",
                icon: Clock,
              },
              {
                name: "Emily Davis",
                action: "completed a training course",
                time: "Yesterday",
                icon: TrendingUp,
              },
            ].map((activity, idx) => (
              <div key={idx} className="flex items-center gap-4 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                  <activity.icon className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.name}</span>{" "}
                    {activity.action}
                  </p>
                  <p className="text-xs text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Alerts */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardBody className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-800">Action Required</h4>
            <p className="text-sm text-yellow-700 mt-1">
              You have 3 pending leave requests that need your approval. Please
              review them to avoid delays.
            </p>
            <Link to="/manager/approvals">
              <Button size="sm" variant="outline" className="mt-2">
                Review Now
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
