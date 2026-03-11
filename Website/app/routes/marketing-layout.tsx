import { Outlet } from "react-router";
import { Navbar } from "~/components/navbar";
import { Footer } from "~/components/footer";

export default function MarketingLayout() {
  return (
    <>
      <Navbar />
      <main className="pt-[88px]">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
