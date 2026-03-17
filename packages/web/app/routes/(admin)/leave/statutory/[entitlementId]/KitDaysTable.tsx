/**
 * KIT/SPLIT Days Table
 *
 * Displays Keeping In Touch (KIT) or Shared Parental Leave In Touch (SPLIT)
 * days with an empty state and add button.
 */

import { Plus, ClipboardCheck } from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "~/components/ui";
import type { KITDay } from "./types";
import { formatDate } from "./types";

interface KitDaysTableProps {
  kitDays: KITDay[];
  kitDaysUsed: number;
  kitDayMax: number;
  kitDaysRemaining: number;
  isSharedParental: boolean;
  onAddKitDay: () => void;
}

export function KitDaysTable({
  kitDays,
  kitDaysUsed,
  kitDayMax,
  kitDaysRemaining,
  isSharedParental,
  onAddKitDay,
}: KitDaysTableProps) {
  const dayType = isSharedParental ? "SPLIT" : "KIT";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {dayType} Days
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {kitDaysUsed} of {kitDayMax} used
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onAddKitDay}
              disabled={kitDaysRemaining <= 0}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {kitDays.length === 0 ? (
          <div className="py-8 text-center">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No {dayType} days recorded yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Hours Worked</TableHeader>
                  <TableHeader>Notes</TableHeader>
                  <TableHeader>Recorded</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {kitDays.map((day) => (
                  <TableRow key={day.id}>
                    <TableCell>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatDate(day.work_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {day.hours_worked}h
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                        {day.notes || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(day.created_at)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
