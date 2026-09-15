import { redirect } from "next/navigation";
import { readUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await readUser();
  if (!user || user.role !== "admin") {
    redirect("/login?next=/admin");
  }
  return <>{children}</>;
}
