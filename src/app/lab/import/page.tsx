import { JournalImportPage } from "@/components/lab/journal-import";
import { requireCurrentUser } from "@/lib/auth";

export default async function JournalImportRoute() {
  await requireCurrentUser();
  return <JournalImportPage />;
}
