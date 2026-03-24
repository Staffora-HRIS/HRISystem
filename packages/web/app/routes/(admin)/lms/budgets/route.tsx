export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DollarSign, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Budget {
  id: string;
  departmentId: string | null;
  financialYear: string;
  totalBudget: number;
  spent: number;
  committed: number;
  remaining: number;
  currency: string;
  createdAt: string;
}

interface Expense {
  id: string;
  budgetId: string;
  employeeId: string;
  description: string;
  amount: number;
  expenseDate: string;
  status: "pending" | "approved" | "rejected" | "paid";
  employeeName?: string;
  createdAt: string;
}

export default function TrainingBudgetsPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: budgetData, isLoading: budgetsLoading } = useQuery({
    queryKey: ["training-budgets"],
    queryFn: () => api.get<{ items: Budget[] }>("/training-budgets/budgets"),
  });

  const { data: expenseData, isLoading: expensesLoading } = useQuery({
    queryKey: ["training-expenses"],
    queryFn: () => api.get<{ items: Expense[] }>("/training-budgets/expenses"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/training-budgets/expenses/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["training-budgets"] });
    },
  });

  const budgets = budgetData?.items || [];
  const expenses = expenseData?.items || [];
  const isLoading = budgetsLoading || expensesLoading;

  const totalBudget = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalCommitted = budgets.reduce((sum, b) => sum + b.committed, 0);
  const pendingExpenses = expenses.filter(e => e.status === "pending").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge variant="success">Approved</Badge>;
      case "pending": return <Badge variant="warning">Pending</Badge>;
      case "rejected": return <Badge variant="error">Rejected</Badge>;
      case "paid": return <Badge variant="secondary">Paid</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Budgets</h1>
          <p className="text-gray-600">Manage department training budgets and expenses</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Budget
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Budget"
          value={formatCurrency(totalBudget)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Spent"
          value={formatCurrency(totalSpent)}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          title="Committed"
          value={formatCurrency(totalCommitted)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Expenses"
          value={pendingExpenses}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* Budgets Table */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4">Budgets</h2>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : budgets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No training budgets configured. Create one to start tracking training spend.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Financial Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Committed</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remaining</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisation</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {budgets.map((budget) => {
                    const utilisation = budget.totalBudget > 0
                      ? Math.round(((budget.spent + budget.committed) / budget.totalBudget) * 100)
                      : 0;
                    return (
                      <tr key={budget.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{budget.financialYear}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatCurrency(budget.totalBudget)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatCurrency(budget.spent)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatCurrency(budget.committed)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">{formatCurrency(budget.remaining)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${utilisation > 90 ? "bg-red-500" : utilisation > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                                style={{ width: `${Math.min(utilisation, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-600">{utilisation}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Pending Expenses */}
      {expenses.filter(e => e.status === "pending").length > 0 && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-4">Pending Expense Approvals</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {expenses.filter(e => e.status === "pending").map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{expense.employeeName || expense.employeeId}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{expense.description}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(expense.amount)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{expense.expenseDate}</td>
                      <td className="px-6 py-4">{getStatusBadge(expense.status)}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatus.mutate({ id: expense.id, status: "approved" })}
                          disabled={updateStatus.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatus.mutate({ id: expense.id, status: "rejected" })}
                          disabled={updateStatus.isPending}
                        >
                          Reject
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
