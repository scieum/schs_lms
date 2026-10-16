import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">볼 수 없는 화면이에요</h1>
      <p className="text-sm text-mute">권한이 필요하면 관리자 선생님께 문의해 주세요</p>
      <Link href="/" className="mt-2 rounded-control bg-key px-5 py-3 text-[15px] font-medium text-white">홈으로</Link>
    </main>
  );
}
