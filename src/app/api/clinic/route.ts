import { departments, doctors } from "@/lib/clinic";
import { databaseReady, failure, liveReady } from "@/lib/server";
import { availableSlots } from "@/lib/scheduling";
export async function GET() {
  try {
    return Response.json({
      departments,
      doctors,
      liveReady: liveReady(),
      databaseReady: databaseReady(),
      slots: databaseReady() ? await availableSlots() : [],
    });
  } catch (e) {
    return failure(e);
  }
}
