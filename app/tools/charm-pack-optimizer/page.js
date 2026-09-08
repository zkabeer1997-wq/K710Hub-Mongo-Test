import { redirect } from "next/navigation";
export default async function CharmPackOptimizerPage({ searchParams }) {
  const params = await searchParams;
  const suffix = typeof params?.member_id === "string" ? `?member_id=${encodeURIComponent(params.member_id)}` : "";
  redirect(`/tools/governor-charm-optimizer${suffix}`);
}
