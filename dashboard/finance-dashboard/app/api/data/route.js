import { auth } from "@/auth";
import { fetchSheetData } from "@/lib/sheets";

/**
 * The only route that touches the sheet. The session is checked here, not
 * just in middleware, so this endpoint can never be called anonymously.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const data = await fetchSheetData();

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
