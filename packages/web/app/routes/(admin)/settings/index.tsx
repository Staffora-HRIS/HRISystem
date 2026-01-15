import { Card, CardBody } from "~/components/ui/card";

export default function AdminSettingsIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500">Select a settings section from the sidebar.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No settings section selected.</CardBody>
      </Card>
    </div>
  );
}
