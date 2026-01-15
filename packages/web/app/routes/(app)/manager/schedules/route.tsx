import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type Schedule = {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  status: string;
  isTemplate: boolean;
};

type SchedulesResponse = {
  items: Schedule[];
  cursor: string | null;
  hasMore: boolean;
};

export default function ManagerSchedulesPage() {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["time", "schedules"],
    queryFn: () => api.get<SchedulesResponse>("/time/schedules", { params: { limit: 20 } }),
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
          : "Unable to load schedules.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const templates = data.items.filter((s) => s.isTemplate).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Schedules</h1>
        <p className="text-gray-500">Organization schedules and templates</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total" value={String(data.items.length)} />
        <StatCard title="Templates" value={String(templates)} />
        <StatCard title="Has more" value={data.hasMore ? "Yes" : "No"} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Latest schedules</div>
          {data.items.length === 0 ? (
            <div className="text-sm text-gray-600">No schedules found.</div>
          ) : (
            <div className="space-y-2">
              {data.items.map((s) => (
                <div key={s.id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium">{s.name}</div>
                      {s.description && <div className="text-sm text-gray-500">{s.description}</div>}
                      <div className="text-sm text-gray-500">
                        {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 shrink-0">{s.status}</div>
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
