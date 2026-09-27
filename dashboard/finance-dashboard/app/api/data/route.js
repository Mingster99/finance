import { auth } from "@/auth";
import { fetchSheetData, sheetIdForEmail } from "@/lib/sheets";

/**
 * The only route that touches the sheet. The session is checked here, not
 * just in middleware, so this endpoint can never be called anonymously. The
 * spreadsheet is chosen from the authenticated email, so each user reads only
 * their own sheet.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sheetId = sheetIdForEmail(session.user.email);
  if (!sheetId) {
    return Response.json(
      { error: "No spreadsheet is configured for this account" },
      { status: 404 }
    );
  }

  try {
    const data = await fetchSheetData(sheetId);

    return Response.json(
      { ...data, fetchedAt: new Date().toISOString() },
      {
        headers: {
          // Short cache: the sheet changes about once a month.
          "Cache-Control": "private, max-age=60",
        },
      }
    );
  } catch (error) {
    console.error("Sheet read failed:", error);
    return Response.json(
      { error: "Could not read the spreadsheet", detail: error.message },
      { status: 500 }
    );
  }
}
