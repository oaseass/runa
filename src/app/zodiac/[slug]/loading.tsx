// Shown by Next.js App Router while the new zodiac sign page loads.
// Provides the "loading ring" transition between sign switches.
export default function ZodiacLoading() {
  return (
    <div className="zdv-loading-screen" aria-label="불러오는 중">
      <div className="zdv-ring" role="status" aria-label="로딩 중" />
    </div>
  );
}
