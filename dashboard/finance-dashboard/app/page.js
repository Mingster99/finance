import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

/**
 * The gate. An unauthenticated visitor sees a sign-in button and nothing
 * else — no account names, no totals, no hint that any data exists.
 */
export default async function Home() {
  const session = await auth();

  if (session?.user?.email) {
    redirect("/dashboard");
  }

  return (
    <main className="gate">
      <h1>Miu Finance</h1>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit" className="btn">
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
