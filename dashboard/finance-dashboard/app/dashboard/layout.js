import { signOut } from "@/auth";
import DashboardTabs from "./DashboardTabs";

/**
 * Shared shell for the dashboard section: the wordmark + sign-out header and
 * the Overview / Transactions tab nav sit here so both tabs share them.
 */
export default function DashboardLayout({ children }) {
  return (
    <main className="shell">
      <div className="dash-header">
        <span className="wordmark">Miu Finance</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="btn btn-quiet"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Sign out
          </button>
        </form>
      </div>

      <DashboardTabs />

      {children}
    </main>
  );
}
