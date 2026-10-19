import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/session";
import { getProjects, loadFiles } from "@/lib/client/data";
import { FileList } from "@/components/client/file-list";

export default async function FilesPage() {
  const session = await requireClient();
  if (session.membership.org.status === "lead") redirect("/angebot");
  const { current } = await getProjects(session.membership.org.id);
  if (!current) return <main className="flex-1" />;
  const files = await loadFiles(current.id, session.membership.org.id);
  return <FileList files={files} projectId={current.id} me={session.userId} />;
}
