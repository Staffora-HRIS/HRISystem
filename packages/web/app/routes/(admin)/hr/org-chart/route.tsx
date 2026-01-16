import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Download,
  Maximize2,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { OrgChartViewer } from "~/components/org-chart";

export default function OrgChartPage() {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleExport = () => {
    window.print();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/hr")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Organization Chart
          </h1>
          <p className="text-gray-600">
            View your company's organizational structure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4 mr-2" />
            {isFullscreen ? "Exit" : "Fullscreen"}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Org Chart */}
      <Card className="overflow-hidden">
        <CardBody className="p-0">
          <OrgChartViewer className="min-h-[600px]" />
        </CardBody>
      </Card>
    </div>
  );
}
