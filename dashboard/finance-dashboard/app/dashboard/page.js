import { auth, signOut } from "@/auth";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="shell">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ margin: 0 }}>Finance</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-quiet" style={{ padding: "8px 14px", fontSize: 13 }}>
            Sign out
          </button>
        </form>
      </div>

      <Dashboard email={session?.user?.email ?? ""} />
    </main>
  );
}
