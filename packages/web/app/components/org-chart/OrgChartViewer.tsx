/**
 * Org Chart Viewer Component
 *
 * Displays an interactive organizational chart with zoom/pan capabilities.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, ChevronDown, ChevronRight, Search, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/lib/api-client";

interface OrgChartNode {
  id: string;
  employeeId: string;
  name: string;
  title?: string;
  department?: string;
  photoUrl?: string;
  managerId?: string;
  level: number;
  directReportsCount: number;
}

interface OrgChartData {
  nodes: OrgChartNode[];
  edges: Array<{ from: string; to: string }>;
}

interface OrgChartViewerProps {
  className?: string;
  onNodeClick?: (node: OrgChartNode) => void;
}

function buildTree(nodes: OrgChartNode[]): Map<string | undefined, OrgChartNode[]> {
  const tree = new Map<string | undefined, OrgChartNode[]>();

  for (const node of nodes) {
    const parentId = node.managerId;
    if (!tree.has(parentId)) {
      tree.set(parentId, []);
    }
    tree.get(parentId)!.push(node);
  }

  return tree;
}

interface OrgNodeProps {
  node: OrgChartNode;
  children: OrgChartNode[];
  tree: Map<string | undefined, OrgChartNode[]>;
  level: number;
  onNodeClick?: (node: OrgChartNode) => void;
  expandedNodes: Set<string>;
  toggleExpand: (id: string) => void;
  searchTerm: string;
}

function OrgNode({
  node,
  children,
  tree,
  level,
  onNodeClick,
  expandedNodes,
  toggleExpand,
  searchTerm,
}: OrgNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = children.length > 0;
  const matchesSearch =
    !searchTerm ||
    node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.title?.toLowerCase().includes(searchTerm.toLowerCase());

  if (!matchesSearch && !hasChildren) {
    return null;
  }

  return (
    <div className={cn("flex flex-col items-center", level > 0 && "mt-4")}>
      {/* Node Card */}
      <div
        className={cn(
          "relative flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md cursor-pointer min-w-[200px]",
          matchesSearch ? "border-blue-200" : "border-gray-100 opacity-50"
        )}
        onClick={() => onNodeClick?.(node)}
      >
        {/* Avatar */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          {node.photoUrl ? (
            <img
              src={node.photoUrl}
              alt={node.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <User className="h-5 w-5 text-gray-500" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{node.name}</p>
          {node.title && (
            <p className="text-xs text-gray-500 truncate">{node.title}</p>
          )}
          {node.department && (
            <p className="text-xs text-gray-400 truncate">{node.department}</p>
          )}
        </div>

        {/* Expand Button */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            className="p-1 rounded hover:bg-gray-100"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </button>
        )}

        {/* Direct Reports Badge */}
        {node.directReportsCount > 0 && (
          <span className="absolute -bottom-2 -right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium text-white">
            {node.directReportsCount}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="relative mt-4 flex flex-wrap justify-center gap-4">
          {/* Connector line */}
          <div className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 -translate-y-full bg-gray-200" />

          {children.map((child) => (
            <OrgNode
              key={child.id}
              node={child}
              children={tree.get(child.id) || []}
              tree={tree}
              level={level + 1}
              onNodeClick={onNodeClick}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgChartViewer({ className, onNodeClick }: OrgChartViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);

  const { data, isLoading, error } = useQuery<OrgChartData>({
    queryKey: ["org-chart"],
    queryFn: () => api.get<OrgChartData>("/hr/org-chart"),
  });

  const tree = useMemo(() => {
    if (!data?.nodes) return new Map();
    return buildTree(data.nodes);
  }, [data?.nodes]);

  const rootNodes = useMemo(() => {
    return tree.get(undefined) || [];
  }, [tree]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!data?.nodes) return;
    setExpandedNodes(new Set(data.nodes.map((n) => n.id)));
  }, [data?.nodes]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-red-500", className)}>
        Failed to load organization chart
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b bg-white p-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Collapse All
          </button>
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-2 rounded hover:bg-gray-100"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-500 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              className="p-2 rounded hover:bg-gray-100"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 overflow-auto bg-gray-50 p-8">
        <div
          className="min-w-max min-h-max transition-transform origin-top-left"
          style={{ transform: `scale(${zoom})` }}
        >
          <div className="flex justify-center">
            {rootNodes.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No organization structure found
              </div>
            ) : (
              rootNodes.map((root) => (
                <OrgNode
                  key={root.id}
                  node={root}
                  children={tree.get(root.id) || []}
                  tree={tree}
                  level={0}
                  onNodeClick={onNodeClick}
                  expandedNodes={expandedNodes}
                  toggleExpand={toggleExpand}
                  searchTerm={searchTerm}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrgChartViewer;
