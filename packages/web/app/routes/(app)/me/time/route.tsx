import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: { id: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string };
};

type TimeEvent = {
  id: string;
  employeeId: string;
  eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  eventTime: string;
  notes?: string | null;
};

type TimeEventsResponse = {
  items: TimeEvent[];
  cursor: string | null;
  hasMore: boolean;
};

function getAllowedActions(lastEventType: TimeEvent["eventType"] | null) {
  if (!lastEventType) return ["clock_in"] as const;
  const map: Record<TimeEvent["eventType"], readonly TimeEvent["eventType"][]> = {
    clock_in: ["break_start", "clock_out"],
    break_start: ["break_end"],
    break_end: ["break_start", "clock_out"],
    clock_out: ["clock_in"],
  };
  return map[lastEventType] ?? ([] as const);
}

export default function MyTimePage() {
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  const employeeId = me?.employee?.id ?? null;

  const {
    data: events,
    isLoading: eventsLoading,
    error: eventsError,
  } = useQuery({
    queryKey: ["time", "events", { employeeId }],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<TimeEventsResponse>("/time/events", {
        params: {
          employeeId: employeeId as string,
          limit: 20,
        },
      }),
  });

  const lastEventType = events?.items?.[0]?.eventType ?? null;
  const allowedActions = useMemo(() => getAllowedActions(lastEventType), [lastEventType]);

  const recordEventMutation = useMutation({
    mutationFn: async (eventType: TimeEvent["eventType"]) => {
      if (!employeeId) throw new Error("Employee profile is required to record time.");
      return api.post<TimeEvent>("/time/events", {
        employeeId,
        eventType,
        eventTime: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["time", "events"] });
    },
  });

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!me) {
    const message =
      meError instanceof ApiError
        ? meError.message
        : meError instanceof Error
          ? meError.message
          : "Unable to load your profile.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Time</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Time</h1>
        <p className="text-gray-500">No employee profile is linked to your account.</p>
      </div>
    );
  }

  const errorMessage =
    (eventsError instanceof ApiError && eventsError.message) ||
    (eventsError instanceof Error && eventsError.message) ||
    null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Time</h1>
        <p className="text-gray-500">
          {me.employee.firstName} {me.employee.lastName}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Last Event" value={lastEventType ? lastEventType.replace("_", " ") : "None"} />
        <StatCard title="Events (last 20)" value={String(events?.items?.length ?? 0)} />
        <StatCard title="Tenant" value={me.tenant.name} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Actions</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              disabled={!allowedActions.includes("clock_in")}
              loading={recordEventMutation.isPending}
              onClick={() => recordEventMutation.mutate("clock_in")}
            >
              Clock In
            </Button>
            <Button
              variant="outline"
              disabled={!allowedActions.includes("break_start")}
              loading={recordEventMutation.isPending}
              onClick={() => recordEventMutation.mutate("break_start")}
            >
              Start Break
            </Button>
            <Button
              variant="outline"
              disabled={!allowedActions.includes("break_end")}
              loading={recordEventMutation.isPending}
              onClick={() => recordEventMutation.mutate("break_end")}
            >
              End Break
            </Button>
            <Button
              variant="danger"
              disabled={!allowedActions.includes("clock_out")}
              loading={recordEventMutation.isPending}
              onClick={() => recordEventMutation.mutate("clock_out")}
            >
              Clock Out
            </Button>
          </div>

          {recordEventMutation.error && (
            <div className="text-sm text-error-600">
              {recordEventMutation.error instanceof Error
                ? recordEventMutation.error.message
                : "Failed to record time event."}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Recent Events</div>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : errorMessage ? (
            <div className="text-sm text-gray-600">{errorMessage}</div>
          ) : !events || events.items.length === 0 ? (
            <div className="text-sm text-gray-600">No time events found.</div>
          ) : (
            <div className="space-y-2">
              {events.items.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border border-gray-200 p-3">
                  <div>
                    <div className="font-medium">{e.eventType.replace("_", " ")}</div>
                    <div className="text-sm text-gray-500">{new Date(e.eventTime).toLocaleString()}</div>
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
