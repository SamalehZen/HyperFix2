import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard/mix2");
  return <>Coming Soon</>;
}
