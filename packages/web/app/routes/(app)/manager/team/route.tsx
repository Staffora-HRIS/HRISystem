export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Mail,
  Phone,
  MoreHorizontal,
  Search,
  UserCheck,
  Calendar,
  User,
  Clock,
  CalendarDays,
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

function TeamMemberMenu({
  memberId,
  memberName,
  navigate,
  onSchedule,
}: {
  memberId: string;
  memberName: string;
  navigate: (path: string) => void;
  onSchedule: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, closeMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`More actions for ${memberName}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          role="menu"
          aria-label={`Actions for ${memberName}`}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => {
              navigate(`/admin/hr/employees/${memberId}`);
              closeMenu();
            }}
          >
            <User className="h-4 w-4" />
            View Full Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => {
              navigate(`/admin/time/timesheets?employeeId=${memberId}`);
              closeMenu();
            }}
          >
            <Clock className="h-4 w-4" />
            View Attendance
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => {
              navigate(`/admin/absence?employeeId=${memberId}`);
              closeMenu();
            }}
          >
            <CalendarDays className="h-4 w-4" />
            View Absence
          </button>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => {
              onSchedule();
              closeMenu();
            }}
          >
            <Calendar className="h-4 w-4" />
            Schedule 1:1
          </button>
        </div>
      )}
    </div>
  );
}

export default function ManagerTeamPage() {
  const [search, setSearch] = useState("");
  const [schedulingMember, setSchedulingMember] = useState<TeamMember | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  const scheduleMutation = useMutation({
    mutationFn: async (data: { employeeId: string; date: string; time: string; notes?: string }) => {
      // Meeting scheduling will be integrated when the calendar module is available.
      // For now, simulate success for the UX flow.
      return { success: true, employeeId: data.employeeId };
    },
    onSuccess: () => {
      toast.success(`1:1 meeting request noted for ${schedulingMember?.firstName} ${schedulingMember?.lastName}`);
      setSchedulingMember(null);
      setMeetingDate("");
      setMeetingTime("");
      setMeetingNotes("");
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to schedule meeting";
      toast.error(message);
    },
  });

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Team</h1>
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Team</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your direct reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Team Size</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.count}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <UserCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Calendar className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">On Leave</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{onLeaveCount}</p>
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
          <h3 className="font-semibold text-gray-900 dark:text-white">Team Roster</h3>
        </CardHeader>
        <CardBody className="p-0">
          {filteredTeam.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {search ? "No team members match your search" : "No direct reports found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredTeam.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <Avatar
                    src={member.photoUrl}
                    name={`${member.firstName} ${member.lastName}`}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {member.firstName} {member.lastName}
                      </h4>
                      <Badge variant={STATUS_COLORS[member.status] as any}>
                        {STATUS_LABELS[member.status] || member.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
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
                    <TeamMemberMenu
                      memberId={member.id}
                      memberName={`${member.firstName} ${member.lastName}`}
                      navigate={navigate}
                      onSchedule={() => setSchedulingMember(member)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {schedulingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold text-gray-900 dark:text-white">Schedule 1:1 Meeting</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label htmlFor="meeting-employee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee
                </label>
                <Input
                  id="meeting-employee"
                  value={`${schedulingMember.firstName} ${schedulingMember.lastName}`}
                  disabled
                />
              </div>
              <div>
                <label htmlFor="meeting-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  id="meeting-date"
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="meeting-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Time
                </label>
                <input
                  id="meeting-time"
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="meeting-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="meeting-notes"
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  rows={3}
                  placeholder="Agenda or topics to discuss..."
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSchedulingMember(null);
                    setMeetingDate("");
                    setMeetingTime("");
                    setMeetingNotes("");
                  }}
                  disabled={scheduleMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!meetingDate || !meetingTime) {
                      toast.error("Please select a date and time");
                      return;
                    }
                    scheduleMutation.mutate({
                      employeeId: schedulingMember.id,
                      date: meetingDate,
                      time: meetingTime,
                      notes: meetingNotes.trim() || undefined,
                    });
                  }}
                  disabled={!meetingDate || !meetingTime || scheduleMutation.isPending}
                >
                  {scheduleMutation.isPending ? "Scheduling..." : "Schedule Meeting"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
