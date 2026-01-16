import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Building2,
  Briefcase,
  Network,
  UserPlus,
  TrendingUp,
} from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface HRStats {
  total_employees: number;
  active_employees: number;
  departments: number;
  positions: number;
  pending_hires: number;
}

export default function AdminHrIndexPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin-hr-stats"],
    queryFn: () => api.get<HRStats>("/hr/stats"),
  });

  const quickLinks = [
    {
      title: "Employees",
      description: "Manage employee records and data",
      icon: Users,
      href: "/admin/hr/employees",
      color: "text-blue-600 bg-blue-100",
    },
    {
      title: "Departments",
      description: "Configure organizational departments",
      icon: Building2,
      href: "/admin/hr/departments",
      color: "text-green-600 bg-green-100",
    },
    {
      title: "Positions",
      description: "Manage job positions and grades",
      icon: Briefcase,
      href: "/admin/hr/positions",
      color: "text-purple-600 bg-purple-100",
    },
    {
      title: "Organization Chart",
      description: "View company structure",
      icon: Network,
      href: "/admin/hr/org-chart",
      color: "text-orange-600 bg-orange-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Human Resources</h1>
          <p className="text-gray-600">Manage employees and organization structure</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/hr/employees/new">
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={stats?.total_employees || 0}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Active"
          value={stats?.active_employees || 0}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Departments"
          value={stats?.departments || 0}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          title="Positions"
          value={stats?.positions || 0}
          icon={<Briefcase className="h-5 w-5" />}
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} to={link.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardBody className="flex flex-col items-center text-center py-6">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${link.color} mb-4`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{link.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {link.description}
                  </p>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Recent Activity</h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500 text-center py-8">
            Recent HR activity will appear here.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
