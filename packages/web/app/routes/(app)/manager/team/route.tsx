import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type TeamMember = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  positionTitle?: string | null;
  status: string;
};

type MyTeamResponse = {
  team: TeamMember[];
  count: number;
};

export default function ManagerTeamPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Team</h1>
        <p className="text-gray-500">Direct reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Team members" value={String(data.count)} />
        <StatCard
          title="Active"
          value={String(data.team.filter((m) => m.status === "active").length)}
        />
        <StatCard
          title="Inactive"
          value={String(data.team.filter((m) => m.status !== "active").length)}
        />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Team roster</div>
          {data.team.length === 0 ? (
            <div className="text-sm text-gray-600">No direct reports found.</div>
          ) : (
            <div className="space-y-2">
              {data.team.map((m) => (
                <div key={m.id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {m.firstName} {m.lastName}
                      </div>
                      <div className="text-sm text-gray-500">Employee # {m.employeeNumber}</div>
                      {m.positionTitle && (
                        <div className="text-sm text-gray-500">{m.positionTitle}</div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{m.status}</div>
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
