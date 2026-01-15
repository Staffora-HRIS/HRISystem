import { Card, CardBody } from "~/components/ui/card";

export default function MyBenefitsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Benefits</h1>
        <p className="text-gray-500">Benefits details aren’t available in the portal yet.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">
          If you need benefits information, contact HR or check your company benefits provider portal.
        </CardBody>
      </Card>
    </div>
  );
}
