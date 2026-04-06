import { renderInsightTodayPage } from "../page";

export default async function InsightTodayDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return renderInsightTodayPage(date);
}
