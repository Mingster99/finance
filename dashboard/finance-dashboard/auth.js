import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Emails allowed to sign in. Anyone else is rejected at the door, even
 * with a valid Google account.
 */
function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;

      const allowed = allowedEmails();
      if (allowed.length === 0) {
        console.error("ALLOWED_EMAILS is empty — refusing all sign-ins.");
        return false;
      }

      return allowed.includes(email);
    },
  },
});
