/**
 * EmployeeQuickView Component
 *
 * A quick preview modal/panel for employee details
 * Can be used as a modal or inline panel
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  X,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  MapPin,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  Avatar,
  Skeleton,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { cn } from "~/lib/utils";

interface EmployeeDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  workPhone: string | null;
  mobilePhone: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  locationName: string | null;
  managerId: string | null;
  managerName: string | null;
  hireDate: string;
  status: string;
  photoUrl: string | null;
}

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface EmployeeQuickViewProps {
  employeeId: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  variant?: "modal" | "panel" | "card";
  className?: string;
}

export function EmployeeQuickView({
  employeeId,
  onClose,
  showCloseButton = true,
  variant: _variant = "card",
  className,
}: EmployeeQuickViewProps) {
  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["employee-quick-view", employeeId],
    queryFn: () => api.get<EmployeeDetail>(`/hr/employees/${employeeId}`),
    enabled: !!employeeId,
  });

  if (isLoading) {
    return (
      <Card className={cn("w-full max-w-md", className)}>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton width={64} height={64} rounded="full" />
            <div className="flex-1 space-y-2">
              <Skeleton height={20} width="60%" />
              <Skeleton height={16} width="40%" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error || !employee) {
    return (
      <Card className={cn("w-full max-w-md", className)}>
        <CardBody className="text-center py-8">
          <User className="h-12 w-12 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">Employee not found</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardBody className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              src={employee.photoUrl}
              name={`${employee.firstName} ${employee.lastName}`}
              size="xl"
            />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {employee.firstName} {employee.lastName}
              </h3>
              <p className="text-sm text-gray-500">{employee.employeeNumber}</p>
              <Badge
                variant={STATUS_COLORS[employee.status] as any}
                className="mt-1"
              >
                {STATUS_LABELS[employee.status] || employee.status}
              </Badge>
            </div>
          </div>
          {showCloseButton && onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="Close quick view"
              title="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-gray-400" />
            <a
              href={`mailto:${employee.email}`}
              className="text-blue-600 hover:underline"
            >
              {employee.email}
            </a>
          </div>
          {employee.workPhone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <a
                href={`tel:${employee.workPhone}`}
                className="text-gray-600 hover:text-gray-900"
              >
                {employee.workPhone}
              </a>
            </div>
          )}
          {employee.mobilePhone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <a
                href={`tel:${employee.mobilePhone}`}
                className="text-gray-600 hover:text-gray-900"
              >
                {employee.mobilePhone} (Mobile)
              </a>
            </div>
          )}
        </div>

        {/* Position Info */}
        <div className="space-y-2 border-t border-gray-100 pt-4">
          {employee.positionTitle && (
            <div className="flex items-center gap-3 text-sm">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{employee.positionTitle}</span>
            </div>
          )}
          {employee.departmentName && (
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{employee.departmentName}</span>
            </div>
          )}
          {employee.locationName && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{employee.locationName}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="text-gray-700">
              Hired {formatDate(employee.hireDate)}
            </span>
          </div>
        </div>

        {/* Manager Info */}
        {employee.managerName && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-2">Reports to</p>
            <div className="flex items-center gap-2">
              <Avatar name={employee.managerName} size="sm" />
              <span className="text-sm font-medium text-gray-700">
                {employee.managerName}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-100 pt-4 flex gap-2">
          <Link to={`/admin/hr/employees/${employee.id}`} className="flex-1">
            <Button className="w-full" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Profile
            </Button>
          </Link>
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4" />
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
