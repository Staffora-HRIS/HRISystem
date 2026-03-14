/**
 * ChartRenderer — Renders actual charts using Recharts based on ChartConfig and data.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ChartConfig } from "./ChartBuilder";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
  "#84cc16", "#14b8a6", "#e11d48", "#7c3aed",
];

interface ChartRendererProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  columnLabels: Map<string, string>;
}

export function ChartRenderer({ config, data, columnLabels }: ChartRendererProps) {
  const { chartType, xAxis, yAxis, showLegend, showGrid, showLabels, title } = config;

  const getLabel = (key: string) => columnLabels.get(key) ?? key;

  // Transform data for pie/donut charts
  const pieData = useMemo(() => {
    if ((chartType !== "pie" && chartType !== "donut") || !xAxis || !yAxis?.length) return [];
    const yField = yAxis[0];
    const grouped = new Map<string, number>();
    for (const row of data) {
      const key = String(row[xAxis] ?? "Unknown");
      const val = Number(row[yField] ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + val);
    }
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [data, xAxis, yAxis, chartType]);

  if (!xAxis || !yAxis?.length || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <p className="text-sm text-gray-400">
          {data.length === 0
            ? "Run the report to see chart data"
            : "Configure X and Y axes to render chart"}
        </p>
      </div>
    );
  }

  // Bar Chart
  if (chartType === "bar" || chartType === "stacked_bar") {
    return (
      <div className="space-y-2">
        {title && <h4 className="text-sm font-medium text-gray-700 text-center">{title}</h4>}
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
            {showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
            <XAxis
              dataKey={xAxis}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            {showLegend !== false && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {yAxis.map((yKey, i) => (
              <Bar
                key={yKey}
                dataKey={yKey}
                name={getLabel(yKey)}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
                label={showLabels ? { position: "top", fontSize: 10 } : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Line Chart
  if (chartType === "line") {
    return (
      <div className="space-y-2">
        {title && <h4 className="text-sm font-medium text-gray-700 text-center">{title}</h4>}
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
            {showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
            <XAxis dataKey={xAxis} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            {showLegend !== false && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {yAxis.map((yKey, i) => (
              <Line
                key={yKey}
                type="monotone"
                dataKey={yKey}
                name={getLabel(yKey)}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Area Chart
  if (chartType === "area") {
    return (
      <div className="space-y-2">
        {title && <h4 className="text-sm font-medium text-gray-700 text-center">{title}</h4>}
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
            {showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
            <XAxis dataKey={xAxis} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            {showLegend !== false && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {yAxis.map((yKey, i) => (
              <Area
                key={yKey}
                type="monotone"
                dataKey={yKey}
                name={getLabel(yKey)}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Pie / Donut
  if (chartType === "pie" || chartType === "donut") {
    const innerRadius = chartType === "donut" ? 60 : 0;
    return (
      <div className="space-y-2">
        {title && <h4 className="text-sm font-medium text-gray-700 text-center">{title}</h4>}
        <ResponsiveContainer width="100%" height={360}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={120}
              innerRadius={innerRadius}
              label={showLabels !== false ? ({ name, percent }: any) =>
                `${name} (${(percent * 100).toFixed(0)}%)` : undefined
              }
              labelLine={showLabels !== false}
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            {showLegend !== false && <Legend wrapperStyle={{ fontSize: 12 }} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300">
      <p className="text-sm text-gray-400">Chart type &quot;{chartType}&quot; is not yet supported</p>
    </div>
  );
}
