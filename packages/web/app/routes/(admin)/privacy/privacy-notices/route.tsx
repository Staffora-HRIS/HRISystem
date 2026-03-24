import { Navigate } from "react-router";

export default function PrivacyNoticesRedirect() {
  return <Navigate to="/admin/privacy/notices" replace />;
}
