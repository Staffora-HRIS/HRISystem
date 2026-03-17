/**
 * Formal Notices Table
 *
 * Displays statutory notices (MATB1, SC3, etc.) for a family leave
 * entitlement with empty state and add button.
 */

import { Plus, FileText } from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "~/components/ui";
import type { Notice } from "./types";
import { formatDate, NOTICE_TYPE_LABELS } from "./types";

interface NoticesTableProps {
  notices: Notice[];
  onAddNotice: () => void;
}

export function NoticesTable({ notices, onAddNotice }: NoticesTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Formal Notices
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddNotice}
          >
            <Plus className="mr-1 h-4 w-4" />
            Record Notice
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {notices.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No formal notices recorded yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Notice Type</TableHeader>
                  <TableHeader>Notice Date</TableHeader>
                  <TableHeader>Received</TableHeader>
                  <TableHeader>Reference</TableHeader>
                  <TableHeader>Notes</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {notices.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell>
                      <Badge variant="info">
                        {NOTICE_TYPE_LABELS[notice.notice_type] ||
                          notice.notice_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(notice.notice_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(notice.received_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                        {notice.document_reference || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                        {notice.notes || "-"}
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
