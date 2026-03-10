import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Mail,
  Phone,
  MoreHorizontal,
  Search,
  UserCheck,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Avatar,
  Input,
  Spinner,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

type TeamMember = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  workPhone?: string | null;
  positionTitle?: string | null;
  photoUrl?: string | null;
  status: string;
  hireDate?: string | null;
};

type MyTeamResponse = {
  team: TeamMember[];
  count: number;
};

const STATUS_COLORS: Record<string, string> = {
  active: "success",
  on_leave: "warning",
  terminated: "error",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

export default function ManagerTeamPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portal", "my-team"],
    queryFn: () => api.get<MyTeamResponse>("/portal/my-team"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load your team.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Team</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const activeCount = data.team.filter((m) => m.status === "active").length;
  const onLeaveCount = data.team.filter((m) => m.status === "on_leave").length;

  const filteredTeam = data.team.filter((m) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      m.firstName.toLowerCase().includes(searchLower) ||
      m.lastName.toLowerCase().includes(searchLower) ||
      m.employeeNumber.toLowerCase().includes(searchLower) ||
      m.positionTitle?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
        <p className="text-gray-600">Manage your direct reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Team Size</p>
              <p className="text-2xl font-bold">{data.count}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Calendar className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">On Leave</p>
              <p className="text-2xl font-bold">{onLeaveCount}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search team members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Team List */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Team Roster</h3>
        </CardHeader>
        <CardBody className="p-0">
          {filteredTeam.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">
                {search ? "No team members match your search" : "No direct reports found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTeam.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                >
                  <Avatar
                    src={member.photoUrl}
                    name={`${member.firstName} ${member.lastName}`}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">
                        {member.firstName} {member.lastName}
                      </h4>
                      <Badge variant={STATUS_COLORS[member.status] as any}>
                        {STATUS_LABELS[member.status] || member.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {member.positionTitle || "No position"} • {member.employeeNumber}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      {member.email && (
                        <a
                          href={`mailto:${member.email}`}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                        >
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </a>
                      )}
                      {member.workPhone && (
                        <a
                          href={`tel:${member.workPhone}`}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                        >
                          <Phone className="h-3 w-3" />
                          {member.workPhone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/hr/employees/${member.id}`)}
                    >
                      View Profile
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toast.info("More options coming soon")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
